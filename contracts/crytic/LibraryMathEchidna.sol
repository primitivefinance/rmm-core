// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../libraries/ReplicationMath.sol";
import "../libraries/Units.sol";
import "../libraries/ABDKMath64x64.sol";
import "../libraries/CumulativeNormalDistribution.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract LibraryMathEchidna --test-mode assertion
contract LibraryMathEchidna { 
	event AssertionFailed(string functionName, int128 v1, uint256 v2); 
	using ReplicationMath for int128;
	using Units for int128;
	using Units for uint256;
	using ABDKMath64x64 for int128;
	using ABDKMath64x64 for uint256;
	using CumulativeNormalDistribution for int128;
	event P(int128 a, int128 c,int64 b);
	// Helper Functions for ReplicationMath.sol
	function realisticSigma(uint256 sigma) internal pure returns(uint256) { 
		// between 1 to 1e7 
		return uint256(1 + sigma % (1e7 - 1));
	}
	function realisticGamma(uint256 sigma ) internal pure returns(uint256) { 
		// between 9000 to Units.PERCENTAGE
		return uint256(9000 + sigma % (Units.PERCENTAGE - 9000));
	}
	function realisticAmountIncluding0ne(uint256 amount) internal pure returns(uint256) { 
		// between 1 - 100000 ether
		return uint256(1 + amount% (100000 ether + 1));
	}

	// --------------------- Units.sol -----------------------
	function scaleUpAndScaleDownInverses(uint256 value, uint256 factor) public {
		uint256 scaledFactor = (10e18+ factor % (10e18 + 1));

		uint256 scaledUpValue = value.scaleUp(scaledFactor);
		uint256 scaledDownValue = scaledUpValue.scaleDown(scaledFactor);
		
		assert(scaledDownValue == value);
	}
	function scaleToAndFromX64Inverses(uint256 value, uint256 _decimals) public {
		// will enforce factor between 0 - 12
		uint256 factor = _decimals % (13); 
		// will enforce scaledFactor between 1 - 10**12 , because 10**0 = 1
		uint256 scaledFactor = 10**factor;

		int128 scaledUpValue = value.scaleToX64(scaledFactor);
		uint256 scaledDownValue = scaledUpValue.scaleFromX64(scaledFactor);
		
		assert(scaledDownValue == value);
	}

	// --------------------- CumulativeNormalDistribution.sol -----------------------

	function getCDFPaper(int128 x) internal pure returns (int128) {
		int128 z = x.div(CumulativeNormalDistribution.CDF3);
		int128 t = CumulativeNormalDistribution.ONE_INT.div(CumulativeNormalDistribution.ONE_INT.add(CumulativeNormalDistribution.CDF0.mul(z.abs())));
		int128 erf = getErrorFunctionPaper(z, t);
		if (z < 0) {
			erf = erf.neg();
		}
		int128 result = (CumulativeNormalDistribution.HALF_INT).mul(CumulativeNormalDistribution.ONE_INT.add(erf));
		return result;
	}

	// https://personal.math.ubc.ca/~cbm/aands/abramowitz_and_stegun.pdf
	// Approximation 7.1.26
	function getErrorFunctionPaper(int128 z, int128 t) internal pure returns (int128) {
		int128 a1t = CumulativeNormalDistribution.CDF1.mul(t);
		int128 a2t = CumulativeNormalDistribution.CDF2.mul(t.pow(2));
		int128 a3t = CumulativeNormalDistribution.CDF3.mul(t.pow(3));
		int128 a4t = CumulativeNormalDistribution.CDF4.mul(t.pow(4));
		int128 a5t = CumulativeNormalDistribution.CDF5.mul(t.pow(5));
		int128 sum = a1t + a2t + a3t + a4t + a5t;
		int128 result = CumulativeNormalDistribution.ONE_INT.sub(sum.mul((z.mul(z).neg()).exp()));
		return result;
	}

	function realisticCDFInput(uint128 x, uint128 neg) internal returns (int128) {
		if (neg % 2 == 0) {
			return -int128(x); 
		}
		return int128(x);		
	}
	function compareCDFimplementations(uint128 x, uint128 neg) public {
		int128 x = realisticCDFInput(x, neg);

		int128 resPaper = getCDFPaper(x);
		int128 resCurrentImplementation = x.getCDF();
		assert(resPaper == resCurrentImplementation);
	}

	function compareCDFImplementationsDiff(uint128 x, uint128 neg) public {
		int128 x_x = realisticCDFInput(x, neg);

		int128 resPaper = getCDFPaper(x_x);
		int128 resCurrentImplementation = x_x.getCDF();
		int128 diff = resPaper > resCurrentImplementation ? 
						resPaper - resCurrentImplementation :
						resCurrentImplementation - resPaper;
		assert(diff <= 1);
	}

	function CDFCheckRange(uint128 x, uint128 neg) public {
		int128 x_x = realisticCDFInput(x, neg);
			
		int128 res = x_x.getCDF();
		emit P(x_x, res, res.toInt());
		assert(res > 0 && res.toInt() < 1);
	}

}
