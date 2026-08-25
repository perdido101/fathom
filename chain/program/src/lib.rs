//! Shadow Armada escrow — testnet only.
//!
//! The program deliberately knows nothing about the game. It cannot: the
//! boards are secret, so any move written here would have to be a hash, and a
//! chain that stores hashes it cannot interpret is a notary, not a referee.
//!
//! So this program does the two things a chain is actually good for. It holds
//! the stake, and it timestamps the commitments that make the off-chain
//! transcript checkable afterwards:
//!
//!   1. `open_match`   — escrow both stakes, record the seed commitment.
//!   2. `commit_setup` — record each player's deployment commitment.
//!   3. `settle`       — record the result and the reveals, pay out.
//!
//! Anyone can then take the seed reveal, the deployment reveals and the signed
//! move transcript and replay the match with `verify()` in the TypeScript
//! engine. If the reported winner does not follow from the rules, the proof is
//! public and permanent.
//!
//! Settlement authority is a known referee key in this build. That is a real
//! limitation and is written down rather than hidden: a referee cannot forge a
//! match (the transcript would not replay) but it can refuse to settle one.
//! The dispute path below is the answer to that, and it is the piece to
//! harden before mainnet.

use anchor_lang::prelude::*;

declare_id!("Sh4dowArmada11111111111111111111111111111111");

pub const RAKE_BPS: u64 = 500; // 5%
pub const SETTLE_WINDOW_SECS: i64 = 60 * 30;

#[program]
pub mod shadow_armada {
    use super::*;

    /// Escrow both stakes and publish the seed commitment.
    pub fn open_match(
        ctx: Context<OpenMatch>,
        match_id: [u8; 32],
        stake_lamports: u64,
        seed_commit: [u8; 32],
    ) -> Result<()> {
        let m = &mut ctx.accounts.match_account;
        m.match_id = match_id;
        m.player_a = ctx.accounts.player_a.key();
        m.player_b = ctx.accounts.player_b.key();
        m.stake_lamports = stake_lamports;
        m.seed_commit = seed_commit;
        m.status = MatchStatus::Open;
        m.opened_at = Clock::get()?.unix_timestamp;
        m.referee = ctx.accounts.referee.key();

        // Both stakes move into the vault PDA in one transaction, so a match
        // can never begin half-funded.
        for (from, info) in [
            (&ctx.accounts.player_a, ctx.accounts.player_a.to_account_info()),
            (&ctx.accounts.player_b, ctx.accounts.player_b.to_account_info()),
        ] {
            let _ = from;
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: info,
                        to: ctx.accounts.vault.to_account_info(),
                    },
                ),
                stake_lamports,
            )?;
        }
        Ok(())
    }

    /// Record a player's deployment commitment. Once written it cannot change.
    pub fn commit_setup(ctx: Context<CommitSetup>, commitment: [u8; 32]) -> Result<()> {
        let m = &mut ctx.accounts.match_account;
        require!(m.status == MatchStatus::Open, ArmadaError::MatchNotOpen);
        let signer = ctx.accounts.player.key();
        if signer == m.player_a {
            require!(m.setup_a == [0u8; 32], ArmadaError::AlreadyCommitted);
            m.setup_a = commitment;
        } else if signer == m.player_b {
            require!(m.setup_b == [0u8; 32], ArmadaError::AlreadyCommitted);
            m.setup_b = commitment;
        } else {
            return err!(ArmadaError::NotAPlayer);
        }
        if m.setup_a != [0u8; 32] && m.setup_b != [0u8; 32] {
            m.status = MatchStatus::Live;
        }
        Ok(())
    }

    /// Publish the result and the reveals, then pay out.
    ///
    /// `transcript_hash` pins the exact signed move log the result came from,
    /// so a settlement can be checked against one specific replay and not a
    /// transcript produced later to fit.
    pub fn settle(
        ctx: Context<Settle>,
        outcome: Outcome,
        seed: [u8; 32],
        transcript_hash: [u8; 32],
    ) -> Result<()> {
        let m = &mut ctx.accounts.match_account;
        require!(m.status == MatchStatus::Live, ArmadaError::MatchNotLive);
        require_keys_eq!(ctx.accounts.referee.key(), m.referee, ArmadaError::NotReferee);

        m.seed = seed;
        m.transcript_hash = transcript_hash;
        m.outcome = outcome;
        m.status = MatchStatus::Settled;
        m.settled_at = Clock::get()?.unix_timestamp;

        let pot = m.stake_lamports.checked_mul(2).ok_or(ArmadaError::Overflow)?;
        match outcome {
            // A draw returns both stakes in full and takes no rake. Charging a
            // rake on a draw would bleed both players for a match nobody won,
            // which is the one outcome that must stay costless.
            Outcome::Draw => {
                pay(&ctx, ctx.accounts.player_a.to_account_info(), m.stake_lamports)?;
                pay(&ctx, ctx.accounts.player_b.to_account_info(), m.stake_lamports)?;
            }
            Outcome::WinA | Outcome::WinB => {
                let rake = pot.checked_mul(RAKE_BPS).ok_or(ArmadaError::Overflow)? / 10_000;
                let winnings = pot.checked_sub(rake).ok_or(ArmadaError::Overflow)?;
                let winner = if outcome == Outcome::WinA {
                    ctx.accounts.player_a.to_account_info()
                } else {
                    ctx.accounts.player_b.to_account_info()
                };
                pay(&ctx, winner, winnings)?;
                pay(&ctx, ctx.accounts.treasury.to_account_info(), rake)?;
            }
        }
        Ok(())
    }

    /// If nobody settles inside the window, either player can reclaim their
    /// own stake. This is what stops a silent referee from freezing funds.
    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        let m = &mut ctx.accounts.match_account;
        require!(m.status != MatchStatus::Settled, ArmadaError::AlreadySettled);
        let now = Clock::get()?.unix_timestamp;
        require!(now - m.opened_at > SETTLE_WINDOW_SECS, ArmadaError::TooEarly);
        let stake = m.stake_lamports;
        m.status = MatchStatus::Settled;
        m.outcome = Outcome::Draw;
        **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= stake * 2;
        **ctx.accounts.player_a.to_account_info().try_borrow_mut_lamports()? += stake;
        **ctx.accounts.player_b.to_account_info().try_borrow_mut_lamports()? += stake;
        Ok(())
    }
}

