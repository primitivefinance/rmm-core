pragma solidity 0.8.6;
import "../test/engine/MockEngine.sol";
import "../PrimitiveFactory.sol";
import "../interfaces/IERC20.sol";
import "../test/TestRouter.sol";
import "../test/TestToken.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract EchidnaE2E --config contracts/crytic/E2E.yaml
contract E2E_swap {
    TestToken risky = TestToken(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    TestToken stable = TestToken(0x1D7022f5B17d2F8B695918FB48fa1089C9f85401);

    address manager = 0x1E2F9E10D02a6b8F8f69fcBf515e75039D2EA30d;
    TestRouter router = TestRouter(0x0B1ba0af832d7C05fD64161E0Db78E85978E8082);
    MockEngine engine = MockEngine(0x871DD7C2B4b25E1Aa18728e9D5f2Af4C4e431f5c);
    // WETH = 0xcdb594a32b1cc3479d8746279712c39d18a07fc0
    bytes32[] poolIds;
    bool inited;

    // --- Tests ---
    function create_pools(
        uint256 _liquidity,
        uint256 _riskyPerLp,
        uint128 _strike,
        uint32 _sigma,
        uint32 _maturity,
        uint32 _gamma
    ) public {
        PoolParams memory params = forgeCalibration(_strike, _sigma, _maturity, _gamma);

        uint256 max_risky = 10**risky.decimals(); // one
        uint256 min_risky = 1;
        uint256 random_risky = min_risky + (_riskyPerLp % (max_risky - min_risky));
        require(random_risky < max_risky);

        uint256 random_liquidity = 1 ether + ((_liquidity % (type(uint64).max)) - 1 ether); // initial liquidity seeding
        (uint256 delRisky, uint256 delStable) = calculate_del_risky_and_stable(params, random_risky, random_liquidity);

        mint_tokens(delRisky, delStable);

        emit CreatingPool(random_risky, random_liquidity);
        create_helper(params, random_risky, random_liquidity, abi.encode(0));
    }

    function test_swap_risky_in(
        uint256 randomId,
        uint256 deltaIn,
        uint256 riskyForStable
    ) public {
        SwapHelper memory swapHelper;

        bytes32 poolId = retrieve_created_pool(randomId);
        bool swapRiskyIn = riskyForStable % 2 == 0 ? true : false;

        // swap forward
        ExactInput memory forward = get_exact_input(poolId, deltaIn, swapRiskyIn);
        uint256 forward_delta_out = swapRiskyIn ? simulate_exact_risky_in(forward) : simulate_exact_stable_in(forward);
        int128 forward_invariant_cache = engine.invariantOf(poolId);

        swapHelper = SwapHelper({
            poolId: poolId,
            riskyForStable: swapRiskyIn,
            deltaIn: forward.amountIn,
            deltaOut: forward_delta_out,
            fromMargin: false,
            toMargin: false
        });

        check_swap_pre_condition_2(swapHelper.deltaIn, swapHelper.deltaOut);
        mint_tokens(swapHelper.deltaIn, swapHelper.deltaOut);
        swap_helper(swapHelper);
    }

    /// @notice Swap forward with `forward_delta_in` amount input, then swap backward using the output of the trade.
    function check_reverse_swap(
        uint256 randomId,
        uint256 deltaIn,
        uint256 riskyForStable
    ) public {
        SwapHelper memory swapHelper;

        bytes32 poolId = retrieve_created_pool(randomId);
        bool swapRiskyIn = riskyForStable % 2 == 0 ? true : false;

        // swap forward
        ExactInput memory forward = get_exact_input(poolId, deltaIn, swapRiskyIn);
        uint256 forward_delta_out = swapRiskyIn ? simulate_exact_risky_in(forward) : simulate_exact_stable_in(forward);
        int128 forward_invariant_cache = engine.invariantOf(poolId);

        swapHelper = SwapHelper({
            poolId: poolId,
            riskyForStable: swapRiskyIn,
            deltaIn: forward.amountIn,
            deltaOut: forward_delta_out,
            fromMargin: false,
            toMargin: false
        });

        check_swap_pre_condition_2(swapHelper.deltaIn, swapHelper.deltaOut);
        mint_tokens(swapHelper.deltaIn, swapHelper.deltaOut);
        swap_helper(swapHelper);

        // swap backward
        uint256 backward_delta_in = forward_delta_out;
        ExactInput memory backward = get_exact_input(poolId, backward_delta_in, !swapRiskyIn);
        uint256 backward_delta_out = forward.amountIn + 1;
        int128 backward_invariant_cache = engine.invariantOf(poolId);

        swapHelper = SwapHelper({
            poolId: poolId,
            riskyForStable: !swapRiskyIn,
            deltaIn: backward_delta_in,
            deltaOut: backward_delta_out,
            fromMargin: false,
            toMargin: false
        });

        mint_tokens(swapHelper.deltaIn, swapHelper.deltaOut);

        // should revert
        swap_should_revert(swapHelper);
    }

    // --- Checks ---
    function check_swap_pre_conditions(
        uint32 maturity,
        uint256 input,
        uint256 output
    ) internal {
        /// #pre1
        require(maturity + engine.BUFFER() >= uint32(engine.time()));
        /// #pre2
        require(input * output > 0);
    }

    function check_swap_precondition_1(uint32 maturity) internal {
        /// #pre1
        require(maturity + engine.BUFFER() >= uint32(engine.time()));
    }

    function check_swap_pre_condition_2(uint256 input, uint256 output) internal {
        /// #pre2
        require(input * output > 0);
    }

    function check_post_swap_conditions(
        bytes32 poolId,
        bool riskyForStable,
        int128 pre_invariant,
        uint128 pre_risky,
        uint128 pre_stable
    ) internal {
        // #post1
        (, , uint32 maturity, uint32 lastTimestamp, ) = engine.calibrations(poolId);
        if (maturity <= engine.time()) {
            assert(lastTimestamp == maturity);
        } else {
            assert(lastTimestamp == engine.time());
        }

        // #post2
        int128 post_invariant = engine.invariantOf(poolId);
        assert(post_invariant >= pre_invariant);

        // #post3
        (uint128 post_risky, uint128 post_stable, , , , , ) = engine.reserves(poolId);
        if (riskyForStable) {
            // This will fail if deltaInWithFee == 0
            assert(post_risky > pre_risky);
            assert(post_stable < pre_stable);
        } else {
            assert(post_risky < pre_risky);
            // This will fail if deltaInWithFee == 0
            assert(post_stable > pre_stable);
        }
    }

    // --- Swap Utils ---

    // parameters for a swap
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

    function get_exact_input(
        bytes32 poolId,
        uint256 deltaIn,
        bool riskyForStable
    ) internal returns (ExactInput memory exactInput) {
        (uint128 strike, uint32 sigma, uint32 maturity, , uint32 gamma) = engine.calibrations(poolId);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = engine.reserves(poolId);
        uint32 tau = uint32(engine.time()) > maturity ? 0 : maturity - uint32(engine.time());

        uint256 maxDeltaIn = get_max_deltaIn(riskyForStable, reserveRisky, reserveStable, liquidity, strike);
        deltaIn = 1 + (deltaIn % maxDeltaIn); // add 1 so its always > 0

        exactInput = ExactInput({
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

        check_swap_precondition_1(maturity);
    }

    /**
        Simulating a swap guide

        1. Apply Fee to amountIn
        2. Adjust input reserve with amountInWithFeeApplied and normalize to per liquidity share
        3. Compute output reserve per liquidity share given adjusted input reserve per liquidity share
        4. Normalize output reserve per liquidity share to output reserve for total liquidity
        5. Compute new reserves given amountIn (not amountInWithFeeApplied) and amountOut
    */
    function simulate_exact_risky_in(ExactInput memory i) internal returns (uint256) {
        // riskyDecimals, stableDecinmals = 18 for now
        // Need timestamp updated
        int128 invariantBefore = engine.invariantOf(i.poolId);
        uint256 upscaledAdjustedStable;
        {
            uint256 amountInWithFee = (i.amountIn * i.gamma) / 1e4; // 1. apply fee
            uint256 upscaledAdjustedRisky = uint256(i.reserveRisky) + amountInWithFee; // 2. Adjust input reset

            uint256 downscaledRisky = (upscaledAdjustedRisky * 1e18) / i.reserveLiquidity;
            uint256 downscaledStable = ReplicationMath.getStableGivenRisky(
                invariantBefore,
                engine.scaleFactorRisky(),
                engine.scaleFactorStable(),
                downscaledRisky,
                i.strike,
                i.sigma,
                i.tau
            ); // 3. compute output reserve per liquidity

            upscaledAdjustedStable = (downscaledStable * i.reserveLiquidity) / 1e18;
        }

        uint256 amountStableOut = i.reserveStable - upscaledAdjustedStable;

        uint256 downscaledRes0 = (i.reserveRisky + i.amountIn) / i.reserveLiquidity;
        uint256 downscaledRes1 = (i.reserveStable - amountStableOut) / i.reserveLiquidity;

        require(downscaledRes0 <= 10**risky.decimals() || downscaledRes0 >= 0);
        require(downscaledRes1 <= i.strike || downscaledRes1 >= 0);

        int128 invariantAfter = ReplicationMath.calcInvariant(
            engine.scaleFactorRisky(),
            engine.scaleFactorStable(),
            downscaledRes0,
            downscaledRes1,
            i.strike,
            i.sigma,
            i.tau
        );
        assert(invariantAfter >= invariantBefore);
        return amountStableOut;
    }

    event SimulatedStableIn(uint256 res0, uint256 res1);

    function simulate_exact_stable_in(ExactInput memory i) internal returns (uint256) {
        // riskyDecimals, stableDecimals = 18 for now
        // Need timestamp updated
        int128 invariantBefore = engine.invariantOf(i.poolId);

        uint256 downscaledAdjustedStable;
        {
            uint256 amountInWithFee = (i.amountIn * i.gamma) / 1e4;
            uint256 upscaledAdjustedStable = uint256(i.reserveStable) + amountInWithFee;
            downscaledAdjustedStable = (upscaledAdjustedStable * 1e18) / i.reserveLiquidity;
        }

        uint256 amountRiskyOut;
        {
            uint256 downscaledRisky = ReplicationMath.getRiskyGivenStable(
                invariantBefore,
                engine.scaleFactorRisky(),
                engine.scaleFactorStable(),
                downscaledAdjustedStable,
                i.strike,
                i.sigma,
                i.tau
            );
            uint256 upscaledAdjustedRisky = (downscaledRisky * i.reserveLiquidity) / 1e18;
            amountRiskyOut = i.reserveRisky - upscaledAdjustedRisky;
        }

        uint256 downscaledRes0 = (i.reserveRisky - amountRiskyOut) / i.reserveLiquidity;
        uint256 downscaledRes1 = (i.reserveStable + i.amountIn) / i.reserveLiquidity;

        emit SimulatedStableIn(downscaledRes0, downscaledRes1);

        int128 invariantAfter = ReplicationMath.calcInvariant(
            engine.scaleFactorRisky(),
            engine.scaleFactorStable(),
            downscaledRes0,
            downscaledRes1,
            i.strike,
            i.sigma,
            i.tau
        );
        assert(invariantAfter >= invariantBefore);
        return amountRiskyOut;
    }

    // --- Utils ---

    function retrieve_created_pool(uint256 id) private returns (bytes32) {
        require(poolIds.length > 0);
        uint256 index = id % (poolIds.length);
        return poolIds[index];
    }

    function get_max_deltaIn(
        bool riskyForStable,
        uint128 reserveRisky,
        uint128 reserveStable,
        uint128 liquidity,
        uint128 strike
    ) internal returns (uint256) {
        // max risky reserve = 1
        uint256 one = 10**risky.decimals();
        if (riskyForStable) {
            uint256 riskyPerLiquidity = (uint256(reserveRisky) * 1e18) / liquidity;
            return ((one - riskyPerLiquidity) * liquidity) / 1e18;
        } else {
            // max stable reserve = strike
            uint256 stablePerLiquidity = (uint256(reserveStable) * 1e18) / liquidity;
            return (uint256(strike - stablePerLiquidity) * liquidity) / 1e18;
        }
    }

    // --- Setup ---

    struct PoolBounds {
        uint128 min_strike;
        uint128 max_strike;
        uint32 min_sigma;
        uint32 max_sigma;
        uint32 min_gamma;
        uint32 max_gamma;
    }

    PoolBounds bounds =
        PoolBounds({
            min_strike: 1 ether,
            max_strike: 10_000 ether,
            min_sigma: 100, // 0.01%
            max_sigma: 10_000_000, // 1000%
            min_gamma: 9_000, // 90%
            max_gamma: 10_000 // 99.99%
        });

    struct PoolParams {
        uint128 strike;
        uint32 sigma;
        uint32 maturity;
        uint32 lastTimestamp;
        uint32 gamma;
    }

    function forgeCalibration(
        uint128 _strike,
        uint32 _sigma,
        uint32 _maturity,
        uint32 _gamma
    ) internal returns (PoolParams memory calibration) {
        calibration.strike = uint128(bounds.min_strike + (_strike % (bounds.max_strike - bounds.min_strike)));
        calibration.sigma = uint32(bounds.min_sigma + (_sigma % (bounds.max_sigma - bounds.min_sigma)));
        calibration.gamma = uint32(bounds.min_gamma + (_gamma % (bounds.max_gamma - bounds.min_gamma)));
        calibration.maturity = uint32(31556952 + _maturity);
        calibration.lastTimestamp = uint32(engine.time());
        require(calibration.maturity >= calibration.lastTimestamp);
    }

    function calculate_del_risky_and_stable(
        PoolParams memory params,
        uint256 riskyPerLp,
        uint256 delLiquidity
    ) internal returns (uint256 delRisky, uint256 delStable) {
        uint256 factor0 = engine.scaleFactorRisky();
        uint256 factor1 = engine.scaleFactorStable();
        uint32 tau = params.maturity - uint32(engine.time()); // time until expiry
        require(riskyPerLp <= engine.PRECISION() / factor0); // at least 1 wei

        delRisky = (riskyPerLp * delLiquidity) / engine.PRECISION(); // riskyDecimals * 1e18 decimals / 1e18 = riskyDecimals
        require(delRisky > 0);

        // 0 invariant, because we are trying to set reserves such that invariant is 0!
        delStable = ReplicationMath.getStableGivenRisky(
            0,
            factor0,
            factor1,
            riskyPerLp,
            params.strike,
            params.sigma,
            tau
        );
        delStable = (delStable * delLiquidity) / engine.PRECISION();
        require(delStable > 0);
    }

    event CreatingPool(uint256 riskyPerLp, uint256 delLiquidity);

    // --- Helpers ---

    struct SwapHelper {
        bytes32 poolId;
        uint256 deltaIn;
        uint256 deltaOut;
        bool fromMargin;
        bool toMargin;
        bool riskyForStable;
    }

    function swap_helper(SwapHelper memory s) internal {
        int128 pre_invariant = engine.invariantOf(s.poolId);
        (uint128 pre_risky, uint128 pre_stable, , , , , ) = engine.reserves(s.poolId);
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
            check_post_swap_conditions(s.poolId, s.riskyForStable, pre_invariant, pre_risky, pre_stable);
        } catch {
            assert(false);
        }
    }

    function swap_should_revert(SwapHelper memory s) internal {
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
            assert(false);
        } catch {
            assert(true);
        }
    }

    event AddedPool(bytes32 poolId, uint128 strike, uint32 sigma, uint32 maturity, uint32 gamma, uint32 timestamp);

    function create_helper(
        PoolParams memory params,
        uint256 riskyPerLp,
        uint256 delLiquidity,
        bytes memory data
    ) internal {
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 gamma) = (
            params.strike,
            params.sigma,
            params.maturity,
            params.gamma
        );
        try engine.create(strike, sigma, maturity, gamma, riskyPerLp, delLiquidity, data) {
            bytes32 poolId = keccak256(abi.encodePacked(address(engine), strike, sigma, maturity, gamma));
            poolIds.push(poolId); // add pool

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

    // --- Mint tokens ---

    function mint_tokens(uint256 riskyAmt, uint256 stableAmt) internal {
        risky.mint(address(this), riskyAmt);
        stable.mint(address(this), stableAmt);
    }

    // --- Callbacks ---

    function createCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        executeCallback(delRisky, delStable);
    }

    function allocateCallback(
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

    // requires tokens to be minted prior to reaching the callback
    function executeCallback(uint256 delRisky, uint256 delStable) internal {
        if (delRisky > 0) {
            risky.transfer(address(engine), delRisky);
        }
        if (delStable > 0) {
            stable.transfer(address(engine), delStable);
        }
    }
}
