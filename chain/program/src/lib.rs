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
//!   0 open_match   — escrow both stakes, record the seed commitment
//!   1 commit_setup — record a player's deployment commitment, once, immutably
//!   2 settle       — record result + reveals, pay out, take the rake
//!   3 reclaim      — after the window, either player takes their own stake back
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
        _ => Err(ProgramError::InvalidInstructionData),
    }
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
    let rent_floor = Rent::get()?.minimum_balance(STATE_LEN);
    let available = from.lamports().saturating_sub(rent_floor);
    if available < lamports {
        msg!("escrow does not hold enough to pay {}", lamports);
        return Err(ProgramError::InsufficientFunds);
    }
    **from.try_borrow_mut_lamports()? -= lamports;
    **to.try_borrow_mut_lamports()? += lamports;
    Ok(())
}
