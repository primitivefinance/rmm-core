// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.4;

import "./ABDKMath64x64.sol";
import "./CumulativeNormalDistribution.sol";
import "./Units.sol";

/// @title   Replication Math
/// @author  Primitive
/// @notice  Alex Evans, Guillermo Angeris, and Tarun Chitra. Replicating Market Makers.
///          https://stanford.edu/~guillean/papers/rmms.pdf
library ReplicationMath {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    int128 internal constant ONE_INT = 0x10000000000000000;

    /// @notice         Normalizes volatility with respect to square root of time until expiry
    /// @param   sigma  Unsigned 256-bit percentage as an integer with precision of 1e4, 10000 = 100%
    /// @param   tau    Time until expiry in seconds as an unsigned 256-bit integer
    /// @return  vol    Signed fixed point 64.64 number equal to sigma * sqrt(tau)
    function getProportionalVolatility(uint256 sigma, uint256 tau) internal pure returns (int128 vol) {
        int128 sqrtTauX64 = tau.toYears().sqrt();
        int128 sigmaX64 = sigma.percentageToX64();
        vol = sigmaX64.mul(sqrtTauX64);
    }

    /// @notice                 Uses riskyPerLiquidity and invariant to calculate stablePerLiquidity
    /// @dev                    Converts unsigned 256-bit values to fixed point 64.64 numbers w/ decimals of precision
    /// @param   invariantLastX64   Signed 64.64 fixed point number. Calculated w/ same `tau` as the parameter `tau`
    /// @param   scaleFactorRisky   Unsigned 256-bit integer scaling factor for `risky`, 10^(18 - risky.decimals())
    /// @param   scaleFactorStable  Unsigned 256-bit integer scaling factor for `stable`, 10^(18 - stable.decimals())
    /// @param   riskyPerLiquidity  Unsigned 256-bit integer of Pool's risky reserves *per liquidity*, 0 <= x <= 1
    /// @param   strike         Unsigned 256-bit integer value with precision equal to 10^(18 - scaleFactorStable)
    /// @param   sigma          Volatility of the Pool as an unsigned 256-bit integer w/ precision of 1e4, 10000 = 100%
    /// @param   tau            Time until expiry in seconds as an unsigned 256-bit integer
    /// @return  stablePerLiquidity = K*CDF(CDF^-1(1 - riskyPerLiquidity) - sigma*sqrt(tau)) + invariantLastX64 as uint
    function getStableGivenRisky(
        int128 invariantLastX64,
        uint256 scaleFactorRisky,
        uint256 scaleFactorStable,
        uint256 riskyPerLiquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (uint256 stablePerLiquidity) {
        int128 strikeX64 = strike.scaleToX64(scaleFactorStable);
        int128 riskyX64 = riskyPerLiquidity.scaleToX64(scaleFactorRisky); // mul by 2^64, div by precision
        int128 oneMinusRiskyX64 = ONE_INT.sub(riskyX64);
        if (tau != 0) {
            int128 volX64 = getProportionalVolatility(sigma, tau);
            int128 phi = oneMinusRiskyX64.getInverseCDF();
            int128 input = phi.sub(volX64);
            int128 stableX64 = strikeX64.mul(input.getCDF()).add(invariantLastX64);
            stablePerLiquidity = stableX64.scaleFromX64(scaleFactorStable);
        } else {
            stablePerLiquidity = (strikeX64.mul(oneMinusRiskyX64).add(invariantLastX64)).scaleFromX64(
                scaleFactorStable
            );
        }
    }

    /// @notice                 Calculates the invariant of a curve
    /// @dev                    Per unit of replication, aka per unit of liquidity
    /// @param   scaleFactorRisky   Unsigned 256-bit integer scaling factor for `risky`, 10^(18 - risky.decimals())
    /// @param   scaleFactorStable  Unsigned 256-bit integer scaling factor for `stable`, 10^(18 - stable.decimals())
    /// @param   riskyPerLiquidity  Unsigned 256-bit integer of Pool's risky reserves *per liquidity*, 0 <= x <= 1
    /// @param   stablePerLiquidity Unsigned 256-bit integer of Pool's stable reserves *per liquidity*, 0 <= x <= strike
    /// @return  invariantX64       = stablePerLiquidity - K * CDF(CDF^-1(1 - riskyPerLiquidity) - sigma * sqrt(tau))
    function calcInvariant(
        uint256 scaleFactorRisky,
        uint256 scaleFactorStable,
        uint256 riskyPerLiquidity,
        uint256 stablePerLiquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128 invariantX64) {
        uint256 output = getStableGivenRisky(
            0,
            scaleFactorRisky,
            scaleFactorStable,
            riskyPerLiquidity,
            strike,
            sigma,
            tau
        );
        int128 outputX64 = output.scaleToX64(scaleFactorStable);
        int128 stableX64 = stablePerLiquidity.scaleToX64(scaleFactorStable);
        invariantX64 = stableX64.sub(outputX64);
    }
}
