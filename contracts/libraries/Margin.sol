// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/**
 * @notice  Margin Library
 * @author  Primitive
 * @dev     This library is a generalized margin position data structure for any engine.
 */

library Margin {
    // every margin position in an Engine is this data structure.
    struct Data {
        // the address which can withdraw balances
        address owner;
        // the nonce of the margin position, which is iterated for each engine
        uint nonce;
        // Balance of X, the RISKY, or underlying asset.
        uint BX1;
        // Balance of Y, the RISK-FREE, or "quote" asset, a stablecoin.
        uint BY2;
        // Transiently set as true when a margin position is being edited.
        bool unlocked;
    }

    /**
     * @notice  An Engine's mapping of margin position Ids to Data structs can be used to fetch any margin position.
     * @dev     Used across all Engines.
     */
    function fetch(
        mapping(bytes32 => Data) storage pos,
        address owner,
        uint nonce
    ) internal returns (Data storage) {
        return pos[getMarginId(owner, nonce)];
    }

    /**
     * @notice  Fetches the margin position Id, which is an encoded `owner` and `nonce` bytes32.
     * @return  The margin position Id as a bytes32.
     */
    function getMarginId(address owner, uint nonce) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(owner, nonce));
    }
}