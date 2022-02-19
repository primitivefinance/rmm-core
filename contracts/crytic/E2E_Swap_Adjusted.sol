pragma solidity 0.8.6;
import "./E2E_Helper.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract E2E_swap --config contracts/crytic/E2E_swap.yaml
contract E2E_Swap_Adjusted is E2E_Helper {
    bool inited;
    PoolParams params;
    CreateArgs createArgs;

    // Tests

    // just to stay sane
    function test_init(uint128 _seed) internal {
        if (!inited)  {
            mint_tokens(1e11 ether, 1e11 ether);
        }

        // Step 1
        uint32 time = uint32(engine.time());
        assert(params.strike > 0);
        assert(params.sigma > 0);
        assert(params.gamma > 0);
        assert(params.maturity >= time);
        assert(params.lastTimestamp >= time);

        // Step 2
        assert(createArgs.riskyPerLp > 0);
        assert(createArgs.riskyPerLp <= _getMaxRisky());
        assert(createArgs.delLiquidity >= engine.MIN_LIQUIDITY());

        // Step 4
        assert(createdPoolIds[address(engine)].length > 0);
        assert(risky.balanceOf(address(engine)) > 0);
        assert(stable.balanceOf(address(engine)) > 0);

        // Step 5
        assert(inited);
    }

    function test_swap_risky_in(uint128 _amountIn) public {
        // Step 1 - conditions
        require(_amountIn != 0);

        // Step 2
        if (!inited) _init(_amountIn);

        // Step 3
        bytes32 poolId = createdPoolIds[address(engine)][0];
        (uint128 strike, uint32 sigma, uint32 maturity, , uint32 gamma) = engine.calibrations(poolId);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = engine.reserves(poolId);
        uint32 tau = uint32(engine.time()) > maturity ? 0 : maturity - uint32(engine.time());
        {
            uint256 maxDeltaIn = _compute_max_swap_input(true, reserveRisky, reserveStable, liquidity, strike);
            _amountIn = uint128(1 + (_amountIn % (maxDeltaIn - 1))); // add 1 so its always > 0
        }

        ExactInput memory exactIn = ExactInput({
            poolId: poolId,
            amountIn: uint128(_amountIn),
            reserveRisky: reserveRisky,
            reserveStable: reserveStable,
            reserveLiquidity: liquidity,
            strike: strike,
            sigma: sigma,
            gamma: gamma,
            maturity: maturity,
            tau: tau
        });

        // Step 3 - conditions
        _swap_precondition_1(exactIn.maturity);

        // Step 4
        uint256 amountOut = _simulate_exact_risky_in(exactIn);

        SwapHelper memory swapHelper = SwapHelper({
            poolId: poolId,
            riskyForStable: true,
            deltaIn: exactIn.amountIn,
            deltaOut: amountOut,
            fromMargin: false,
            toMargin: false
        });

        // Step 5
        _swap_pre_condition_2(swapHelper.deltaIn, swapHelper.deltaOut);
        if (risky.balanceOf(address(this)) < exactIn.amountIn) risky.mint(address(this), exactIn.amountIn);
        _swap_helper(swapHelper);
    }

    function test_reverse_swap(uint128 _amountIn) public {
        // Step 1 - conditions
        require(_amountIn != 0);

        // Step 2
        if (!inited) _init(_amountIn);

        // Step 3
        bytes32 poolId = createdPoolIds[address(engine)][0];
        (uint128 strike, uint32 sigma, uint32 maturity, , uint32 gamma) = engine.calibrations(poolId);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = engine.reserves(poolId);
        uint32 tau = uint32(engine.time()) > maturity ? 0 : maturity - uint32(engine.time());
        {
            uint256 maxDeltaIn = _compute_max_swap_input(true, reserveRisky, reserveStable, liquidity, strike);
            _amountIn = uint128(1 + (_amountIn % (maxDeltaIn - 1))); // add 1 so its always > 0
        }

        ExactInput memory exactIn = ExactInput({
            poolId: poolId,
            amountIn: uint128(_amountIn),
            reserveRisky: reserveRisky,
            reserveStable: reserveStable,
            reserveLiquidity: liquidity,
            strike: strike,
            sigma: sigma,
            gamma: gamma,
            maturity: maturity,
            tau: tau
        });

        // Step 3 - conditions
        _swap_precondition_1(exactIn.maturity);

        // Step 4
        uint256 amountOut = _simulate_exact_risky_in(exactIn);

        SwapHelper memory swapHelper = SwapHelper({
            poolId: poolId,
            riskyForStable: true,
            deltaIn: exactIn.amountIn,
            deltaOut: amountOut,
            fromMargin: false,
            toMargin: false
        });

        // Step 5 - Swap some amount in forward direction
        _swap_pre_condition_2(swapHelper.deltaIn, swapHelper.deltaOut);
        if (risky.balanceOf(address(this)) < exactIn.amountIn) risky.mint(address(this), exactIn.amountIn);
        _swap_helper(swapHelper);

        // Step 6 - Then swap it back
        require(exactIn.gamma < 10000); // fee is non-zero
        swapHelper = SwapHelper({
            poolId: poolId,
            riskyForStable: false,
            deltaIn: amountOut,
            deltaOut: exactIn.amountIn, // should not be getting same amount out, since fees were paid
            fromMargin: false,
            toMargin: false
        });
        _reverting_swap_helper(swapHelper);
    }

    function test_swap_stable_in(uint128 _amountIn) public {
        // Step 1 - conditions
        require(_amountIn != 0);

        // Step 2
        if (!inited) _init(_amountIn);

        // Step 3
        bytes32 poolId = createdPoolIds[address(engine)][0];
        (uint128 strike, uint32 sigma, uint32 maturity, , uint32 gamma) = engine.calibrations(poolId);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = engine.reserves(poolId);
        uint32 tau = uint32(engine.time()) > maturity ? 0 : maturity - uint32(engine.time());
        {
            uint256 maxDeltaIn = _compute_max_swap_input(false, reserveRisky, reserveStable, liquidity, strike);
            _amountIn = uint128(1 + (_amountIn % (maxDeltaIn - 1))); // add 1 so its always > 0
        }

        ExactInput memory exactIn = ExactInput({
            poolId: poolId,
            amountIn: uint128(_amountIn),
            reserveRisky: reserveRisky,
            reserveStable: reserveStable,
            reserveLiquidity: liquidity,
            strike: strike,
            sigma: sigma,
            gamma: gamma,
            maturity: maturity,
            tau: tau
        });

        // Step 3 - conditions
        _swap_precondition_1(exactIn.maturity);

        // Step 4
        uint256 amountOut = _simulate_exact_stable_in(exactIn);

        SwapHelper memory swapHelper = SwapHelper({
            poolId: poolId,
            riskyForStable: false,
            deltaIn: exactIn.amountIn,
            deltaOut: amountOut,
            fromMargin: false,
            toMargin: false
        });

        // Step 5
        _swap_pre_condition_2(swapHelper.deltaIn, swapHelper.deltaOut);
        if (stable.balanceOf(address(this)) < exactIn.amountIn) stable.mint(address(this), exactIn.amountIn);
        _swap_helper(swapHelper);
    }

    // Utils

    function check_swap_invariants(
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

    function _swap_precondition_1(uint32 maturity) internal {
        require(maturity + engine.BUFFER() >= uint32(engine.time()));
    }

    function _swap_pre_condition_2(uint256 input, uint256 output) internal {
        require(input != 0 && output != 0);
    }

    event InvariantCheck(int128 pre, int128 post);

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
        uint32 maturity;
        uint32 tau;
    }

    function _simulate_exact_risky_in(ExactInput memory i) internal returns (uint256) {
        // riskyDecimals, stableDecinmals = 18 for now
        // Need timestamp updated
        int128 invariantBefore = engine.invariantOf(i.poolId);

        uint256 deltaOut;
        uint256 adjustedRisky;
        uint256 adjustedStable;
        {
            uint256 deltaInWithFee = (i.amountIn * i.gamma) / 1e4; // amount * (1 - fee %)
            uint256 upscaledAdjustedRisky = uint256(i.reserveRisky) + deltaInWithFee; // total

            // compute delta out
            adjustedRisky = (upscaledAdjustedRisky * 1e18) / i.reserveLiquidity; // per
            adjustedStable = ReplicationMath.getStableGivenRisky(
                invariantBefore,
                engine.scaleFactorRisky(),
                engine.scaleFactorStable(),
                adjustedRisky,
                i.strike,
                i.sigma,
                i.tau
            );
            adjustedStable += 1; // round up on output reserve
        }

        require(i.tau == 0 ? adjustedRisky >= 0 : adjustedRisky > 0);
        require(i.tau == 0 ? adjustedStable >= 0 : adjustedStable > 0);
        require(adjustedRisky <= 10**risky.decimals());
        require(adjustedStable <= i.strike);

        int128 invariantAfter = ReplicationMath.calcInvariant(
            engine.scaleFactorRisky(),
            engine.scaleFactorStable(),
            adjustedRisky,
            adjustedStable,
            i.strike,
            i.sigma,
            i.tau
        );

        emit InvariantCheck(invariantBefore, invariantAfter);
        assert(invariantAfter >= invariantBefore);

        uint256 upscaledAdjustedStable = (adjustedStable * i.reserveLiquidity) / 1e18 + 1; // round up on output reserve
        deltaOut = uint256(i.reserveStable) - upscaledAdjustedStable; // total
        return deltaOut;
    }

    function _simulate_exact_stable_in(ExactInput memory i) internal returns (uint256) {
        // riskyDecimals, stableDecinmals = 18 for now
        // Need timestamp updated
        int128 invariantBefore = engine.invariantOf(i.poolId);

        uint256 deltaOut;
        uint256 adjustedRisky;
        uint256 adjustedStable;
        {
            uint256 deltaInWithFee = (i.amountIn * i.gamma) / 1e4; // amount * (1 - fee %)
            uint256 upscaledAdjustedStable = uint256(i.reserveStable) + deltaInWithFee; // total

            // compute delta out
            adjustedStable = (upscaledAdjustedStable * 1e18) / i.reserveLiquidity; // per
            adjustedRisky = get_risky_given_stable_bisection(adjustedStable, i.strike, i.sigma, i.tau);
            //adjustedRisky = ReplicationMath.getRiskyGivenStable(
            //    invariantBefore,
            //    engine.scaleFactorRisky(),
            //    engine.scaleFactorStable(),
            //    adjustedStable,
            //    i.strike,
            //    i.sigma,
            //    i.tau
            //);
            adjustedRisky += 1; // round up on output reserve
        }

        require(i.tau == 0 ? adjustedRisky >= 0 : adjustedRisky > 0);
        require(i.tau == 0 ? adjustedStable >= 0 : adjustedStable > 0);
        require(adjustedRisky <= 10**risky.decimals());
        require(adjustedStable <= i.strike);

        int128 invariantAfter = ReplicationMath.calcInvariant(
            engine.scaleFactorRisky(),
            engine.scaleFactorStable(),
            adjustedRisky,
            adjustedStable,
            i.strike,
            i.sigma,
            i.tau
        );

        emit InvariantCheck(invariantBefore, invariantAfter);
        assert(invariantAfter >= invariantBefore);

        uint256 upscaleAdjustedRisky = (adjustedRisky * i.reserveLiquidity) / 1e18 + 1; // round up on output reserve
        deltaOut = uint256(i.reserveRisky) - upscaleAdjustedRisky; // total
        return deltaOut;
    }

    function _getMaxRisky() internal returns (uint256) {
        return 10**risky.decimals();
    }

    function _compute_max_swap_input(
        bool riskyForStable,
        uint128 reserveRisky,
        uint128 reserveStable,
        uint128 liquidity,
        uint128 strike
    ) internal returns (uint256) {
        if (riskyForStable) {
            uint256 riskyPerLiquidity = (uint256(reserveRisky) * 1e18) / liquidity;
            return (uint256(_getMaxRisky() - riskyPerLiquidity) * liquidity) / 1e18;
        } else {
            uint256 stablePerLiquidity = (uint256(reserveStable) * 1e18) / liquidity;
            return (uint256(strike - stablePerLiquidity) * liquidity) / 1e18;
        }
    }

    // Setup

    function _init(uint128 _seed) internal {
        // Step 1
        params = _forgeCalibration(_seed);

        // Step 2
        createArgs = _forgeCreateArgs(_seed);
        (uint256 delRisky, uint256 delStable) = _calculate_create_pool_payment(
            createArgs.riskyPerLp,
            createArgs.delLiquidity,
            params.strike,
            params.sigma,
            params.maturity
        );

        // Step 3
        E2E_Helper.mint_tokens(delRisky, delStable);

        // Step 4
        _create_helper(createArgs.riskyPerLp, createArgs.delLiquidity, abi.encode(0));

        // Step 5
        inited = true;
    }

    // verifies create argument `riskyPerLp`, and condition for non-zero reserves
    function _calculate_create_pool_payment(
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
    }

    struct PoolBounds {
        uint128 min_strike;
        uint128 max_strike;
        uint32 min_sigma;
        uint32 max_sigma;
        uint32 min_gamma;
        uint32 max_gamma;
    }

    struct PoolParams {
        uint128 strike;
        uint32 sigma;
        uint32 maturity;
        uint32 lastTimestamp;
        uint32 gamma;
    }

    /// should always return valid calibration parameters
    function _forgeCalibration(uint256 _seed) internal returns (PoolParams memory calibration) {
        PoolBounds memory bounds = PoolBounds({
            min_strike: 1 ether,
            max_strike: 10_000 ether,
            min_sigma: 100, // 0.01%
            max_sigma: 10_000_000, // 1000%
            min_gamma: 9_000, // 90%
            max_gamma: 10_000 // 99.99%
        });

        calibration.strike = uint128(bounds.min_strike + (_seed % (bounds.max_strike - bounds.min_strike)));
        calibration.sigma = uint32(bounds.min_sigma + (_seed % (bounds.max_sigma - bounds.min_sigma)));
        calibration.gamma = uint32(bounds.min_gamma + (_seed % (bounds.max_gamma - bounds.min_gamma)));
        calibration.maturity = uint32(31556952 + ((_seed % (type(uint32).max)) - 1));
        calibration.lastTimestamp = uint32(engine.time());
        require(calibration.maturity >= calibration.lastTimestamp);
    }

    struct CreateBounds {
        uint256 min_risky;
        uint256 max_risky;
        uint256 min_liquidity;
        uint256 max_liquidity;
    }

    struct CreateArgs {
        uint256 riskyPerLp;
        uint256 delLiquidity;
    }

    uint256 min_liquidity_override = 1 ether;

    // should always return valid create args
    function _forgeCreateArgs(uint256 _seed) internal returns (CreateArgs memory args) {
        CreateBounds memory bounds = CreateBounds({
            min_risky: 1,
            max_risky: _getMaxRisky(),
            min_liquidity: engine.MIN_LIQUIDITY(),
            max_liquidity: type(uint64).max
        });

        args.riskyPerLp = bounds.min_risky + (_seed % (bounds.max_risky - bounds.min_risky));
        args.delLiquidity = bounds.min_liquidity + (_seed % (bounds.max_liquidity - bounds.min_liquidity));
        args.delLiquidity += min_liquidity_override; // for swaps, seed inital liquidity beyond min
        require(args.riskyPerLp <= engine.PRECISION() / engine.scaleFactorRisky());
    }

    // Helper

    event FailedSwap(
        bytes32 poolId,
        bool riskyForStable,
        uint256 reserveRisky,
        uint256 reserveStable,
        uint256 amountIn,
        uint256 amountOut
    );

    event KnownError(string msg);
    event UnknownError(string msg);
    event Panicked(uint256 val);
    event ErrorSig(bytes32 s);

    struct SwapHelper {
        bytes32 poolId;
        uint256 deltaIn;
        uint256 deltaOut;
        bool fromMargin;
        bool toMargin;
        bool riskyForStable;
    }

    function _swap_helper(SwapHelper memory s) internal {
        int128 pre_invariant = engine.invariantOf(s.poolId);
        (uint128 pre_risky, uint128 pre_stable, , , , , ) = engine.reserves(s.poolId);

        require(s.riskyForStable ? pre_stable >= s.deltaOut : pre_risky >= s.deltaOut);
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
            check_swap_invariants(s.poolId, s.riskyForStable, pre_invariant, pre_risky, pre_stable);
        } catch Error(string memory reason) {
            emit KnownError(reason);
        } catch Panic(uint256 code) {
            emit Panicked(code);
        } catch (bytes memory err) {
            // better logging
            if (bytes4(keccak256("InvariantError(int128,int128)")) == bytes4(err)) {
                emit KnownError("InvariantError(int128,int128)");
            } else if (bytes4(keccak256(("PoolExpiredError()"))) == bytes4(err)) {
                emit KnownError("PoolExpiredError");
            } else {
                emit ErrorSig(keccak256(err));
                emit UnknownError("Unknown");
            }

            emit FailedSwap(s.poolId, s.riskyForStable, pre_risky, pre_stable, s.deltaIn, s.deltaOut);
            assert(false);
        }
    }

    function _reverting_swap_helper(SwapHelper memory s) internal {
        (uint128 pre_risky, uint128 pre_stable, , , , , ) = engine.reserves(s.poolId);
        require(s.riskyForStable ? pre_stable >= s.deltaOut : pre_risky >= s.deltaOut);
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

    event AddedPool(
        bytes32 poolId,
        uint256 riskyPerLiquidity,
        uint256 delLiquidity,
        uint128 strike,
        uint32 sigma,
        uint32 maturity,
        uint32 gamma,
        uint32 timestamp
    );
    event FailedCreating(
        uint128 strike,
        uint32 sigma,
        uint32 maturity,
        uint32 gamma,
        uint256 riskyPerLp,
        uint256 liquidity
    );

    function _create_helper(
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
            createdPoolIds[address(engine)].push(poolId);

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
                riskyPerLp,
                delLiquidity,
                calibrationStrike,
                calibrationSigma,
                calibrationMaturity,
                calibrationGamma,
                calibrationTimestamp
            );
        } catch {
            emit FailedCreating(strike, sigma, maturity, gamma, riskyPerLp, delLiquidity);
            assert(false);
        }
    }

    // Bisection
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
}