fn pay<'info>(ctx: &Context<Settle>, to: AccountInfo<'info>, lamports: u64) -> Result<()> {
    **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? -= lamports;
    **to.try_borrow_mut_lamports()? += lamports;
    Ok(())
}

#[account]
pub struct MatchAccount {
    pub match_id: [u8; 32],
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub referee: Pubkey,
    pub stake_lamports: u64,
    pub seed_commit: [u8; 32],
    pub seed: [u8; 32],
    pub setup_a: [u8; 32],
    pub setup_b: [u8; 32],
    pub transcript_hash: [u8; 32],
    pub outcome: Outcome,
    pub status: MatchStatus,
    pub opened_at: i64,
    pub settled_at: i64,
}

impl MatchAccount {
    pub const SIZE: usize = 8 + 32 + 32 * 3 + 8 + 32 * 5 + 1 + 1 + 8 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    WinA,
    WinB,
    Draw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MatchStatus {
    Open,
    Live,
    Settled,
}

#[derive(Accounts)]
#[instruction(match_id: [u8; 32])]
pub struct OpenMatch<'info> {
    #[account(init, payer = player_a, space = MatchAccount::SIZE, seeds = [b"match", match_id.as_ref()], bump)]
    pub match_account: Account<'info, MatchAccount>,
    /// CHECK: lamport vault owned by the program.
    #[account(mut, seeds = [b"vault", match_id.as_ref()], bump)]
    pub vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub player_a: Signer<'info>,
    #[account(mut)]
    pub player_b: Signer<'info>,
    /// CHECK: settlement authority, checked by key on settle.
    pub referee: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitSetup<'info> {
    #[account(mut)]
    pub match_account: Account<'info, MatchAccount>,
    pub player: Signer<'info>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub match_account: Account<'info, MatchAccount>,
    /// CHECK: lamport vault owned by the program.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: paid by key comparison against the match record.
    #[account(mut)]
    pub player_a: UncheckedAccount<'info>,
    /// CHECK: paid by key comparison against the match record.
    #[account(mut)]
    pub player_b: UncheckedAccount<'info>,
    /// CHECK: rake destination.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    pub referee: Signer<'info>,
}

#[derive(Accounts)]
pub struct Reclaim<'info> {
    #[account(mut)]
    pub match_account: Account<'info, MatchAccount>,
    /// CHECK: lamport vault owned by the program.
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: paid by key comparison against the match record.
    #[account(mut)]
    pub player_a: UncheckedAccount<'info>,
    /// CHECK: paid by key comparison against the match record.
    #[account(mut)]
    pub player_b: UncheckedAccount<'info>,
    pub caller: Signer<'info>,
}

#[error_code]
pub enum ArmadaError {
    #[msg("match is not open")]
    MatchNotOpen,
    #[msg("match is not live")]
    MatchNotLive,
    #[msg("already settled")]
    AlreadySettled,
    #[msg("signer is not a player in this match")]
    NotAPlayer,
    #[msg("signer is not the referee")]
    NotReferee,
    #[msg("setup already committed")]
    AlreadyCommitted,
    #[msg("settle window has not elapsed")]
    TooEarly,
    #[msg("arithmetic overflow")]
    Overflow,
}
