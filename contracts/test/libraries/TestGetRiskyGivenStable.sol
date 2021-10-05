// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../libraries/ReplicationMath.sol";

/// @title   Test Get Risky Given Stable
/// @author  Primitive
/// @dev     Tests each step in ReplicationMath.getRiskyGivenStable. For testing ONLY

contract TestGetRiskyGivenStable {
    using ABDKMath64x64 for int128;
    using ABDKMath64x64 for uint256;
    using CumulativeNormalDistribution for int128;
    using Units for int128;
    using Units for uint256;

    uint256 public scaleFactorRisky;
    uint256 public scaleFactorStable;

    function set(uint256 prec0, uint256 prec1) public {
        scaleFactorRisky = prec0;
        scaleFactorStable = prec1;
    }

    function step0(uint256 strike) public view returns (int128 K) {
        K = strike.scaleToX64(scaleFactorStable);
    }

    function step1(uint256 sigma, uint256 tau) public pure returns (int128 vol) {
        vol = ReplicationMath.getProportionalVolatility(sigma, tau);
    }

    function step2(uint256 reserveStable) public view returns (int128 reserve) {
        reserve = reserveStable.scaleToX64(scaleFactorStable);
    }

    function step3(
        int128 reserve,
        int128 invariantLast,
        int128 K
    ) public pure returns (int128 phi) {
        phi = reserve.sub(invariantLast).div(K).getInverseCDF(); // CDF^-1((reserveStable - invariantLast)/K)
    }

    function step4(int128 phi, int128 vol) public pure returns (int128 input) {
        input = phi.add(vol); // phi + vol
    }

    function step5(int128 input) public pure returns (int128 reserveRisky) {
        reserveRisky = ReplicationMath.ONE_INT.sub(input.getCDF());
    }

    function testStep3(uint256 reserve, uint256 strike) public view returns (int128 phi) {
        phi = reserve.scaleToX64(scaleFactorStable).div(strike.scaleToX64(scaleFactorStable)).getInverseCDF();
    }

    function testStep4(
        uint256 reserve,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 input) {
        int128 phi = testStep3(reserve, strike);
        int128 vol = step1(sigma, tau);
        input = phi.add(vol);
    }

    function testStep5(
        uint256 reserve,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reserveRisky) {
        int128 input = testStep4(reserve, strike, sigma, tau);
        reserveRisky = ReplicationMath.ONE_INT.sub(input.getCDF());
    }

    /// @return reserveRisky The calculated risky reserve, using the stable reserve
    function getRiskyGivenStable(
        int128 invariantLast,
        uint256 precRisky,
        uint256 reserveStable,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) public view returns (int128 reserveRisky) {
        precRisky;
        int128 K = step0(strike);
        int128 vol = step1(sigma, tau);
        int128 reserve = step2(reserveStable);
        int128 phi = step3(reserve, invariantLast, K);
        int128 input = step4(phi, vol);
        reserveRisky = step5(input);
    }

    function name() public pure returns (string memory) {
        return "TestGetRiskyGivenStable";
    }
}
