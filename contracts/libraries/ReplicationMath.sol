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
    using ABDKMath64x64 for *; // stores numerators as int128, denominator is 2^64.
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    int128 internal constant ONE_INT = int128(2**64);

    // ===== Math ======

    /// @param   sigma  Volatility scaled by Percentage Mantissa of 1e4, where 1 bip = 100
    /// @param   tau    Time until expiry in seconds
    /// @return  vol    Volatility * sqrt(tau)
    function getProportionalVolatility(uint256 sigma, uint256 tau) internal pure returns (int128 vol) {
        int128 sqrtTau = tau.toYears().sqrt();
        vol = sigma.fromUInt().mul(sqrtTau).div(Units.PERCENTAGE_INT); // scales down to decimals
    }

    /// @notice  Uses reserveRisky and invariant to calculate reserveStable
    /// @dev     Calculates 1 unit of reserves, which means it must be scaled by liquidity
    /// @param   invariantLast  Previous invariant with the same `tau` input as the parameter `tau`
    /// @param   reserveRisky Pool's risky reserves per unit of liquidity
    /// @param   strike Price point at which portfolio is 100% composed of stable tokens
    /// @param   sigma Volatility of the Pool, multiplied by Percentage.Mantissa = 1e4
    /// @param   tau Time until expiry in seconds
    /// @return  reserveStable = K * CDF(CDF^-1(1 - reserveRisky) - sigma * sqrt(T - t))
    function getStableGivenRisky(
        int128 invariantLast,
        uint256 reserveRisky,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128 reserveStable) {
        int128 K = strike.parseUnits(); // strike in 64x64 fixed point format
        int128 vol = getProportionalVolatility(sigma, tau);
        int128 reserve = reserveRisky.parseUnits();
        int128 phi = ONE_INT.sub(reserve).getInverseCDF(); // CDF^-1(1-x)
        int128 input = phi.sub(vol); // phi - vol
        reserveStable = K.mul(input.getCDF()).add(invariantLast);
    }

    /// @notice  Uses reserveStable and invariant to calculate reserveRisky
    /// @dev     Calculates 1 unit of reserves, which means it must be scaled by liquidity
    /// @param   invariantLast  Previous invariant with the same `tau` input as the parameter `tau`
    /// @param   reserveStable Pool's stable reserves per unit of liquidity
    /// @param   strike Price point at which portfolio is 100% composed of stable tokens
    /// @param   sigma Volatility of the Pool, multiplied by Percentage.Mantissa = 1e4
    /// @param   tau Time until expiry in seconds
    /// @return  reserveRisky = 1 - CDF(CDF^-1((reserveStable - invariantLast)/K) + sigma*sqrt(tau))
    function getRiskyGivenStable(
        int128 invariantLast,
        uint256 reserveStable,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128 reserveRisky) {
        int128 K = strike.parseUnits();
        int128 vol = getProportionalVolatility(sigma, tau);
        int128 reserve = reserveStable.parseUnits();
        int128 phi = reserve.sub(invariantLast).div(K).getInverseCDF(); // CDF^-1((reserveStable - invariantLast)/K)
        int128 input = phi.add(vol); // phi + vol
        reserveRisky = ONE_INT.sub(input.getCDF());
    }

    /// @dev     Calculates 1 unit of invariant, which means it must be scaled by liquidity
    /// @param   reserveRisky Pool's risky reserves per unit of liquidity
    /// @param   reserveStable Pool's stable reserves per unit of liquidity
    /// @return  invariant = reserveStable - K * CDF(CDF^-1(1 - reserveRisky) - sigma * sqrt(tau))
    function calcInvariant(
        uint256 reserveRisky,
        uint256 reserveStable,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (int128 invariant) {
        int128 reserve2 = getStableGivenRisky(0, reserveRisky, strike, sigma, tau);
        invariant = reserveStable.parseUnits().sub(reserve2);
    }
}
