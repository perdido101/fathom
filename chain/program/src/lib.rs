//! Shadow Armada escrow — devnet and localnet only.
//!
//! The program deliberately knows nothing about the game, and cannot. Both
//! boards are secret, so any move written here would have to be a hash, and a
//! chain that stores hashes it cannot interpret is a notary, not a referee.
//! Writing twenty rounds on-chain would cost twenty transactions and buy
//! nothing the commitment scheme does not already provide.
//!
//! So it does the two things a chain is actually good for: it holds the stake,
//! and it timestamps the commitments that make the off-chain transcript
//! checkable afterwards.
//!
//!   0 open_match      — escrow both stakes, record the seed commitment
//!   1 commit_setup    — record a player's deployment commitment, once, immutably
//!   2 settle          — record result + reveals, pay out, take the rake
//!   3 reclaim         — after the window, either player takes their own stake back
//!   4 open_bracket    — first entrant opens an 8-seat tournament escrow and stakes
//!   5 join_bracket    — an entrant stakes into a forming bracket; the 8th fills it
//!   6 settle_bracket  — referee posts final standings, pays 55/25/10/10 of the
//!                       post-rake pot (champion keeps the division dust)
//!   7 reclaim_bracket — an entrant recovers their own stake from a bracket that
//!                       never filled (after the fill window) or stalled after
//!                       filling (after the settle window)
//!
//! Anyone can then take the seed reveal, the deployment reveals and the signed
//! move transcript and replay the match with `verify()` in the TypeScript
//! engine. If the reported winner does not follow from the rules, the proof is
//! public and permanent.
//!
//! One PDA per match holds both the record and the lamports. Keeping the money
//! in the same account as the state means a match can never be half-funded or
//! settled against a vault that belongs to a different match.
//!
//! Known limitation, stated rather than hidden: settlement authority is a
//! referee key. A referee cannot forge a match — the transcript would not
//! replay — but it can refuse to settle one. `reclaim` is the answer, and it is
//! deliberately blunt. Hardening that is the work before mainnet.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

pub const RAKE_BPS: u64 = 500; // 5%
#[cfg(not(feature = "fast-reclaim"))]
pub const SETTLE_WINDOW_SECS: i64 = 30 * 60;
#[cfg(feature = "fast-reclaim")]
pub const SETTLE_WINDOW_SECS: i64 = 0;
pub const STATE_LEN: usize = 314;

// Tournament brackets: 8 seats, single elimination. The payout curve is the
// reason to enter over arena — quarter-final losers get nothing.
pub const BRACKET_SEATS: usize = 8;
pub const CHAMPION_BPS: u64 = 5_500;
pub const RUNNER_BPS: u64 = 2_500;
pub const SEMI_BPS: u64 = 1_000;
#[cfg(not(feature = "fast-reclaim"))]
pub const FILL_WINDOW_SECS: i64 = 10 * 60;
#[cfg(feature = "fast-reclaim")]
pub const FILL_WINDOW_SECS: i64 = 0;
pub const BRACKET_LEN: usize = 391;

const STATUS_OPEN: u8 = 0;
const STATUS_LIVE: u8 = 1;
const STATUS_SETTLED: u8 = 2;

const OUTCOME_WIN_A: u8 = 0;
const OUTCOME_WIN_B: u8 = 1;
const OUTCOME_DRAW: u8 = 2;
const OUTCOME_NONE: u8 = 255;

// Byte offsets into the match record.
const O_STATUS: usize = 0;
const O_MATCH_ID: usize = 1;
const O_PLAYER_A: usize = 33;
const O_PLAYER_B: usize = 65;
const O_REFEREE: usize = 97;
const O_STAKE: usize = 129;
const O_SEED_COMMIT: usize = 137;
const O_SEED: usize = 169;
const O_SETUP_A: usize = 201;
const O_SETUP_B: usize = 233;
const O_TRANSCRIPT: usize = 265;
const O_OUTCOME: usize = 297;
const O_OPENED_AT: usize = 298;
const O_SETTLED_AT: usize = 306;

