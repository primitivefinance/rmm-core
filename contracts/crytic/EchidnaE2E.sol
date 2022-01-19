pragma solidity 0.8.6;

import "../test/engine/MockEngine.sol";
import "../PrimitiveFactory.sol";
import "../interfaces/IERC20.sol";
import "../test/TestRouter.sol";
import "../test/TestToken.sol";

// echidna-test-2.0 . --contract EchidnaE2E --config contracts/config/E2E.yaml
contract EchidnaE2E {
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

    event AllocateFailed(string reason, uint256 risky, uint256 stable);
    event AllocateRevert(bytes reason, uint256 risky, uint256 stable);

    function allocate_call_should_not_revert(
        uint256 randomId,
        uint256 delRisky,
        uint256 delStable
    ) public {
        delRisky = delRisky + 5;
        delStable = delStable + 5;
        mint_tokens(delRisky, delStable);
        bytes32 poolId = retrieve_created_pool(randomId);
        (, , uint32 maturity, , ) = engine.calibrations(poolId);
        require(maturity >= engine.time()); //pool must not be expired

        uint256 preAllocateLiquidity = engine.liquidity(address(this), poolId);
        (
            uint128 preAllocateRisky,
            uint128 preAllocateStable,
            uint128 preLiquidity,
            uint32 preAllocateTimestamp,
            ,
            ,

        ) = engine.reserves(poolId);
        uint256 preCalcLiquidity;
        {
            uint256 liquidity0 = (delRisky * preLiquidity) / uint256(preAllocateRisky);
            uint256 liquidity1 = (delStable * preLiquidity) / uint256(preAllocateStable);
            preCalcLiquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
            require(preCalcLiquidity > 0);
        }

        try engine.allocate(poolId, address(this), delRisky, delStable, false, abi.encode(0)) returns (
            uint256 delLiquidity
        ) {
            uint256 postAllocateLiquidity = engine.liquidity(address(this), poolId);
            (
                uint128 postAllocateRisky,
                uint128 postAllocateStable,
                uint128 postLiquidity,
                uint32 postAllocateTimestamp,
                ,
                ,

            ) = engine.reserves(poolId);
            assert(postAllocateTimestamp == engine.time());
            assert(postAllocateTimestamp >= preAllocateTimestamp);
            assert(postAllocateRisky - preAllocateRisky == delRisky);
            assert(postAllocateStable - preAllocateStable == delStable);
            assert(postAllocateLiquidity > preAllocateLiquidity);
            assert(postLiquidity - preLiquidity == delLiquidity);
            assert(preCalcLiquidity == delLiquidity);
        } catch Error(string memory reason) {
            uint256 balanceOfThisRisky = risky.balanceOf(address(this));
            uint256 balanceOfThisStable = stable.balanceOf(address(this));
            emit AllocateFailed(reason, balanceOfThisRisky, balanceOfThisStable);
            assert(false);
        } catch (bytes memory lowLevelData) {
            uint256 balanceOfThisRisky = risky.balanceOf(address(this));
            uint256 balanceOfThisStable = stable.balanceOf(address(this));
            emit AllocateRevert(lowLevelData, balanceOfThisRisky, balanceOfThisStable);
            assert(false);
        }
    }

    function check_deposit_withdraw(uint256 riskyAmount, uint256 stableAmount) public {
        deposit_with_safe_range(address(this), riskyAmount, stableAmount);
        withdraw_with_safe_range(address(this), riskyAmount, stableAmount);
    }

    event DepositCall(uint256 marginRiskyBefore, uint256 marginStableBefore);
    event DepositFailed(string reason, uint256 risky, uint256 stable);
    event DepositRevert(bytes reason, uint256 risky, uint256 stable);

    function deposit_with_no_specified_range(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        delRisky += 1;
        delStable += 1;
        mint_tokens(delRisky, delStable);
        deposit_helper(recipient, delRisky, delStable);
    }

    function deposit_with_safe_range(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        //ensures that delRisky and delStable are at least 1 and not too large to overflow the deposit
        delRisky = 1 + (delRisky % (type(uint64).max - 1));
        delStable = 1 + (delStable % (type(uint64).max - 1));
        mint_tokens(delRisky, delStable);
        deposit_helper(recipient, delRisky, delStable);
    }

    function deposit_helper(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        emit DepositCall(marginRiskyBefore, marginStableBefore);
        uint256 balanceSenderRiskyBefore = risky.balanceOf(address(this));
        uint256 balanceSenderStableBefore = stable.balanceOf(address(this));
        uint256 balanceEngineRiskyBefore = risky.balanceOf(address(engine));
        uint256 balanceEngineStableBefore = stable.balanceOf(address(engine));

        try engine.deposit(recipient, delRisky, delStable, abi.encode(0)) {
            (uint128 marginRiskyAfter, uint128 marginStableAfter) = engine.margins(recipient);
            assert(marginRiskyAfter == marginRiskyBefore + delRisky);
            assert(marginStableAfter == marginStableBefore + delStable);
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

    function withdraw_with_no_bounds(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        delRisky = 1;
        delStable = 1;
        withdraw_helper(recipient, delRisky, delStable);
    }

    function withdraw_with_safe_range(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        //ensures that delRisky and delStable are at least 1 and not too large to overflow the deposit
        delRisky = 1 + (delRisky % (type(uint64).max - 1));
        delStable = 1 + (delStable % (type(uint64).max - 1));
        withdraw_helper(recipient, delRisky, delStable);
    }

    function withdraw_helper(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) internal {
        (uint128 marginRiskyBefore, uint128 marginStableBefore) = engine.margins(recipient);
        require(marginRiskyBefore >= delRisky);
        require(marginStableBefore >= delStable);
        uint256 balanceRecipientRiskyBefore = risky.balanceOf(recipient);
        uint256 balanceRecipientStableBefore = stable.balanceOf(recipient);
        uint256 balanceEngineRiskyBefore = risky.balanceOf(address(engine));
        uint256 balanceEngineStableBefore = stable.balanceOf(address(engine));

        try engine.withdraw(recipient, delRisky, delStable) {
            (uint128 marginRiskyAfter, uint128 marginStableAfter) = engine.margins(recipient);
            assert(marginRiskyAfter == marginRiskyBefore - delRisky);
            assert(marginStableAfter == marginStableBefore - delStable);
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

    function executeCallback(uint256 delRisky, uint256 delStable) internal {
        if (delRisky > 0) {
            risky.transfer(address(engine), delRisky);
        }
        if (delStable > 0) {
            stable.transfer(address(engine), delStable);
        }
    }
}
