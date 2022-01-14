pragma solidity 0.8.6;

import "./test/engine/MockEngine.sol";
import "./PrimitiveFactory.sol";
import "./interfaces/IERC20.sol";
import "./test/TestRouter.sol";
import "./test/TestToken.sol";

contract EchidnaE2E {
    MockEngine engine = MockEngine(0x871DD7C2B4b25E1Aa18728e9D5f2Af4C4e431f5c);
    TestToken risky = TestToken(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    TestToken stable = TestToken(0x1D7022f5B17d2F8B695918FB48fa1089C9f85401);
    address manager = 0x1E2F9E10D02a6b8F8f69fcBf515e75039D2EA30d;
    TestRouter router = TestRouter(0x0B1ba0af832d7C05fD64161E0Db78E85978E8082);
    // WETH = 0xcdb594a32b1cc3479d8746279712c39d18a07fc0
    bytes32[] poolIds;

    function retrieve_created_pool(uint256 id) private returns (bytes32) {
        uint256 index = id % (poolIds.length + 1);
        return poolIds[index];
    }

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

    function check_proper_timestamp(uint256 id) public {
        bytes32 poolId = retrieve_created_pool(id);

        (, , , uint32 calibrationTimestamp, ) = engine.calibrations(poolId);
        assert(calibrationTimestamp != 0);
    }

    function check_update_last_timestamp(uint256 id) public {
        bytes32 poolId = retrieve_created_pool(id);

        //
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
        bytes32 poolId = retrieve_created_pool(id);

        (, , , , uint32 gamma) = engine.calibrations(poolId);
        assert(gamma <= 10000);
    }

    function check_margin_of_zero_address(uint256 id) public {
        bytes32 poolId = retrieve_created_pool(id);

        (uint128 balanceRisky, uint128 balanceStable) = engine.margins(address(0));
        assert(balanceRisky == 0);
        assert(balanceStable == 0);
    }

    function check_liquidity_of_zero_address(uint256 id) public {
        bytes32 poolId = retrieve_created_pool(id);

        uint256 liquidityAmount = engine.liquidity(address(0), poolId);
        assert(liquidityAmount == 0);
    }

    event MintedTokens(uint256 riskyAmount, uint256 stableAmt);

    function mint_tokens(uint256 riskyAmt, uint256 stableAmt) internal {
        risky.mint(address(this), riskyAmt);
        stable.mint(address(this), stableAmt);
        emit MintedTokens(riskyAmt, stableAmt);
    }

    function calculate_del_risky_and_stable(
        uint256 riskyPerLp,
        uint256 delLiquidity,
        uint128 _strike,
        uint32 _sigma,
        uint32 _maturity
    ) internal returns (uint256 delRisky, uint256 delStable) {
        uint256 factor0 = engine.scaleFactorRisky();
        uint256 factor1 = engine.scaleFactorStable();
        uint32 tau = _maturity - uint32(engine.time()); // time until expiry
        require(riskyPerLp <= engine.PRECISION() / factor0);

        delStable = ReplicationMath.getStableGivenRisky(0, factor0, factor1, riskyPerLp, _strike, _sigma, tau);
        delRisky = (riskyPerLp * delLiquidity) / engine.PRECISION(); // riskyDecimals * 1e18 decimals / 1e18 = riskyDecimals
        require(delRisky > 0);
        delStable = (delStable * delLiquidity) / engine.PRECISION();
        require(delStable > 0);
        mint_tokens(delRisky, delStable);
    }

    bytes ZERO_BYTES = "";
    event CreatePoolPreCall(
        uint128 strike,
        uint32 sigma,
        uint32 gamma,
        uint256 delLiquidity,
        uint32 maturity,
        uint32 timestamp,
        uint256 delRisky,
        uint256 delStable
    );

    function create_new_pool_should_not_revert(
        uint128 _strike,
        uint32 _sigma,
        uint32 _maturity,
        uint32 _gamma,
        uint256 riskyPerLp,
        uint256 _delLiquidity
    ) public {
        uint128 strike = (1 ether + (_strike % (10000 ether - 1 ether)));
        uint32 sigma = (100 + (_sigma % (1e7 - 100)));
        uint32 gamma = (9000 + (_gamma % (10000 - 9000)));
        uint256 delLiquidity = (engine.MIN_LIQUIDITY() + 1 + (_delLiquidity % (10 ether - engine.MIN_LIQUIDITY())));
        uint32 maturity = (31556952 + _maturity);
        require(maturity >= uint32(engine.time()));
        (uint256 delRisky, uint256 delStable) = calculate_del_risky_and_stable(
            riskyPerLp,
            delLiquidity,
            strike,
            sigma,
            maturity
        );
        emit CreatePoolPreCall(
            strike,
            sigma,
            gamma,
            delLiquidity,
            maturity,
            uint32(engine.time()),
            delRisky,
            delStable
        );

        bytes memory callbackPayload = abi.encodeWithSignature(
            "createCallback(uint256,uint256,bytes)",
            address(this),
            delRisky,
            delStable,
            ZERO_BYTES
        );

        create_helper(strike, sigma, maturity, gamma, riskyPerLp, delLiquidity, callbackPayload);
    }

    function create_new_pool_with_wrong_gamma_should_revert(
        uint128 _strike,
        uint32 _sigma,
        uint32 _maturity,
        uint32 gamma,
        uint256 riskyPerLp,
        uint256 _delLiquidity
    ) public {
        uint128 strike = (1 ether + (_strike % (10000 ether - 1 ether)));
        uint32 sigma = (100 + (_sigma % (1e7 - 100)));
        uint256 delLiquidity = (engine.MIN_LIQUIDITY() + 1 + (_delLiquidity % (10 ether - engine.MIN_LIQUIDITY())));
        uint32 maturity = (31556952 + _maturity);
        require(maturity >= uint32(engine.time()));
        (uint256 delRisky, uint256 delStable) = calculate_del_risky_and_stable(
            riskyPerLp,
            delLiquidity,
            strike,
            sigma,
            maturity
        );

        bytes memory callbackPayload = abi.encodeWithSignature(
            "createCallback(uint256,uint256,bytes)",
            address(this),
            delRisky,
            delStable,
            ZERO_BYTES
        );

        if (gamma > 10000 || gamma < 9000) {
            try engine.create(strike, sigma, maturity, gamma, riskyPerLp, delLiquidity, callbackPayload) {
                assert(false);
            } catch {
                assert(true);
            }
        }
    }

    event AddedPool(bytes32 poolId, uint128 strike, uint32 sigma, uint32 maturity, uint32 gamma, uint32 timestamp);

    function create_helper(
        uint128 strike,
        uint32 sigma,
        uint32 maturity,
        uint32 gamma,
        uint256 riskyPerLp,
        uint256 delLiquidity,
        bytes memory data
    ) internal {
        try engine.create(strike, sigma, maturity, gamma, riskyPerLp, delLiquidity, data) {
            bytes32 poolId = keccak256(abi.encodePacked(address(engine), strike, sigma, maturity, gamma));
            poolIds.push(poolId);
            (
                uint128 calibrationStrike,
                uint32 calibrationSigma,
                uint32 calibrationMaturity,
                uint32 calibrationTimestamp,
                uint32 calibrationGamma
            ) = engine.calibrations(poolId);
            assert(calibrationTimestamp == engine.time());
            assert(calibrationGamma == gamma);
            assert(calibrationStrike == strike);
            assert(calibrationSigma == sigma);
            assert(calibrationMaturity == maturity);
            emit AddedPool(
                poolId,
                calibrationStrike,
                calibrationSigma,
                calibrationMaturity,
                calibrationGamma,
                calibrationTimestamp
            );
        } catch {
            assert(false);
        }
    }

    event CreatedCallback(uint256 delRisky, uint256 delStable);

    function createCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        executeCallback(delRisky, delStable);
        emit CreatedCallback(delRisky, delStable);
    }

    event AllocatedCallback(uint256 delRisky, uint256 delStable);

    function allocateCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        executeCallback(delRisky, delStable);
        emit AllocatedCallback(delRisky, delStable);
    }

    event DepositCallback(uint256 delRisky, uint256 delStable, address sender);

    function depositCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        executeCallback(delRisky, delStable);
        emit DepositCallback(delRisky, delStable, msg.sender);
    }

    function executeCallback(uint256 delRisky, uint256 delStable) internal {
        risky.transfer(address(engine), delRisky);
        stable.transfer(address(engine), delStable);
    }
}
