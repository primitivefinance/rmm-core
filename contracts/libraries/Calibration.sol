// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/// @notice  Calibration Library
/// @author  Primitive
/// @dev     This library holds the data struct for each CFMM's calibrated option parameters.


library Calibration {
    // The standard parameters of each replicated option.
    struct Data {
        // The strike price in wei of the option.
        uint256 strike;
        // The implied volatility of the option.
        uint32 sigma;
        // The time in seconds until the option expires.
        uint32 time;
    }

    /// @notice  Fetches an Engine's Calibration Data struct using a mapping of Reserve Ids.
    function fetch(
        mapping(bytes32 => Data) storage settings,
        address engine
    ) internal returns (Data storage) {
        return settings[getCalibrationId(engine)];
    }

    /// @notice  Fetches the reserve Id, which is an encoded `owner`.
    /// @return  The reserve Id as a bytes32.
    // @TODO: make these more deterministic?
    function getCalibrationId(address engine) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(engine));
    }
}