entrypoint!(process);

pub fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let (tag, rest) = data.split_first().ok_or(ProgramError::InvalidInstructionData)?;
    match tag {
        0 => open_match(program_id, accounts, rest),
        1 => commit_setup(program_id, accounts, rest),
        2 => settle(program_id, accounts, rest),
        3 => reclaim(program_id, accounts),
        4 => open_bracket(program_id, accounts, rest),
        5 => join_bracket(program_id, accounts),
        6 => settle_bracket(program_id, accounts, rest),
        7 => reclaim_bracket(program_id, accounts),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

// Byte offsets into the bracket record.
const B_STATUS: usize = 0;
const B_BRACKET_ID: usize = 1;
const B_REFEREE: usize = 33;
const B_STAKE: usize = 65;
const B_OPENED_AT: usize = 73;
const B_FULL_AT: usize = 81;
const B_JOINED: usize = 89;
const B_REFUNDED: usize = 90; // bitmap, one bit per seat
const B_RESULT: usize = 91; // champion, runner-up, semi loser, semi loser
const B_TRANSCRIPT: usize = 95; // root hash over the bracket's match transcripts
const B_SETTLED_AT: usize = 127;
const B_PLAYERS: usize = 135; // 8 × 32

const B_FORMING: u8 = 0;
const B_FULL: u8 = 1;
const B_SETTLED: u8 = 2;

fn bracket_seeds<'a>(bracket_id: &'a [u8; 32]) -> [&'a [u8]; 2] {
    [b"bracket", bracket_id.as_slice()]
}

fn bracket_player(d: &[u8], seat: usize) -> [u8; 32] {
    d[B_PLAYERS + seat * 32..B_PLAYERS + seat * 32 + 32]
        .try_into()
        .unwrap()
}

