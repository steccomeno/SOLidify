use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::solana_program::account_info::AccountInfo;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::solana_program::program_error::ProgramError;
use crate::sai_program::*;

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::prelude::*;
    use anchor_lang::solana_program::account_info::AccountInfo;
    use anchor_lang::solana_program::pubkey::Pubkey;

    #[test]
    fn test_mint() {
        // Setup test context and accounts
        let mut user_account = UserAccount { amount: 0 };
        let amount_to_mint = 100;

        // Call the mint function
        let result = mint(Context::new(), amount_to_mint);

        // Assert the result
        assert_eq!(user_account.amount, amount_to_mint);
    }

    #[test]
    fn test_burn() {
        // Setup test context and accounts
        let mut user_account = UserAccount { amount: 100 };
        let amount_to_burn = 50;

        // Call the burn function
        let result = burn(Context::new(), amount_to_burn);

        // Assert the result
        assert_eq!(user_account.amount, 50);
    }

    #[test]
    fn test_transfer() {
        // Setup test context and accounts
        let mut from_account = UserAccount { amount: 100 };
        let mut to_account = UserAccount { amount: 0 };
        let amount_to_transfer = 50;

        // Call the transfer function
        let result = transfer(Context::new(), amount_to_transfer);

        // Assert the result
        assert_eq!(from_account.amount, 50);
        assert_eq!(to_account.amount, 50);
    }
}

#[derive(Accounts)]
pub struct UserAccount {
    pub amount: u64,
}
