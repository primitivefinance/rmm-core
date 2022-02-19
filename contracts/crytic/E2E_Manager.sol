pragma solidity 0.8.6;
import "./E2E_Helper.sol";

contract E2E_Manager is E2E_Helper {

    event ManagerAllocateMarginBalance(uint128 riskyBefore, uint128 stableBefore, uint256 delRisky, uint256 delStable);
    event ManagerRevertAllocateMarginBalance(uint256 delRisky, uint256 delStable);
    event ManagerReserveStatus(string functionName, uint256 liquidity, uint256 reserveRisky, uint256 reserveStable);
    event Time();
    struct ManagerAllocateCall {
        uint256 delRisky;
        uint256 delStable;
        bytes32 poolId;
        bool fromMargin;
    }

    ManagerPoolData manager_precall;
    ManagerPoolData manager_postcall;

    function manager_allocate_with_safe_range(
        uint256 randomId,
        uint256 delRisky,
        uint256 delStable
        //bool fromMargin
    ) public {
        // For now we only want not fromMargin
        //if (fromMargin) {
        //    delRisky = E2E_Helper.one_to_max_uint64(delRisky);
        //    delStable = E2E_Helper.one_to_max_uint64(delStable);
        //}
        bytes32 poolId = Addresses.retrieve_created_pool(randomId);
        ManagerAllocateCall memory args = ManagerAllocateCall({
            delRisky: delRisky,
            delStable: delStable,
            fromMargin: false,
            poolId: poolId
        });
        allocate_helper(args);
    }

    function allocate_helper(ManagerAllocateCall memory params) internal returns (uint256) {
        mint_tokens(params.delRisky, params.delStable);
        approve_tokens_sender(address(manager), params.delRisky, params.delStable);
        (, , uint32 maturity, , ) = engine.calibrations(params.poolId);
        if (engine.time() > maturity) {
            emit Time();
            return allocate_should_revert(params);
        }

        return allocate_should_succeed(params);
    }

    function allocate_should_succeed(ManagerAllocateCall memory params) internal returns (uint256) {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(address(this));
        if (params.fromMargin && (marginRiskyBefore < params.delRisky || marginStableBefore < params.delStable)) {
            return allocate_should_revert(params);
        }
        manager_retrieve_current_pool_data(params.poolId, true);
        uint256 erc1155_preBalance = manager.balanceOf(address(this), uint256(params.poolId));
        uint256 preCalcLiquidity;
        {
            uint256 liquidity0 = (params.delRisky * manager_precall.reserve.liquidity) / uint256(manager_precall.reserve.reserveRisky);
            uint256 liquidity1 = (params.delStable * manager_precall.reserve.liquidity) / uint256(manager_precall.reserve.reserveStable);
            preCalcLiquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
            require(preCalcLiquidity > 0);
        }
        emit ManagerAllocateMarginBalance(marginRiskyBefore, marginStableBefore, params.delRisky, params.delStable);
        try
            manager.allocate(
                params.poolId,
                address(risky),
                address(stable),
                params.delRisky,
                params.delStable,
                false,
                0
            )
        returns (uint256 delLiquidity) {
            {
                manager_retrieve_current_pool_data(params.poolId, false);
                assert(manager_postcall.reserve.blockTimestamp == engine.time());
                assert(manager_postcall.reserve.blockTimestamp >= manager_postcall.reserve.blockTimestamp);
                // reserves increase by allocated amount
                assert(manager_postcall.reserve.reserveRisky - manager_precall.reserve.reserveRisky == params.delRisky);
                assert(manager_postcall.reserve.reserveStable - manager_precall.reserve.reserveStable == params.delStable);
                assert(manager_postcall.reserve.liquidity - manager_precall.reserve.liquidity == delLiquidity);
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
                uint256 erc1155_postBalance = manager.balanceOf(address(this), uint256(params.poolId));
                assert(erc1155_postBalance - erc1155_preBalance == delLiquidity);
                return delLiquidity;
            }
        } catch {
            assert(false);
        }
        manager_clear_pre_post_call();
    }
    function allocate_should_revert(ManagerAllocateCall memory params) internal returns (uint256) {
        emit ManagerRevertAllocateMarginBalance(params.delRisky, params.delStable);
        
        try
            manager.allocate(
                params.poolId,
                address(risky),
                address(stable),
                params.delRisky,
                params.delStable,
                false,
                0
            )
        {
            assert(false);
        } catch {
            assert(true);
            return 0;
        }
    }

    function manager_retrieve_current_pool_data(bytes32 poolId, bool ismanager_precall) private {
        ManagerPoolData storage data;
        if (ismanager_precall) {
            data = manager_precall;
        } else {
            data = manager_postcall;
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

    function manager_clear_pre_post_call() internal {
        delete manager_precall;
        delete manager_postcall;
    }
    
    struct ManagerPoolData {
        Reserve.Data reserve;
        Margin.Data margin;
        uint256 liquidity;
    }

    function onERC1155Received(address operator, address from, uint256 id, uint256 value, bytes calldata data) external returns (bytes4) {
        return 0xf23a6e61;
    }

    function manager_remove_with_safe_range(uint256 id, uint256 delLiquidity) public returns (uint256, uint256) {
        delLiquidity = E2E_Helper.one_to_max_uint64(delLiquidity);
        bytes32 poolId = Addresses.retrieve_created_pool(id);
        manager_remove_should_succeed(poolId, delLiquidity);
    }

    function manager_remove_should_succeed(bytes32 poolId, uint256 delLiquidity) internal returns (uint256, uint256) {
        manager_retrieve_current_pool_data(poolId, true);
        (uint256 calcRisky, uint256 calcStable) = Reserve.getAmounts(manager_precall.reserve, delLiquidity);
        uint256 erc1155_preBalance = manager.balanceOf(address(this), uint256(poolId));        
        if (
            delLiquidity == 0 ||
            delLiquidity > manager_precall.liquidity ||
            calcRisky > manager_precall.reserve.reserveRisky ||
            calcStable > manager_precall.reserve.reserveStable ||
            erc1155_preBalance < delLiquidity
        ) {
            return manager_remove_should_revert(poolId, delLiquidity);
        } else {
            try manager.remove(poolId, delLiquidity, 0, 0) returns (uint256 delRisky, uint256 delStable) {
                {
                    manager_retrieve_current_pool_data(poolId, false);
                    // check liquidity decreased
                    uint256 liquidityAmountAfter = engine.liquidity(address(this), poolId);
                    assert(manager_postcall.liquidity == manager_precall.liquidity - delLiquidity);

                    // check margins for recipient increased
                    assert(manager_postcall.margin.balanceRisky == manager_precall.margin.balanceRisky + delRisky);
                    assert(manager_postcall.margin.balanceStable == manager_precall.margin.balanceStable + delStable);
                    (, , , uint32 calibrationTimestamp, ) = engine.calibrations(poolId);

                    assert(calibrationTimestamp == engine.time());
                    // check decrease in reserves
                    manager_assert_remove_postconditions(manager_precall.reserve, manager_postcall.reserve, delRisky, delStable, delLiquidity);
                }
                return (delRisky, delStable);
            } catch {
                assert(false);
            }
        }
        manager_clear_pre_post_call();
    }

    function manager_remove_should_revert(bytes32 poolId, uint256 delLiquidity) internal returns (uint256, uint256) {
        uint256 liquidityAmountBefore = engine.liquidity(address(this), poolId);
        try manager.remove(poolId, delLiquidity, 0, 0) returns (uint256 delRisky, uint256 delStable) {
            assert(false);
        } catch {
            assert(liquidityAmountBefore == engine.liquidity(address(this), poolId));
            return (0, 0);
        }
    }

    function manager_assert_remove_postconditions(
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

    function user_mint_approve_tokens(uint256 riskyAmt, uint256 stableAmt) internal {
        mint_tokens_sender(riskyAmt, stableAmt);
        approve_tokens_sender(address(manager), riskyAmt, stableAmt);
    }

    function check_manager() public {
        assert(manager.WETH9() == weth9);
        assert(manager.positionDescriptor() != address(0));
    }

    event DepositManager(uint128 riskyBefore, uint128 stableBefore, uint128 riskyAfter, uint128 stableAfter);

    function check_deposit_manager_safe(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        delRisky = E2E_Helper.one_to_max_uint64(delRisky);
        delStable = E2E_Helper.one_to_max_uint64(delStable);
        user_mint_approve_tokens(delRisky, delStable);
        manager_deposit_should_succeed(recipient, delRisky, delStable);
    }

    function check_manager_deposit_zero_zero(address recipient) public {
        manager_deposit_should_revert(recipient, 0, 0);
    }

    event Failed(string reason);

    function manager_deposit_should_succeed(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = manager.margins(recipient, address(engine));
        try manager.deposit(recipient, address(risky), address(stable), delRisky, delStable) {
            (uint128 marginRiskyAfter, uint128 marginStableAfter) = manager.margins(recipient, address(engine));
            emit DepositManager(marginRiskyBefore, marginStableBefore, marginRiskyAfter, marginStableAfter);
            assert(marginRiskyAfter == marginRiskyBefore + delRisky);
            assert(marginStableAfter == marginStableBefore + delStable);
		} catch {
			bytes memory payload = abi.encodeWithSignature("deposit(address,address,address,uint256,uint256)", recipient, address(risky), address(stable), delRisky, delStable);
			(bool success, bytes memory result) = address(manager).call(payload);
            string memory revertReason = abi.decode(result, (string));
            emit Failed(revertReason);
			assert(false);
		}
        // } catch Error(string memory reason) {
        //     //
        //     emit Failed(reason);
        //     assert(false);
        // } catch (bytes memory reason) {
        //     emit DepositManager(marginRiskyBefore, marginStableBefore, 0, 0);
        //     string memory revertReason = abi.decode(reason, (string));
        //     emit Failed(revertReason);
        //     assert(false);
		// }
    }

    function manager_deposit_should_revert(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        try manager.deposit(recipient, address(risky), address(stable), delRisky, delStable) {
            assert(false);
        } catch {
            assert(true);
        }
    }
}