/// The first entrant opens the bracket escrow and stakes into it.
fn open_bracket(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let bracket_ai = next_account_info(it)?;
    let opener = next_account_info(it)?;
    let referee = next_account_info(it)?;
    let system = next_account_info(it)?;

    if !opener.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let bracket_id = read32(data, 0)?;
    let stake = u64::from_le_bytes(
        data.get(32..40)
            .ok_or(ProgramError::InvalidInstructionData)?
            .try_into()
            .unwrap(),
    );
    if stake == 0 {
        return Err(ProgramError::InvalidInstructionData);
    }

    let seeds = bracket_seeds(&bracket_id);
    let (expected, bump) = Pubkey::find_program_address(&seeds, program_id);
    if expected != *bracket_ai.key {
        msg!("bracket account is not the PDA for this bracket id");
        return Err(ProgramError::InvalidArgument);
    }
    if !bracket_ai.data_is_empty() {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let rent = Rent::get()?.minimum_balance(BRACKET_LEN);
    let bump_arr = [bump];
    let signer: &[&[u8]] = &[seeds[0], seeds[1], &bump_arr];
    invoke_signed(
        &system_instruction::create_account(
            opener.key,
            bracket_ai.key,
            rent,
            BRACKET_LEN as u64,
            program_id,
        ),
        &[opener.clone(), bracket_ai.clone(), system.clone()],
        &[signer],
    )?;
    invoke(
        &system_instruction::transfer(opener.key, bracket_ai.key, stake),
        &[opener.clone(), bracket_ai.clone(), system.clone()],
    )?;

    let clock = Clock::get()?;
    let mut d = bracket_ai.try_borrow_mut_data()?;
    d[B_STATUS] = B_FORMING;
    d[B_BRACKET_ID..B_BRACKET_ID + 32].copy_from_slice(&bracket_id);
    d[B_REFEREE..B_REFEREE + 32].copy_from_slice(referee.key.as_ref());
    d[B_STAKE..B_STAKE + 8].copy_from_slice(&stake.to_le_bytes());
    d[B_OPENED_AT..B_OPENED_AT + 8].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
    d[B_JOINED] = 1;
    for r in &mut d[B_RESULT..B_RESULT + 4] {
        *r = 255;
    }
    d[B_PLAYERS..B_PLAYERS + 32].copy_from_slice(opener.key.as_ref());
    msg!("bracket opened, stake {} per seat", stake);
    Ok(())
}

/// An entrant stakes into a forming bracket. The eighth seat fills it — a
/// bracket only ever starts full, so byes cannot exist.
fn join_bracket(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let bracket_ai = next_account_info(it)?;
    let player = next_account_info(it)?;
    let system = next_account_info(it)?;

    if bracket_ai.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    if !player.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let stake;
    {
        let d = bracket_ai.try_borrow_data()?;
        if d[B_STATUS] != B_FORMING {
            msg!("bracket is not forming");
            return Err(ProgramError::InvalidAccountData);
        }
        let joined = d[B_JOINED] as usize;
        if joined >= BRACKET_SEATS {
            return Err(ProgramError::InvalidAccountData);
        }
        let key = player.key.to_bytes();
        for seat in 0..joined {
            if bracket_player(&d, seat) == key {
                msg!("already seated in this bracket");
                return Err(ProgramError::InvalidArgument);
            }
        }
        stake = u64::from_le_bytes(d[B_STAKE..B_STAKE + 8].try_into().unwrap());
    }

    invoke(
        &system_instruction::transfer(player.key, bracket_ai.key, stake),
        &[player.clone(), bracket_ai.clone(), system.clone()],
    )?;

    let clock = Clock::get()?;
    let mut d = bracket_ai.try_borrow_mut_data()?;
    let joined = d[B_JOINED] as usize;
    let at = B_PLAYERS + joined * 32;
    d[at..at + 32].copy_from_slice(player.key.as_ref());
    d[B_JOINED] = (joined + 1) as u8;
    if joined + 1 == BRACKET_SEATS {
        d[B_STATUS] = B_FULL;
        d[B_FULL_AT..B_FULL_AT + 8].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
        msg!("bracket full; play begins");
    }
    Ok(())
}

/// The referee posts final standings and the escrow pays the curve:
/// 5% rake off the pot, then champion 55%, runner-up 25%, each losing
/// semifinalist 10% of the remainder. Integer division dust goes to the
/// champion, so the account always empties to exactly the rent floor.
fn settle_bracket(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let bracket_ai = next_account_info(it)?;
    let champion = next_account_info(it)?;
    let runner = next_account_info(it)?;
    let semi3 = next_account_info(it)?;
    let semi4 = next_account_info(it)?;
    let treasury = next_account_info(it)?;
    let referee = next_account_info(it)?;

    if bracket_ai.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    if !referee.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if data.len() < 4 + 32 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let places = [data[0], data[1], data[2], data[3]];
    let transcript = read32(data, 4)?;

    let stake;
    {
        let d = bracket_ai.try_borrow_data()?;
        if d[B_STATUS] != B_FULL {
            msg!("bracket is not full and unsettled");
            return Err(ProgramError::InvalidAccountData);
        }
        if d[B_REFEREE..B_REFEREE + 32] != referee.key.to_bytes() {
            msg!("signer is not the referee for this bracket");
            return Err(ProgramError::InvalidArgument);
        }
        // Four distinct seats, and each paid account must be the recorded
        // key for its claimed seat — the referee cannot redirect a payout.
        for (i, p) in places.iter().enumerate() {
            if *p as usize >= BRACKET_SEATS {
                return Err(ProgramError::InvalidInstructionData);
            }
            for q in places.iter().skip(i + 1) {
                if p == q {
                    return Err(ProgramError::InvalidInstructionData);
                }
            }
        }
        let paid = [champion, runner, semi3, semi4];
        for (slot, ai) in places.iter().zip(paid.iter()) {
            if bracket_player(&d, *slot as usize) != ai.key.to_bytes() {
                msg!("paid account does not hold seat {}", slot);
                return Err(ProgramError::InvalidArgument);
            }
        }
        stake = u64::from_le_bytes(d[B_STAKE..B_STAKE + 8].try_into().unwrap());
    }

    let pot = stake
        .checked_mul(BRACKET_SEATS as u64)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let rake = pot.checked_mul(RAKE_BPS).ok_or(ProgramError::ArithmeticOverflow)? / 10_000;
    let net = pot.checked_sub(rake).ok_or(ProgramError::ArithmeticOverflow)?;
    let to_runner = net.checked_mul(RUNNER_BPS).ok_or(ProgramError::ArithmeticOverflow)? / 10_000;
    let to_semi = net.checked_mul(SEMI_BPS).ok_or(ProgramError::ArithmeticOverflow)? / 10_000;
    let to_champion = net
        .checked_sub(to_runner)
        .and_then(|x| x.checked_sub(to_semi * 2))
        .ok_or(ProgramError::ArithmeticOverflow)?;

    pay(bracket_ai, champion, to_champion)?;
    pay(bracket_ai, runner, to_runner)?;
    pay(bracket_ai, semi3, to_semi)?;
    pay(bracket_ai, semi4, to_semi)?;
    pay(bracket_ai, treasury, rake)?;

    let clock = Clock::get()?;
    let mut d = bracket_ai.try_borrow_mut_data()?;
    d[B_RESULT..B_RESULT + 4].copy_from_slice(&places);
    d[B_TRANSCRIPT..B_TRANSCRIPT + 32].copy_from_slice(&transcript);
    d[B_STATUS] = B_SETTLED;
    d[B_SETTLED_AT..B_SETTLED_AT + 8].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
    msg!("bracket settled: champion seat {}", places[0]);
    Ok(())
}

/// An entrant recovers their own stake — from a bracket that never filled
/// (after the fill window) or one that filled and was never settled (after
/// the settle window). Each seat reclaims independently and exactly once, so
/// no caller can touch anyone else's stake and no server fault can strand
/// funds. Entitlement beyond the stake exists only through settle_bracket,
/// whose standings must replay from the signed match transcripts.
fn reclaim_bracket(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let bracket_ai = next_account_info(it)?;
    let caller = next_account_info(it)?;

    if bracket_ai.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    if !caller.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let stake;
    let seat;
    {
        let d = bracket_ai.try_borrow_data()?;
        let status = d[B_STATUS];
        if status == B_SETTLED {
            msg!("already settled");
            return Err(ProgramError::InvalidAccountData);
        }
        let now = Clock::get()?.unix_timestamp;
        let window_open = if status == B_FORMING {
            let opened = i64::from_le_bytes(d[B_OPENED_AT..B_OPENED_AT + 8].try_into().unwrap());
            now - opened >= FILL_WINDOW_SECS
        } else {
            let full_at = i64::from_le_bytes(d[B_FULL_AT..B_FULL_AT + 8].try_into().unwrap());
            now - full_at >= SETTLE_WINDOW_SECS
        };
        if !window_open {
            msg!("reclaim window has not elapsed");
            return Err(ProgramError::InvalidArgument);
        }
        let joined = d[B_JOINED] as usize;
        let key = caller.key.to_bytes();
        let mut found = None;
        for s in 0..joined {
            if bracket_player(&d, s) == key {
                found = Some(s);
                break;
            }
        }
        seat = match found {
            Some(s) => s,
            None => {
                msg!("caller is not seated in this bracket");
                return Err(ProgramError::InvalidArgument);
            }
        };
        if d[B_REFUNDED] & (1 << seat) != 0 {
            msg!("seat already refunded");
            return Err(ProgramError::InvalidAccountData);
        }
        stake = u64::from_le_bytes(d[B_STAKE..B_STAKE + 8].try_into().unwrap());
    }

    pay(bracket_ai, caller, stake)?;

    let clock = Clock::get()?;
    let mut d = bracket_ai.try_borrow_mut_data()?;
    d[B_REFUNDED] |= 1 << seat;
    let joined = d[B_JOINED] as usize;
    let all = (1u16 << joined) - 1;
    if u16::from(d[B_REFUNDED]) == all {
        d[B_STATUS] = B_SETTLED;
        d[B_SETTLED_AT..B_SETTLED_AT + 8].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
        msg!("all seats refunded; bracket closed");
    }
    Ok(())
}

fn read32(src: &[u8], at: usize) -> Result<[u8; 32], ProgramError> {
    src.get(at..at + 32)
        .ok_or(ProgramError::InvalidInstructionData)?
        .try_into()
        .map_err(|_| ProgramError::InvalidInstructionData)
}

fn match_seeds<'a>(match_id: &'a [u8; 32]) -> [&'a [u8]; 2] {
    [b"match", match_id.as_slice()]
}

