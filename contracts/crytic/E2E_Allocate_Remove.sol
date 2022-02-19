pragma solidity 0.8.6;
import "./E2E_Helper.sol";

contract E2E_Allocate_Remove is E2E_Helper {
    PoolData precall;
    PoolData postcall;
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
        intendedLiquidity = E2E_Helper.one_to_max_uint64(intendedLiquidity);
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
        delRisky = E2E_Helper.one_to_max_uint64(delRisky);
        delStable = E2E_Helper.one_to_max_uint64(delStable);
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
        if (engine.time() > maturity) {
            return allocate_should_revert(params);
        }

        return allocate_should_succeed(params);
    }

    event AllocateMarginBalance(uint128 riskyBefore, uint128 stableBefore, uint256 delRisky, uint256 delStable);
    event ReserveStatus(string functionName, uint256 liquidity, uint256 reserveRisky, uint256 reserveStable);

    function allocate_should_succeed(AllocateCall memory params) internal returns (uint256) {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(address(this));
        retrieve_current_pool_data(params.poolId, true);
        if (params.fromMargin && (marginRiskyBefore < params.delRisky || marginStableBefore < params.delStable)) {
            return allocate_should_revert(params);
        }
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
                assert(postcall.liquidity == precall.liquidity + delLiquidity);
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
    }

    function allocate_should_revert(AllocateCall memory params) internal returns (uint256) {
        try
            engine.allocate(
                params.poolId,
                address(this),
                params.delRisky,
                params.delStable,
                params.fromMargin,
                abi.encode(0)
            )
        {
            assert(false);
        } catch {
            assert(true);
            return 0;
        }
    }

    function remove_with_safe_range(uint256 id, uint256 delLiquidity) public returns (uint256, uint256) {
        delLiquidity = E2E_Helper.one_to_max_uint64(delLiquidity);
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

    function allocateCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        executeCallback(delRisky, delStable);
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

    struct PoolData {
        Reserve.Data reserve;
        Margin.Data margin;
        uint256 liquidity;
    }
}
