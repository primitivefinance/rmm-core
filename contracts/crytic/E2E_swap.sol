pragma solidity 0.8.6;
import "../test/engine/MockEngine.sol";
import "../PrimitiveFactory.sol";
import "../interfaces/IERC20.sol";
import "../test/TestRouter.sol";
import "../test/TestToken.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract EchidnaE2E --config contracts/crytic/E2E.yaml
contract E2E_swap {
    MockEngine engine = MockEngine(0x871DD7C2B4b25E1Aa18728e9D5f2Af4C4e431f5c);
    TestToken risky = TestToken(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    TestToken stable = TestToken(0x1D7022f5B17d2F8B695918FB48fa1089C9f85401);
    address manager = 0x1E2F9E10D02a6b8F8f69fcBf515e75039D2EA30d;
    TestRouter router = TestRouter(0x0B1ba0af832d7C05fD64161E0Db78E85978E8082);
    // WETH = 0xcdb594a32b1cc3479d8746279712c39d18a07fc0
    bytes32[] poolIds;

    function retrieve_created_pool(uint256 id) private returns (bytes32) {
        require(poolIds.length > 0);
        uint256 index = id % (poolIds.length);
        return poolIds[index];
    }

    function mint_tokens(uint256 riskyAmt, uint256 stableAmt) internal {
        risky.mint(address(this), riskyAmt);
        stable.mint(address(this), stableAmt);
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

        create_helper(strike, sigma, maturity, gamma, riskyPerLp, delLiquidity, abi.encode(0));
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

    //function advance_time(uint256 time) public {
    //	engine.advanceTime(time);
    //}

    function get_max_deltaIn(
        bool riskyForStable,
        uint128 reserveRisky,
        uint128 reserveStable,
        uint128 liquidity,
        uint128 strike
    ) internal returns (uint256) {
        if (riskyForStable) {
            uint256 riskyPerLiquidity = (reserveRisky * 1e18) / liquidity;
            return ((10**risky.decimals() - riskyPerLiquidity) * liquidity) / 1e18;
        } else {
            uint256 stablePerLiquidity = (reserveStable * 1e18) / liquidity;
            return ((strike - stablePerLiquidity) * liquidity) / 1e18;
        }
    }

    struct SwapHelper {
        bytes32 poolId;
        uint256 deltaIn;
        uint256 deltaOut;
        bool fromMargin;
        bool toMargin;
        bool riskyForStable;
    }

    function swap_helper(SwapHelper memory s) internal {
        (uint128 reserveRiskyBefore, uint128 reserveStableBefore, , , , , ) = engine.reserves(s.poolId);
        try
            engine.swap(
                address(this),
                s.poolId,
                s.riskyForStable,
                s.deltaIn,
                s.deltaOut,
                s.fromMargin,
                s.toMargin,
                abi.encode(0)
            )
        {
            (uint128 reserveRiskyAfter, uint128 reserveStableAfter, , , , , ) = engine.reserves(s.poolId);
            if (s.riskyForStable) {
                // This will fail if deltaInWithFee == 0
                assert(reserveRiskyAfter > reserveRiskyBefore);
                assert(reserveStableAfter < reserveStableBefore);
            } else {
                assert(reserveRiskyAfter < reserveRiskyBefore);
                // This will fail if deltaInWithFee == 0
                assert(reserveStableAfter > reserveStableBefore);
            }
        } catch {
            assert(false);
        }
    }

    struct ExactInput {
        bytes32 poolId;
        uint256 amountIn;
        uint128 reserveRisky;
        uint128 reserveStable;
        uint128 reserveLiquidity;
        uint128 strike;
        uint32 sigma;
        uint32 gamma;
        uint32 tau;
    }

    function exactRiskyInput(ExactInput memory i) internal returns (uint256) {
        // riskyDecimals, stableDecinmals = 18 for now
        // Need timestamp updated
        int128 invariantBefore = engine.invariantOf(i.poolId);
        uint256 adjustedStable;
        {
            uint256 amountInWithFee = (i.amountIn * i.gamma) / 1e4;
            uint256 adjustedRisky = (1e18 * (uint256(i.reserveRisky) + amountInWithFee)) / i.reserveLiquidity;
            adjustedStable = ReplicationMath.getStableGivenRisky(
                invariantBefore,
                engine.scaleFactorRisky(),
                engine.scaleFactorStable(),
                adjustedRisky,
                i.strike,
                i.sigma,
                i.tau
            );
        }
        uint256 outputStable = i.reserveStable - adjustedStable;

        uint256 res0 = (i.reserveRisky + i.amountIn) / i.reserveLiquidity;
        uint256 res1 = (i.reserveStable - outputStable) / i.reserveLiquidity;
        int128 invariantAfter = ReplicationMath.calcInvariant(
            engine.scaleFactorRisky(),
            engine.scaleFactorStable(),
            res0,
            res1,
            i.strike,
            i.sigma,
            i.tau
        );
        assert(invariantAfter >= invariantBefore);
        return outputStable;
    }

    function exactStableInput(ExactInput memory i) internal returns (uint256) {
        // riskyDecimals, stableDecinmals = 18 for now
        // Need timestamp updated
        int128 invariantBefore = engine.invariantOf(i.poolId);

        uint256 adjustedStable;
        {
            uint256 amountInWithFee = (i.amountIn * i.gamma) / 1e4;
            adjustedStable = (1e18 * (uint256(i.reserveStable) + amountInWithFee)) / i.reserveLiquidity;
        }
        uint256 outputRisky;
        {
            uint256 adjustedRisky = ReplicationMath.getRiskyGivenStable(
                invariantBefore,
                engine.scaleFactorRisky(),
                engine.scaleFactorStable(),
                adjustedStable,
                i.strike,
                i.sigma,
                i.tau
            );
            outputRisky = i.reserveRisky - adjustedRisky;
        }
        uint256 res0 = (i.reserveRisky - outputRisky) / i.reserveLiquidity;
        uint256 res1 = (i.reserveStable + i.amountIn) / i.reserveLiquidity;

        int128 invariantAfter = ReplicationMath.calcInvariant(
            engine.scaleFactorRisky(),
            engine.scaleFactorStable(),
            res0,
            res1,
            i.strike,
            i.sigma,
            i.tau
        );
        assert(invariantAfter >= invariantBefore);
        return outputRisky;
    }

    function exactStableInputBisection(ExactInput memory i) internal returns (uint256) {
        // riskyDecimals, stableDecinmals = 18 for now
        // Need timestamp updated
        int128 invariantBefore = engine.invariantOf(i.poolId);

        uint256 adjustedStable;
        {
            uint256 amountInWithFee = (i.amountIn * i.gamma) / 1e4;
            adjustedStable = (1e18 * (uint256(i.reserveStable) + amountInWithFee)) / i.reserveLiquidity;
        }
        uint256 outputRisky;
        {
            uint256 adjustedRisky = get_risky_given_stable_bisection(adjustedStable, i.strike, i.sigma, i.tau);
            outputRisky = i.reserveRisky - adjustedRisky;
        }
        uint256 res0 = (i.reserveRisky - outputRisky) / i.reserveLiquidity;
        uint256 res1 = (i.reserveStable + i.amountIn) / i.reserveLiquidity;

        int128 invariantAfter = ReplicationMath.calcInvariant(
            engine.scaleFactorRisky(),
            engine.scaleFactorStable(),
            res0,
            res1,
            i.strike,
            i.sigma,
            i.tau
        );
        assert(invariantAfter >= invariantBefore);
        return outputRisky;
    }

    event GotOutputs(uint256 computed, uint256 bisection);

    function check_swap_stable_bisection(uint256 randomId, uint256 deltaIn) public {
        bytes32 poolId = retrieve_created_pool(randomId); // valid pool
        (uint128 strike, uint32 sigma, uint32 maturity, , uint32 gamma) = engine.calibrations(poolId);
        require(maturity + engine.BUFFER() >= uint32(engine.time())); // valid swap time
        uint32 tau = uint32(engine.time()) > maturity ? 0 : maturity - uint32(engine.time());
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = engine.reserves(poolId);
        {
            uint256 maxDeltaIn = get_max_deltaIn(false, reserveRisky, reserveStable, liquidity, strike);
            deltaIn = 1 + (deltaIn % maxDeltaIn);
        }

        ExactInput memory exactInput = ExactInput({
            poolId: poolId,
            amountIn: deltaIn,
            reserveRisky: reserveRisky,
            reserveStable: reserveStable,
            reserveLiquidity: liquidity,
            strike: strike,
            sigma: sigma,
            gamma: gamma,
            tau: tau
        });

        uint256 computed_out = exactStableInput(exactInput);
        uint256 bisection_out = exactStableInputBisection(exactInput);

        emit GotOutputs(computed_out, bisection_out);
        assert(
            bisection_out > computed_out
                ? bisection_out - computed_out <= max_precision()
                : computed_out - bisection_out <= max_precision()
        ); // is within 1e15
    }

    function epsilon() internal view returns (uint256) {
        return 10**(risky.decimals() - 3);
    }

    function max_precision() internal view returns (uint256) {
        return 10**(risky.decimals() - 5);
    }

    function get_risky_given_stable_bisection(
        uint256 res_stable,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal returns (uint256) {
        uint256 scale_risky = engine.scaleFactorRisky();
        uint256 scale_stable = engine.scaleFactorStable();

        bargs = BisectionArgs({
            scale_risky: scale_risky,
            scale_stable: scale_stable,
            res_stable: res_stable,
            strike: strike,
            sigma: sigma,
            tau: tau
        });

        uint256 precision = max_precision(); // 5 decimal places
        uint256 max_risky = 10**risky.decimals(); // 1
        int128 i_max_precision = bisection_method(precision);
        int128 i_max_risky_less_precision = bisection_method(max_risky - precision);

        // if max precision is positive, and max risky less precision is negative, true
        // else max precision is negative, if max risky less precision is position, true
        uint256 optimal_out;
        if (i_max_precision >= 0 ? i_max_risky_less_precision < 0 : i_max_risky_less_precision >= 0) {
            optimal_out = bisection(precision, max_risky - precision);
        } else {
            optimal_out = max_risky;
        }

        return optimal_out;
    }

    struct BisectionArgs {
        uint256 scale_risky;
        uint256 scale_stable;
        uint256 res_stable;
        uint256 strike;
        uint256 sigma;
        uint256 tau;
    }

    BisectionArgs internal bargs;

    function bisection_method(uint256 v) internal returns (int128) {
        BisectionArgs memory b = bargs;
        return ReplicationMath.calcInvariant(b.scale_risky, b.scale_stable, v, b.res_stable, b.strike, b.sigma, b.tau);
    }

    function bisection(uint256 a, uint256 b) internal returns (uint256) {
        require(bisection_method(a) * bisection_method(b) < 0);

        uint256 EPSILON = epsilon();

        uint256 c = a;

        uint256 diff;
        unchecked {
            diff = b - a;
        }

        while (diff >= EPSILON) {
            c = (a + b) / 2;

            if (bisection_method(c) == 0) break;
            else if (bisection_method(c) * bisection_method(a) < 0) b = c;
            else a = c;
        }

        return c;
    }

    function createCallback(
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

    function executeCallback(uint256 delRisky, uint256 delStable) internal {
        if (delRisky > 0) {
            risky.transfer(address(engine), delRisky);
        }
        if (delStable > 0) {
            stable.transfer(address(engine), delStable);
        }
    }
}