/// Escrow both stakes and publish the seed commitment.
fn open_match(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let match_ai = next_account_info(it)?;
    let player_a = next_account_info(it)?;
    let player_b = next_account_info(it)?;
    let referee = next_account_info(it)?;
    let system = next_account_info(it)?;

    if !player_a.is_signer || !player_b.is_signer {
        msg!("both players must sign the escrow");
        return Err(ProgramError::MissingRequiredSignature);
    }

    let match_id = read32(data, 0)?;
    let stake = u64::from_le_bytes(
        data.get(32..40)
            .ok_or(ProgramError::InvalidInstructionData)?
            .try_into()
            .unwrap(),
    );
    let seed_commit = read32(data, 40)?;

    let seeds = match_seeds(&match_id);
    let (expected, bump) = Pubkey::find_program_address(&seeds, program_id);
    if expected != *match_ai.key {
        msg!("match account is not the PDA for this match id");
        return Err(ProgramError::InvalidArgument);
    }
    if !match_ai.data_is_empty() {
        msg!("match already exists");
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    // The record and the money live in the same account, so a match can never
    // be settled against a vault belonging to a different one.
    // The account being created is a PDA, so it has to sign for itself with
    // its seeds. There is no fallback path here on purpose: a failed CPI
    // aborts the whole transaction, so anything written as a retry would be
    // dead code that reads like a safety net.
    let rent = Rent::get()?.minimum_balance(STATE_LEN);
    let bump_arr = [bump];
    let signer: &[&[u8]] = &[seeds[0], seeds[1], &bump_arr];
    invoke_signed(
        &system_instruction::create_account(
            player_a.key,
            match_ai.key,
            rent,
            STATE_LEN as u64,
            program_id,
        ),
        &[player_a.clone(), match_ai.clone(), system.clone()],
        &[signer],
    )?;

    // Both stakes move in the same transaction. A half-funded match is not a
    // state this program can reach.
    for who in [player_a, player_b] {
        invoke(
            &system_instruction::transfer(who.key, match_ai.key, stake),
            &[who.clone(), match_ai.clone(), system.clone()],
        )?;
    }

    let clock = Clock::get()?;
    let mut d = match_ai.try_borrow_mut_data()?;
    d[O_STATUS] = STATUS_OPEN;
    d[O_MATCH_ID..O_MATCH_ID + 32].copy_from_slice(&match_id);
    d[O_PLAYER_A..O_PLAYER_A + 32].copy_from_slice(player_a.key.as_ref());
    d[O_PLAYER_B..O_PLAYER_B + 32].copy_from_slice(player_b.key.as_ref());
    d[O_REFEREE..O_REFEREE + 32].copy_from_slice(referee.key.as_ref());
    d[O_STAKE..O_STAKE + 8].copy_from_slice(&stake.to_le_bytes());
    d[O_SEED_COMMIT..O_SEED_COMMIT + 32].copy_from_slice(&seed_commit);
    d[O_OUTCOME] = OUTCOME_NONE;
    d[O_OPENED_AT..O_OPENED_AT + 8].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
    msg!("match opened, stake {} each", stake);
    Ok(())
}

/// Record a player's deployment commitment. Once written it cannot change.
fn commit_setup(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let match_ai = next_account_info(it)?;
    let player = next_account_info(it)?;
    if match_ai.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    if !player.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    let commitment = read32(data, 0)?;

    let mut d = match_ai.try_borrow_mut_data()?;
    if d[O_STATUS] != STATUS_OPEN {
        msg!("match is not open for setup");
        return Err(ProgramError::InvalidAccountData);
    }
    let a: [u8; 32] = d[O_PLAYER_A..O_PLAYER_A + 32].try_into().unwrap();
    let b: [u8; 32] = d[O_PLAYER_B..O_PLAYER_B + 32].try_into().unwrap();
    let key = player.key.to_bytes();

    let slot = if key == a {
        O_SETUP_A
    } else if key == b {
        O_SETUP_B
    } else {
        msg!("signer is not a player in this match");
        return Err(ProgramError::InvalidArgument);
    };
    if d[slot..slot + 32] != [0u8; 32] {
        msg!("setup already committed");
        return Err(ProgramError::InvalidAccountData);
    }
    d[slot..slot + 32].copy_from_slice(&commitment);

    if d[O_SETUP_A..O_SETUP_A + 32] != [0u8; 32] && d[O_SETUP_B..O_SETUP_B + 32] != [0u8; 32] {
        d[O_STATUS] = STATUS_LIVE;
        msg!("both fleets committed; match is live");
    }
    Ok(())
}

/// Publish the result and the reveals, then pay out.
fn settle(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let match_ai = next_account_info(it)?;
    let player_a = next_account_info(it)?;
    let player_b = next_account_info(it)?;
    let treasury = next_account_info(it)?;
    let referee = next_account_info(it)?;

    if match_ai.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    if !referee.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let outcome = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    let seed = read32(data, 1)?;
    let transcript = read32(data, 33)?;

    let stake;
    {
        let d = match_ai.try_borrow_data()?;
        if d[O_STATUS] != STATUS_LIVE {
            msg!("match is not live");
            return Err(ProgramError::InvalidAccountData);
        }
        if d[O_REFEREE..O_REFEREE + 32] != referee.key.to_bytes() {
            msg!("signer is not the referee for this match");
            return Err(ProgramError::InvalidArgument);
        }
        if d[O_PLAYER_A..O_PLAYER_A + 32] != player_a.key.to_bytes()
            || d[O_PLAYER_B..O_PLAYER_B + 32] != player_b.key.to_bytes()
        {
            msg!("player accounts do not match the record");
            return Err(ProgramError::InvalidArgument);
        }
        stake = u64::from_le_bytes(d[O_STAKE..O_STAKE + 8].try_into().unwrap());
    }

    let pot = stake.checked_mul(2).ok_or(ProgramError::ArithmeticOverflow)?;
    match outcome {
        // A draw returns both stakes in full and takes no rake. Charging on a
        // draw would bleed both players for a match nobody won, which is the
        // one outcome that has to stay costless.
        OUTCOME_DRAW => {
            pay(match_ai, player_a, stake)?;
            pay(match_ai, player_b, stake)?;
        }
        OUTCOME_WIN_A | OUTCOME_WIN_B => {
            let rake = pot.checked_mul(RAKE_BPS).ok_or(ProgramError::ArithmeticOverflow)? / 10_000;
            let winnings = pot.checked_sub(rake).ok_or(ProgramError::ArithmeticOverflow)?;
            let winner = if outcome == OUTCOME_WIN_A { player_a } else { player_b };
            pay(match_ai, winner, winnings)?;
            pay(match_ai, treasury, rake)?;
        }
        _ => return Err(ProgramError::InvalidInstructionData),
    }

    let clock = Clock::get()?;
    let mut d = match_ai.try_borrow_mut_data()?;
    d[O_SEED..O_SEED + 32].copy_from_slice(&seed);
    d[O_TRANSCRIPT..O_TRANSCRIPT + 32].copy_from_slice(&transcript);
    d[O_OUTCOME] = outcome;
    d[O_STATUS] = STATUS_SETTLED;
    d[O_SETTLED_AT..O_SETTLED_AT + 8].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
    msg!("settled, outcome {}", outcome);
    Ok(())
}

/// If nobody settles inside the window, either player can recover both stakes
/// to their owners. This is what stops a silent referee freezing funds, and it
/// cannot be griefed: it always pays each player their own stake back, whoever
/// calls it.
fn reclaim(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    let it = &mut accounts.iter();
    let match_ai = next_account_info(it)?;
    let player_a = next_account_info(it)?;
    let player_b = next_account_info(it)?;
    let caller = next_account_info(it)?;

    if match_ai.owner != program_id {
        return Err(ProgramError::IllegalOwner);
    }
    if !caller.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let stake;
    {
        let d = match_ai.try_borrow_data()?;
        if d[O_STATUS] == STATUS_SETTLED {
            msg!("already settled");
            return Err(ProgramError::InvalidAccountData);
        }
        if d[O_PLAYER_A..O_PLAYER_A + 32] != player_a.key.to_bytes()
            || d[O_PLAYER_B..O_PLAYER_B + 32] != player_b.key.to_bytes()
        {
            return Err(ProgramError::InvalidArgument);
        }
        let caller_key = caller.key.to_bytes();
        if d[O_PLAYER_A..O_PLAYER_A + 32] != caller_key && d[O_PLAYER_B..O_PLAYER_B + 32] != caller_key
        {
            msg!("only a player in this match may reclaim");
            return Err(ProgramError::InvalidArgument);
        }
        let opened = i64::from_le_bytes(d[O_OPENED_AT..O_OPENED_AT + 8].try_into().unwrap());
        if Clock::get()?.unix_timestamp - opened < SETTLE_WINDOW_SECS {
            msg!("settle window has not elapsed");
            return Err(ProgramError::InvalidArgument);
        }
        stake = u64::from_le_bytes(d[O_STAKE..O_STAKE + 8].try_into().unwrap());
    }

    pay(match_ai, player_a, stake)?;
    pay(match_ai, player_b, stake)?;

    let clock = Clock::get()?;
    let mut d = match_ai.try_borrow_mut_data()?;
    d[O_OUTCOME] = OUTCOME_DRAW;
    d[O_STATUS] = STATUS_SETTLED;
    d[O_SETTLED_AT..O_SETTLED_AT + 8].copy_from_slice(&clock.unix_timestamp.to_le_bytes());
    msg!("reclaimed, both stakes returned");
    Ok(())
}

/// Move lamports out of the match account. The program owns it, so this is a
/// direct debit rather than a system transfer; the rent-exempt minimum stays
/// behind so the record survives to be audited.
fn pay(from: &AccountInfo, to: &AccountInfo, lamports: u64) -> ProgramResult {
    if lamports == 0 {
        return Ok(());
    }
    let rent_floor = Rent::get()?.minimum_balance(from.data_len());
    let available = from.lamports().saturating_sub(rent_floor);
    if available < lamports {
        msg!("escrow does not hold enough to pay {}", lamports);
        return Err(ProgramError::InsufficientFunds);
    }
    **from.try_borrow_mut_lamports()? -= lamports;
    **to.try_borrow_mut_lamports()? += lamports;
    Ok(())
}
