// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Black-Scholes Math
/// @author  Primitive

import "./ABDKMath64x64.sol";
import "./CumulativeNormalDistribution.sol";
import "./Units.sol";

library BlackScholes {
    using ABDKMath64x64 for *;
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    /// @dev     Calculate the d1 auxiliary variable.
    /// @notice  ( ln(s/k) + (o^2/2)*(T-t) ) / o * sqrt(T-t).
    /// @param   s Spot price of underlying token in USD/DAI/USDC. In wei.
    /// @param   k Strike price in USD/DAI/USDC. In wei.
    /// @param   o "volatility" scaled by 1000.
    /// @param   t Time until expiration in seconds.
    function d1(
        uint256 s,
        uint256 k,
        uint256 o,
        uint256 t
    ) internal pure returns (int128 auxiliary) {
        int128 moneyness = logSimpleMoneyness(s, k); // ln( F / K )
        int128 vol = (o.percentage().pow(2)).div(uint256(2).fromUInt()); // (r + volatility^2 / 2), r = 0 for simplicity
        int128 tau = t.toYears(); // ( T - t ) = time until expiry in years
        int128 numerator = moneyness.add(vol.mul(tau)); // ln( F / K ) + (r + volatility^2 / 2) * tau
        int128 denominator = o.percentage().mul(tau.sqrt()); // volatility * sqrt(tau)
        auxiliary = numerator.div(denominator);
    }

    /// @notice Returns the `delta` greek of a call option
    function deltaCall(
        uint256 s,
        uint256 k,
        uint256 o,
        uint256 t
    ) internal pure returns (int128 delta) {
        delta = d1(s, k, o, t).getCDF();
    }

    /// @dev     Calculates the log simple moneyness.
    /// @notice  ln(F / K).
    /// @param   s Spot price of underlying token in USD/DAI/USDC. In wei.
    /// @param   k Strike price in USD/DAI/USDC. In wei.
    function logSimpleMoneyness(uint256 s, uint256 k) internal pure returns (int128 moneyness) {
        int128 spot = s.parseUnits();
        int128 strike = k.parseUnits();
        moneyness = (spot.div(strike)).ln();
    }
}
