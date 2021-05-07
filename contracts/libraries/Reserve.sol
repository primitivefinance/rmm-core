// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/**
 * @notice  Engine Reserves
 * @author  Primitive
 * @dev     This library holds the data structure for an Engine's Reserves.
 */

library Reserve {
    // An Engine has two reserves of RISKY and RISK-FREE assets, X and Y, and total liquidity shares.
    struct Data {
        // the reserve for the risky asset
        uint assetX;
        // the reserve for the risk free asset
        uint assetY;
        // the total liquidity shares
        uint liquidity;
        // the liquidity available for lending
        uint float;
        uint debt;
    }

    /**
     * @notice  Fetches an Engine Registry's Reserve Data struct using a mapping of Reserve Ids.
     */
    function fetch(
        mapping(bytes32 => Data) storage reserves,
        address engine
    ) internal returns (Data storage) {
        return reserves[getReserveId(engine)];
    }

    /**
     * @notice  Fetches the reserve Id, which is an encoded `owner`.
     * @return  The reserve Id as a bytes32.
     */
    function getReserveId(address engine) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(engine));
    }
}
