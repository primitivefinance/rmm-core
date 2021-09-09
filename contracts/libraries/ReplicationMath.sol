// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title   Replication Math
/// @author  Primitive
/// @notice  Alex Evans, Guillermo Angeris, and Tarun Chitra. Replicating Market Makers.
///          https://stanford.edu/~guillean/papers/rmms.pdf

import "./ABDKMath64x64.sol";
import "./CumulativeNormalDistribution.sol";
import "./Units.sol";

library ReplicationMath {
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    int128 internal constant ONE_INT = int128(2**64);

    // ===== Math ======

    /// @notice         Normalizes volatility with respect to square root of time until expiry
    /// @param   sigma  Unsigned 256-bit percentage as an integer with precision of 1e4, 10000 = 100%
    /// @param   tau    Time until expiry in seconds as an unsigned 256-bit integer
    /// @return  vol    Signed fixed point 64.64 number equal to sigma * sqrt(tau)
    function getProportionalVolatility(uint256 sigma, uint256 tau) internal pure returns (int128 vol) {
        int128 sqrtTauX64 = tau.toYears().sqrt();
        int128 sigmaX64 = sigma.percentage();
        vol = sigmaX64.mul(sqrtTauX64);
    }

    /// @notice                 Uses riskyPerLiquidity and invariant to calculate stablePerLiquidity
    /// @dev                    Converts unsigned 256-bit values to fixed point 64.64 numbers w/ decimals of precision
    /// @param   invariantLastX64   Signed 64.64 fixed point number. Calculated w/ same `tau` as the parameter `tau`
    /// @param   precisionRisky     Unsigned 256-bit integer scaling factor for `risky`, 10^(18 - risky.decimals())
    /// @param   precisionStable    Unsigned 256-bit integer scaling factor for `stable`, 10^(18 - stable.decimals())
    /// @param   riskyPerLiquidity  Unsigned 256-bit integer of Pool's risky reserves *per liquidity*, 0 <= x <= 1
    /// @param   strike         Unsigned 256-bit integer value with precision equal to 10^(18 - precisionStable)
    /// @param   sigma          Volatility of the Pool as an unsigned 256-bit integer w/ precision of 1e4, 10000 = 100%
    /// @param   tau            Time until expiry in seconds as an unsigned 256-bit integer
    /// @return  stablePerLiquidity = K*CDF(CDF^-1(1 - riskyPerLiquidity) - sigma*sqrt(tau)) as an unsigned 256-bit int
    function getStableGivenRisky(
        int128 invariantLastX64,
        uint256 precisionRisky,
        uint256 precisionStable,
        uint256 riskyPerLiquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (uint256 stablePerLiquidity) {
        int128 strikeX64 = strike.scaleToX64(precisionStable);
        int128 volX64 = getProportionalVolatility(sigma, tau);
        int128 riskyX64 = riskyPerLiquidity.scaleToX64(precisionRisky); // mul by 2^64, div by precision
        int128 phi = ONE_INT.sub(riskyX64).getInverseCDF(); // CDF^-1(1-x), ONE_INT = 2^64
        int128 input = phi.sub(volX64); // phi - volX64
        int128 stableX64 = strikeX64.mul(input.getCDF()).add(invariantLastX64);
        stablePerLiquidity = stableX64.scalefromX64(precisionStable);
    }

    /// @notice                 Uses stablePerLiquidity and invariant to calculate riskyPerLiquidity
    /// @dev                    Converts unsigned 256-bit values to fixed point 64.64 numbers w/ decimals of precision
    /// @param   invariantLastX64   Signed 64.64 fixed point number. Calculated w/ same `tau` as the parameter `tau`
    /// @param   precisionRisky     Unsigned 256-bit integer scaling factor for `risky`, 10^(18 - risky.decimals())
    /// @param   precisionStable    Unsigned 256-bit integer scaling factor for `stable`, 10^(18 - stable.decimals())
    /// @param   stablePerLiquidity Unsigned 256-bit integer of Pool's stable reserves *per liquidity*, 0 <= x <= strike
    /// @param   strike         Unsigned 256-bit integer value with precision equal to 10^(18 - precisionStable)
    /// @param   sigma          Volatility of the Pool as an unsigned 256-bit integer w/ precision of 1e4, 10000 = 100%
    /// @param   tau            Time until expiry in seconds as an unsigned 256-bit integer
    /// @return  riskyPerLiquidity = 1 - CDF(CDF^-1((stablePerLiquidity - invariantLastX64)/K) + sigma*sqrt(tau))
    function getRiskyGivenStable(
        int128 invariantLastX64,
        uint256 precisionRisky,
        uint256 precisionStable,
        uint256 stablePerLiquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (uint256 riskyPerLiquidity) {
        int128 strikeX64 = strike.scaleToX64(precisionStable);
        int128 volX64 = getProportionalVolatility(sigma, tau);
        int128 stableX64 = stablePerLiquidity.scaleToX64(precisionStable);
        int128 phi = stableX64.sub(invariantLastX64).div(strikeX64).getInverseCDF(); // CDF^-1((stable - invariant)/K)
        int128 input = phi.add(volX64);
        int128 riskyX64 = ONE_INT.sub(input.getCDF());
        riskyPerLiquidity = riskyX64.scalefromX64(precisionRisky);
    }

    /// @notice                 Calculates the invariant of a curve
    /// @dev                    Per unit of replication, aka per unit of liquidity
    /// @param   precisionRisky     Unsigned 256-bit integer scaling factor for `risky`, 10^(18 - risky.decimals())
    /// @param   precisionStable    Unsigned 256-bit integer scaling factor for `stable`, 10^(18 - stable.decimals())
    /// @param   riskyPerLiquidity  Unsigned 256-bit integer of Pool's risky reserves *per liquidity*, 0 <= x <= 1
    /// @param   stablePerLiquidity Unsigned 256-bit integer of Pool's stable reserves *per liquidity*, 0 <= x <= strike
    /// @return  invariantX64      = stablePerLiquidity - K * CDF(CDF^-1(1 - riskyPerLiquidity) - sigma * sqrt(tau))
    function calcInvariant(
        uint256 precisionRisky,
        uint256 precisionStable,
        uint256 riskyPerLiquidity,
        uint256 stablePerLiquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128 invariantX64) {
        uint256 output = getStableGivenRisky(0, precisionRisky, precisionStable, riskyPerLiquidity, strike, sigma, tau);
        int128 outputX64 = output.scaleToX64(precisionStable);
        int128 stableX64 = stablePerLiquidity.scaleToX64(precisionStable);
        invariantX64 = stableX64.sub(outputX64);
    }
}
