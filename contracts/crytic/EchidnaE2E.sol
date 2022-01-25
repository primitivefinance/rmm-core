pragma solidity 0.8.6;
import "../PrimitiveFactory.sol";
import "../interfaces/IERC20.sol";
import "./E2E_Create.sol";
import "./E2E_Global.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract EchidnaE2E --config contracts/crytic/E2E.yaml
contract EchidnaE2E is E2E_Create,E2E_Global{
    struct PoolData {
        Reserve.Data reserve;
        Margin.Data margin;
        uint256 liquidity;
    }
    PoolData precall;
    PoolData postcall;

    function one_to_max_uint64(uint256 random) internal returns (uint256) {
        return 1 + (random % (type(uint64).max - 1));
    }

    function retrieve_current_pool_data(bytes32 poolId, bool isPrecall) private {
        PoolData storage data;
        if (isPrecall) {
            data = precall;
        } else {
            data = postcall;
        }
        (
            uint128 reserveRisky,
            uint128 reserveStable,
            uint128 liquidity,
            uint32 blockTimestamp,
            uint256 cumulativeRisky,
            uint256 cumulativeStable,
            uint256 cumulativeLiquidity
        ) = engine.reserves(poolId);
        data.reserve = Reserve.Data({
            reserveRisky: reserveRisky,
            reserveStable: reserveStable,
            liquidity: liquidity,
            blockTimestamp: blockTimestamp,
            cumulativeRisky: cumulativeRisky,
            cumulativeStable: cumulativeStable,
            cumulativeLiquidity: cumulativeLiquidity
        });

        (uint128 marginRisky, uint128 marginStable) = engine.margins(address(this));
        data.margin = Margin.Data({balanceRisky: marginRisky, balanceStable: marginStable});

        uint256 engineLiquidity = engine.liquidity(address(this), poolId);
        data.liquidity = engineLiquidity;
    }

    function clear_pre_post_call() internal {
        delete precall;
        delete postcall;
    }

    event AllocateRemoveDifference(uint256 delRisky, uint256 removeRisky);
    event AllocateDelLiquidity(uint256 delLiquidity);
    struct AllocateCall {
        uint256 delRisky;
        uint256 delStable;
        bytes32 poolId;
        bool fromMargin;
    }

    function check_allocate_remove_inverses(
        uint256 randomId,
        uint256 intendedLiquidity,
        bool fromMargin
    ) public {
        AllocateCall memory allocate;
        allocate.poolId = Addresses.retrieve_created_pool(randomId);
        retrieve_current_pool_data(allocate.poolId, true);
        intendedLiquidity = one_to_max_uint64(intendedLiquidity);
        allocate.delRisky = (intendedLiquidity * precall.reserve.reserveRisky) / precall.reserve.liquidity;
        allocate.delStable = (intendedLiquidity * precall.reserve.reserveStable) / precall.reserve.liquidity;

        uint256 delLiquidity = allocate_helper(allocate);

        // these are calculated the amount returned when remove is called
        (uint256 removeRisky, uint256 removeStable) = remove_should_succeed(allocate.poolId, delLiquidity);
        emit AllocateRemoveDifference(allocate.delRisky, removeRisky);
        emit AllocateRemoveDifference(allocate.delStable, removeStable);

        assert(allocate.delRisky == removeRisky);
        assert(allocate.delStable == removeStable);
        assert(intendedLiquidity == delLiquidity);
    }

    event AllocateFailed(string reason, uint256 risky, uint256 stable);
    event AllocateRevert(bytes reason, uint256 risky, uint256 stable);

    function allocate_with_safe_range(
        uint256 randomId,
        uint256 delRisky,
        uint256 delStable,
        bool fromMargin
    ) public {
        if (fromMargin) {
            delRisky = one_to_max_uint64(delRisky);
            delStable = one_to_max_uint64(delStable);
        }
        bytes32 poolId = Addresses.retrieve_created_pool(randomId);
        AllocateCall memory args = AllocateCall({
            delRisky: delRisky,
            delStable: delStable,
            fromMargin: fromMargin,
            poolId: poolId
        });
        allocate_helper(args);
    }

    function allocate_helper(AllocateCall memory params) internal returns (uint256) {
        mint_tokens(params.delRisky, params.delStable);
        (, , uint32 maturity, , ) = engine.calibrations(params.poolId);
        require(maturity >= engine.time()); //pool must not be expired

        return allocate_should_succeed(params);
    }

    event AllocateMarginBalance(uint128 riskyBefore, uint128 stableBefore, uint256 delRisky, uint256 delStable);
    event ReserveStatus(string functionName, uint256 liquidity, uint256 reserveRisky, uint256 reserveStable);

    function allocate_should_succeed(AllocateCall memory params) internal returns (uint256) {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(address(this));
        require(marginRiskyBefore >= params.delRisky && marginStableBefore >= params.delStable);
        retrieve_current_pool_data(params.poolId, true);
        uint256 preCalcLiquidity;
        {
            uint256 liquidity0 = (params.delRisky * precall.reserve.liquidity) / uint256(precall.reserve.reserveRisky);
            uint256 liquidity1 = (params.delStable * precall.reserve.liquidity) /
                uint256(precall.reserve.reserveStable);
            preCalcLiquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
            require(preCalcLiquidity > 0);
        }
        emit AllocateMarginBalance(marginRiskyBefore, marginStableBefore, params.delRisky, params.delStable);
        try
            engine.allocate(
                params.poolId,
                address(this),
                params.delRisky,
                params.delStable,
                params.fromMargin,
                abi.encode(0)
            )
        returns (uint256 delLiquidity) {
            {
                retrieve_current_pool_data(params.poolId, false);
                assert(postcall.reserve.blockTimestamp == engine.time());
                assert(postcall.reserve.blockTimestamp >= postcall.reserve.blockTimestamp);
                // reserves increase by allocated amount
                assert(postcall.reserve.reserveRisky - precall.reserve.reserveRisky == params.delRisky);
                assert(postcall.reserve.reserveStable - precall.reserve.reserveStable == params.delStable);
                assert(postcall.reserve.liquidity - precall.reserve.liquidity == delLiquidity);
                // save delLiquidity
                assert(preCalcLiquidity == delLiquidity);
                (uint128 marginRiskyAfter, uint128 marginStableAfter) = engine.margins(address(this));
                if (params.fromMargin) {
                    assert(marginRiskyAfter == marginRiskyBefore - params.delRisky);
                    assert(marginStableAfter == marginStableBefore - params.delStable);
                } else {
                    assert(marginRiskyAfter == marginRiskyBefore);
                    assert(marginStableAfter == marginStableBefore);
                }
                return delLiquidity;
            }
        } catch {
            assert(false);
        }
        clear_pre_post_call();
    }

    function remove_with_safe_range(uint256 id, uint256 delLiquidity) public returns (uint256, uint256) {
        delLiquidity = one_to_max_uint64(delLiquidity);
        bytes32 poolId = Addresses.retrieve_created_pool(id);
        remove_should_succeed(poolId, delLiquidity);
    }

    function remove_should_succeed(bytes32 poolId, uint256 delLiquidity) internal returns (uint256, uint256) {
        retrieve_current_pool_data(poolId, true);
        (uint256 calcRisky, uint256 calcStable) = Reserve.getAmounts(precall.reserve, delLiquidity);
        if (
            delLiquidity == 0 ||
            delLiquidity > precall.liquidity ||
            calcRisky > precall.reserve.reserveRisky ||
            calcStable > precall.reserve.reserveStable
        ) {
            return remove_should_revert(poolId, delLiquidity);
        } else {
            try engine.remove(poolId, delLiquidity) returns (uint256 delRisky, uint256 delStable) {
                {
                    retrieve_current_pool_data(poolId, false);
                    // check liquidity decreased
                    uint256 liquidityAmountAfter = engine.liquidity(address(this), poolId);
                    assert(postcall.liquidity == precall.liquidity - delLiquidity);

                    // check margins for recipient increased
                    assert(postcall.margin.balanceRisky == precall.margin.balanceRisky + delRisky);
                    assert(postcall.margin.balanceStable == precall.margin.balanceStable + delStable);
                    (, , , uint32 calibrationTimestamp, ) = engine.calibrations(poolId);

                    assert(calibrationTimestamp == engine.time());
                    // check decrease in reserves
                    assert_remove_postconditions(precall.reserve, postcall.reserve, delRisky, delStable, delLiquidity);
                }
                return (delRisky, delStable);
            } catch {
                assert(false);
            }
        }
        clear_pre_post_call();
    }

    function remove_should_revert(bytes32 poolId, uint256 delLiquidity) internal returns (uint256, uint256) {
        uint256 liquidityAmountBefore = engine.liquidity(address(this), poolId);
        try engine.remove(poolId, delLiquidity) returns (uint256 delRisky, uint256 delStable) {
            assert(false);
        } catch {
            assert(liquidityAmountBefore == engine.liquidity(address(this), poolId));
            return (0, 0);
        }
    }

    function assert_remove_postconditions(
        Reserve.Data storage preRemoveReserve,
        Reserve.Data storage postRemoveReserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity
    ) internal {
        assert(postRemoveReserve.reserveRisky == preRemoveReserve.reserveRisky - delRisky);
        assert(postRemoveReserve.reserveStable == preRemoveReserve.reserveStable - delStable);
        assert(postRemoveReserve.liquidity == preRemoveReserve.liquidity - delLiquidity);
    }

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

    event DepositFailed(string reason, uint256 risky, uint256 stable);
    event DepositRevert(bytes reason, uint256 risky, uint256 stable);

    function deposit_with_safe_range(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        //ensures that delRisky and delStable are at least 1 and not too large to overflow the deposit
        delRisky = one_to_max_uint64(delRisky);
        delStable = one_to_max_uint64(delStable);
        mint_tokens(delRisky, delStable);
        deposit_should_succeed(recipient, delRisky, delStable);
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
        delRisky = one_to_max_uint64(delRisky);
        delStable = one_to_max_uint64(delStable);
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        require(marginRiskyBefore >= delRisky && marginStableBefore >= delStable);
        emit WithdrawMargins(marginRiskyBefore, marginStableBefore, delRisky, delStable);
        withdraw_should_succeed(recipient, delRisky, delStable);
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

    function allocateCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        executeCallback(delRisky, delStable);
    }

    function depositCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        executeCallback(delRisky, delStable);
    }

    function swapCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        executeCallback(delRisky, delStable);
    }

}
