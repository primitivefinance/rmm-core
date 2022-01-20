pragma solidity 0.8.6;
import "../test/engine/MockEngine.sol";
import "../PrimitiveFactory.sol";
import "../interfaces/IERC20.sol";
import "../test/TestRouter.sol";
import "../test/TestToken.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract EchidnaE2E --config contracts/crytic/E2E.yaml
contract EchidnaE2E1 {
    struct PoolData {
        Reserve.Data reserve;
        Margin.Data margin;
        uint256 liquidity;
    }
    PoolData precall;
    PoolData postcall;
    MockEngine engine = MockEngine(0x871DD7C2B4b25E1Aa18728e9D5f2Af4C4e431f5c);
    TestToken risky = TestToken(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    TestToken stable = TestToken(0x1D7022f5B17d2F8B695918FB48fa1089C9f85401);
    address manager = 0x1E2F9E10D02a6b8F8f69fcBf515e75039D2EA30d;
    TestRouter router = TestRouter(0x0B1ba0af832d7C05fD64161E0Db78E85978E8082);
    // WETH = 0xcdb594a32b1cc3479d8746279712c39d18a07fc0
    bytes32[] poolIds;

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

    function retrieve_created_pool(uint256 id) private returns (bytes32) {
        require(poolIds.length > 0);
        uint256 index = id % (poolIds.length);
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
        (uint128 balanceRisky, uint128 balanceStable) = engine.margins(address(0));
        assert(balanceRisky == 0);
        assert(balanceStable == 0);
    }

    function check_liquidity_of_zero_address(uint256 id) public {
        bytes32 poolId = retrieve_created_pool(id);

        uint256 liquidityAmount = engine.liquidity(address(0), poolId);
        assert(liquidityAmount == 0);
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

        if (gamma > 10000 || gamma < 9000) {
            try engine.create(strike, sigma, maturity, gamma, riskyPerLp, delLiquidity, abi.encode(0)) {
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

    function check_allocate_remove_inverses(
        uint256 randomId,
        uint256 delRisky,
        uint256 delStable,
        bool fromMargin
    ) public {
        bytes32 poolId = retrieve_created_pool(randomId);
        allocate_should_succeed(poolId, delRisky, delStable, fromMargin);

        (uint256 removeRisky, uint256 removeStable) = remove_should_succeed(poolId, allocate_delLiquidity);

        assert(delRisky == removeRisky);
        assert(delStable == removeStable);
        allocate_delLiquidity = 0;
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
        mint_tokens(delRisky, delStable);
        bytes32 poolId = retrieve_created_pool(randomId);
        (, , uint32 maturity, , ) = engine.calibrations(poolId);
        require(maturity >= engine.time()); //pool must not be expired

        if (fromMargin) {
            (uint128 marginRisky, uint128 marginStable) = engine.margins(address(this));
            if (marginRisky < delRisky || marginStable < delStable) {
                deposit_should_succeed(address(this), delRisky, delStable);
            }
            allocate_should_succeed(poolId, delRisky, delStable, true);
        } else {
            allocate_should_succeed(poolId, delRisky, delStable, false);
        }
    }

    uint256 allocate_delLiquidity;

    function allocate_should_succeed(
        bytes32 poolId,
        uint256 delRisky,
        uint256 delStable,
        bool fromMargin
    ) internal {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(address(this));
        retrieve_current_pool_data(poolId, true);
        uint256 preCalcLiquidity;
        {
            uint256 liquidity0 = (delRisky * precall.reserve.liquidity) / uint256(precall.reserve.reserveRisky);
            uint256 liquidity1 = (delStable * precall.reserve.liquidity) / uint256(precall.reserve.reserveStable);
            preCalcLiquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
            require(preCalcLiquidity > 0);
        }

        try engine.allocate(poolId, address(this), delRisky, delStable, fromMargin, abi.encode(0)) returns (
            uint256 delLiquidity
        ) {
            {
                retrieve_current_pool_data(poolId, false);
                assert(postcall.reserve.blockTimestamp == engine.time());
                assert(postcall.reserve.blockTimestamp >= postcall.reserve.blockTimestamp);
                // reserves increase by allocated amount
                assert(postcall.reserve.reserveRisky - precall.reserve.reserveRisky == delRisky);
                assert(postcall.reserve.reserveStable - precall.reserve.reserveStable == delStable);
                assert(postcall.reserve.liquidity - precall.reserve.liquidity == delLiquidity);
                // save delLiquidity
                assert(preCalcLiquidity == delLiquidity);
                allocate_delLiquidity = delLiquidity;
                (uint128 marginRiskyAfter, uint128 marginStableAfter) = engine.margins(address(this));
                if (fromMargin) {
                    assert(marginRiskyAfter == marginRiskyBefore - delRisky);
                    assert(marginStableAfter == marginStableBefore - delStable);
                } else {
                    assert(marginRiskyAfter == marginRiskyBefore);
                    assert(marginStableAfter == marginStableBefore);
                }
            }
        } catch {
            assert(false);
        }
        clear_pre_post_call();
    }

    function remove_with_safe_range(uint256 id, uint256 delLiquidity) public returns (uint256, uint256) {
        delLiquidity = one_to_max_uint64(delLiquidity);
        bytes32 poolId = retrieve_created_pool(id);
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

    function withdraw_with_safe_range(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        //ensures that delRisky and delStable are at least 1 and not too large to overflow the deposit
        delRisky = one_to_max_uint64(delRisky);
        delStable = one_to_max_uint64(delStable);
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        require(marginRiskyBefore >= delRisky);
        require(marginStableBefore >= delStable);
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

    event Withdraw(
        uint128 marginRiskyBefore,
        uint128 marginStableBefore,
        uint256 delRisky,
        uint256 delStable
    );
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
            return ((risky.decimals() - riskyPerLiquidity) * liquidity) / 1e18;
        } else {
            uint256 stablePerLiquidity = (reserveStable * 1e18) / liquidity;
            return ((strike - stablePerLiquidity) * liquidity) / 1e18;
        }
    }

    function check_reverse_swap(
        uint256 randomId,
        uint256 deltaIn,
        uint256 riskyForStable
    ) public {
        bytes32 poolId = retrieve_created_pool(randomId);
        (uint128 strike, uint32 sigma, uint32 maturity, , uint32 gamma) = engine.calibrations(poolId);
        require(maturity + engine.BUFFER() >= uint32(engine.time()));
        uint32 tau = uint32(engine.time()) > maturity ? 0 : maturity - uint32(engine.time());
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = engine.reserves(poolId);
        {
            uint256 maxDeltaIn = get_max_deltaIn(riskyForStable % 2 == 0 ? true : false, reserveRisky, reserveStable, liquidity, strike);
            deltaIn = 1 + deltaIn % maxDeltaIn;
        }
        ExactInput memory exactInput = ExactInput({
            poolId: poolId, amountIn: deltaIn, reserveRisky: reserveRisky, reserveStable: reserveStable, reserveLiquidity: liquidity, strike: strike, sigma: sigma, gamma: gamma, tau: tau
        });
        uint256 deltaOut = (riskyForStable % 2 == 0 ? true : false) ? 
            exactRiskyInput(exactInput) :
            exactStableInput(exactInput);
        
        SwapHelper memory swapHelper = SwapHelper({
            poolId: poolId, riskyForStable: riskyForStable % 2 == 0 ? true : false, deltaIn: deltaIn, deltaOut: deltaOut, fromMargin: false, toMargin: false
        });
        swap_helper(swapHelper);
        
        (reserveRisky, reserveStable, liquidity, , , , ) = engine.reserves(poolId);
        exactInput = ExactInput({
            poolId: poolId, amountIn: deltaOut, reserveRisky: reserveRisky, reserveStable: reserveStable, reserveLiquidity: liquidity, strike: strike, sigma: sigma, gamma: gamma, tau: tau
        });
        deltaOut = (riskyForStable % 2 == 1 ? true : false) ? 
            exactRiskyInput(exactInput) :
            exactStableInput(exactInput);
        assert(deltaOut == deltaIn);
        swapHelper = SwapHelper({
            poolId: poolId, riskyForStable: riskyForStable % 2 == 1 ? true : false, deltaIn: deltaIn, deltaOut: deltaOut, fromMargin: false, toMargin: false
        });
        swap_helper(swapHelper);

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
        try engine.swap(address(this), s.poolId, s.riskyForStable, s.deltaIn, s.deltaOut, s.fromMargin, s.toMargin, abi.encode(0)) {
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
                0,
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
                0,
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

    function executeCallback(uint256 delRisky, uint256 delStable) internal {
        if (delRisky > 0) {
            risky.transfer(address(engine), delRisky);
        }
        if (delStable > 0) {
            stable.transfer(address(engine), delStable);
        }
    }
}