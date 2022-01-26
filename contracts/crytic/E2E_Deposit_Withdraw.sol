pragma solidity 0.8.6;
import "./E2E_Helper.sol";

contract E2E_Deposit_Withdraw is E2E_Helper {
    event DepositFailed(string reason, uint256 risky, uint256 stable);
    event DepositRevert(bytes reason, uint256 risky, uint256 stable);

    function check_deposit_withdraw_safe(
        address recipient,
        uint256 riskyAmount,
        uint256 stableAmount
    ) public {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        deposit_with_safe_range(address(this), riskyAmount, stableAmount);
        withdraw_with_safe_range(address(this), riskyAmount, stableAmount);
        (uint128 marginRiskyAfter, uint128 marginStableAfter) = engine.margins(recipient);
        assert(marginRiskyBefore == marginRiskyAfter);
        assert(marginStableBefore == marginStableAfter);
    }

    function deposit_with_safe_range(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        //ensures that delRisky and delStable are at least 1 and not too large to overflow the deposit
        delRisky = E2E_Helper.one_to_max_uint64(delRisky);
        delStable = E2E_Helper.one_to_max_uint64(delStable);
        mint_tokens(delRisky, delStable);
        deposit_should_succeed(recipient, delRisky, delStable);
    }

    function deposit_zero_zero(address recipient) public {
        deposit_should_revert(recipient, 0, 0);
    }

    function deposit_should_revert(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        try engine.deposit(recipient, delRisky, delStable, abi.encode(0)) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function deposit_should_succeed(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        uint256 balanceSenderRiskyBefore = risky.balanceOf(address(this));
        uint256 balanceSenderStableBefore = stable.balanceOf(address(this));
        uint256 balanceEngineRiskyBefore = risky.balanceOf(address(engine));
        uint256 balanceEngineStableBefore = stable.balanceOf(address(engine));

        try engine.deposit(recipient, delRisky, delStable, abi.encode(0)) {
            // check margins
            (uint128 marginRiskyAfter, uint128 marginStableAfter) = engine.margins(recipient);
            assert(marginRiskyAfter == marginRiskyBefore + delRisky);
            assert(marginStableAfter == marginStableBefore + delStable);
            // check token balances
            uint256 balanceSenderRiskyAfter = risky.balanceOf(address(this));
            uint256 balanceSenderStableAfter = stable.balanceOf(address(this));
            uint256 balanceEngineRiskyAfter = risky.balanceOf(address(engine));
            uint256 balanceEngineStableAfter = stable.balanceOf(address(engine));
            assert(balanceSenderRiskyAfter == balanceSenderRiskyBefore - delRisky);
            assert(balanceSenderStableAfter == balanceSenderStableBefore - delStable);
            assert(balanceEngineRiskyAfter == balanceEngineRiskyBefore + delRisky);
            assert(balanceEngineStableAfter == balanceEngineStableBefore + delStable);
        } catch Error(string memory reason) {
            uint256 balanceOfThisRisky = risky.balanceOf(address(this));
            uint256 balanceOfThisStable = stable.balanceOf(address(this));
            emit DepositFailed(reason, balanceOfThisRisky, balanceOfThisStable);
            assert(false);
        } catch (bytes memory lowLevelData) {
            uint256 balanceOfThisRisky = risky.balanceOf(address(this));
            uint256 balanceOfThisStable = stable.balanceOf(address(this));
            emit DepositRevert(lowLevelData, balanceOfThisRisky, balanceOfThisStable);
            assert(false);
        }
    }

    event WithdrawMargins(uint128 risky, uint128 stable, uint256 delRisky, uint256 delStable);

    function withdraw_with_safe_range(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        //ensures that delRisky and delStable are at least 1 and not too large to overflow the deposit
        delRisky = E2E_Helper.one_to_max_uint64(delRisky);
        delStable = E2E_Helper.one_to_max_uint64(delStable);
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        require(marginRiskyBefore >= delRisky && marginStableBefore >= delStable);
        emit WithdrawMargins(marginRiskyBefore, marginStableBefore, delRisky, delStable);
        withdraw_should_succeed(recipient, delRisky, delStable);
    }

    function withdraw_zero_zero(address recipient) public {
        withdraw_should_revert(recipient, 0, 0);
    }

    function withdraw_should_revert(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        try engine.withdraw(recipient, delRisky, delStable) {
            assert(false);
        } catch {
            assert(true);
        }
    }

    event Withdraw(uint128 marginRiskyBefore, uint128 marginStableBefore, uint256 delRisky, uint256 delStable);
    event FailureReason(string reason);

    function withdraw_should_succeed(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        uint256 balanceRecipientRiskyBefore = risky.balanceOf(recipient);
        uint256 balanceRecipientStableBefore = stable.balanceOf(recipient);
        uint256 balanceEngineRiskyBefore = risky.balanceOf(address(engine));
        uint256 balanceEngineStableBefore = stable.balanceOf(address(engine));
        emit Withdraw(marginRiskyBefore, marginStableBefore, delRisky, delStable);

        try engine.withdraw(recipient, delRisky, delStable) {
            // check margins
            (uint128 marginRiskyAfter, uint128 marginStableAfter) = engine.margins(recipient);
            assert(marginRiskyAfter == marginRiskyBefore - delRisky);
            assert(marginStableAfter == marginStableBefore - delStable);
            //check token balances
            uint256 balanceRecipientRiskyAfter = risky.balanceOf(recipient);
            uint256 balanceRecipientStableAfter = stable.balanceOf(recipient);
            uint256 balanceEngineRiskyAfter = risky.balanceOf(address(engine));
            uint256 balanceEngineStableAfter = stable.balanceOf(address(engine));
            assert(balanceRecipientRiskyAfter == balanceRecipientRiskyBefore + delRisky);
            assert(balanceRecipientStableAfter == balanceRecipientStableBefore + delStable);
            assert(balanceEngineRiskyAfter == balanceEngineRiskyBefore - delRisky);
            assert(balanceEngineStableAfter == balanceEngineStableBefore - delStable);
        } catch {
            assert(false);
        }
    }

    function depositCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        executeCallback(delRisky, delStable);
    }
}
