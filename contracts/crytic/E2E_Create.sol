pragma solidity 0.8.6;
import "./E2E_Helper.sol";

contract E2E_Create is Addresses, E2E_Helper {
    struct CreateHelper {
        uint128 strike;
        uint32 sigma;
        uint32 maturity;
        uint256 riskyPerLp;
        uint256 delLiquidity;
        uint32 gamma;
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
        CreateHelper memory args = CreateHelper({
            strike: strike,
            sigma: sigma,
            maturity: maturity,
            delLiquidity: delLiquidity,
            riskyPerLp: riskyPerLp,
            gamma: gamma
        });
        (uint256 delRisky, uint256 delStable) = calculate_del_risky_and_stable(args);

        create_helper(args, abi.encode(0));
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
        CreateHelper memory args = CreateHelper({
            strike: strike,
            sigma: sigma,
            maturity: maturity,
            delLiquidity: delLiquidity,
            riskyPerLp: riskyPerLp,
            gamma: gamma
        });
        (uint256 delRisky, uint256 delStable) = calculate_del_risky_and_stable(args);

        if (gamma > 10000 || gamma < 9000) {
            create_should_revert(args, abi.encode(0));
        }
    }

    function create_should_revert(CreateHelper memory params, bytes memory data) internal {
        try
            engine.create(
                params.strike,
                params.sigma,
                params.maturity,
                params.gamma,
                params.riskyPerLp,
                params.delLiquidity,
                abi.encode(0)
            )
        {
            assert(false);
        } catch {
            assert(true);
        }
    }

    function create_helper(
        CreateHelper memory params,
        bytes memory data

    ) internal {
        try engine.create(params.strike, params.sigma, params.maturity, params.gamma, params.riskyPerLp, params.delLiquidity, data) {
            bytes32 poolId = keccak256(abi.encodePacked(address(engine), params.strike, params.sigma, params.maturity, params.gamma));
            Addresses.add_to_created_pool(poolId);
            (
                uint128 calibrationStrike,
                uint32 calibrationSigma,
                uint32 calibrationMaturity,
                uint32 calibrationTimestamp,
                uint32 calibrationGamma
            ) = engine.calibrations(poolId);
            assert(calibrationTimestamp == engine.time());
            assert(calibrationGamma == params.gamma);
            assert(calibrationStrike == params.strike);
            assert(calibrationSigma == params.sigma);
            assert(calibrationMaturity == params.maturity);
        } catch {
            assert(false);
        }
    }

    function calculate_del_risky_and_stable(CreateHelper memory params)
        internal
        returns (uint256 delRisky, uint256 delStable)
    {
        uint256 factor0 = engine.scaleFactorRisky();
        uint256 factor1 = engine.scaleFactorStable();
        uint32 tau = params.maturity - uint32(engine.time()); // time until expiry
        require(params.riskyPerLp <= engine.PRECISION() / factor0);

        delStable = ReplicationMath.getStableGivenRisky(
            0,
            factor0,
            factor1,
            params.riskyPerLp,
            params.strike,
            params.sigma,
            tau
        );
        delRisky = (params.riskyPerLp * params.delLiquidity) / engine.PRECISION(); // riskyDecimals * 1e18 decimals / 1e18 = riskyDecimals
        require(delRisky > 0);
        delStable = (delStable * params.delLiquidity) / engine.PRECISION();
        require(delStable > 0);
        mint_tokens(delRisky, delStable);
    }

    function createCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) external {
        executeCallback(delRisky, delStable);
    }
}
