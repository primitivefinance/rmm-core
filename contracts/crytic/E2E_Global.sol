pragma solidity 0.8.6;
import "./E2E_Helper.sol";

contract E2E_Global is E2E_Helper {
    // Check proper deployments
    function check_precision_and_liquidity() public {
        uint256 precision = engine.PRECISION();
        assert(precision == 10**18);

        uint256 minimumLiquidity = engine.MIN_LIQUIDITY();
        assert(minimumLiquidity > 0);
    }

    function check_proper_deployment_of_engine() public {
        address engineRisky = engine.risky();
        address engineStable = engine.stable();

        assert(engineStable == address(stable));
        assert(engineRisky == address(risky));
    }

    function check_created_pool_timestamp_greater_zero(uint256 id) public {
        bytes32 poolId = Addresses.retrieve_created_pool(id);

        (, , , uint32 calibrationTimestamp, ) = engine.calibrations(poolId);
        assert(calibrationTimestamp != 0);
    }

    function check_update_last_timestamp(uint256 id) public {
        bytes32 poolId = Addresses.retrieve_created_pool(id);

        try engine.updateLastTimestamp(poolId) {
            (, , uint32 maturity, uint32 lastTimestamp, ) = engine.calibrations(poolId);
            if (maturity <= engine.time()) {
                assert(lastTimestamp == maturity);
            } else {
                assert(lastTimestamp == engine.time());
            }
        } catch {
            assert(false);
        }
    }

    function check_maximuim_gamma(uint256 id) public {
        bytes32 poolId = Addresses.retrieve_created_pool(id);

        (, , , , uint32 gamma) = engine.calibrations(poolId);
        assert(gamma <= 10000);
    }

    function check_margin_of_zero_address(uint256 id) public {
        (uint128 balanceRisky, uint128 balanceStable) = engine.margins(address(0));
        assert(balanceRisky == 0);
        assert(balanceStable == 0);
    }

    function check_liquidity_of_zero_address(uint256 id) public {
        bytes32 poolId = Addresses.retrieve_created_pool(id);

        uint256 liquidityAmount = engine.liquidity(address(0), poolId);
        assert(liquidityAmount == 0);
    }
}
