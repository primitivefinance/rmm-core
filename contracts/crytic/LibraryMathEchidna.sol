// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../libraries/ReplicationMath.sol";
import "../libraries/Units.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract LibraryMathEchidna --test-mode assertion
contract LibraryMathEchidna {
    event AssertionFailed(string functionName, int128 v1, uint256 v2);
    using ReplicationMath for int128;
    using Units for int128;
    using Units for uint256;

    // Helper Functions for ReplicationMath.sol
    function realisticSigma(uint256 sigma) internal pure returns (uint256) {
        // between 1 to 1e7
        return uint256(1 + (sigma % (1e7 - 1)));
    }

    function realisticGamma(uint256 sigma) internal pure returns (uint256) {
        // between 9000 to Units.PERCENTAGE
        return uint256(9000 + (sigma % (Units.PERCENTAGE - 9000)));
    }

    function realisticAmountIncluding0ne(uint256 amount) internal pure returns (uint256) {
        // between 1 - 100000 ether
        return uint256(1 + (amount % (100000 ether + 1)));
    }

    // --------------------- Units.sol -----------------------
    function scaleUpAndScaleDownInverses(uint256 value, uint256 factor) public {
        uint256 scaledFactor = (10e18 + (factor % (10e18 + 1)));

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
}
