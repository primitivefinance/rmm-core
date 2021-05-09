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
        // Balance of X, the RISKY, or underlying asset.
        uint BX1;
        // Balance of Y, the RISK-FREE, or "quote" asset, a stablecoin.
        uint BY2;
        // the address which can withdraw balances
        address owner;
        // Transiently set as true when a margin position is being edited.
        bool unlocked;
    }

    /**
     * @notice  An Engine's mapping of margin position Ids to Data structs can be used to fetch any margin position.
     * @dev     Used across all Engines.
     */
    function fetch(
        mapping(bytes32 => Data) storage mar,
        address owner
    ) internal returns (Data storage) {
        return mar[getMarginId(owner)];
    }

    function edit(Data storage mar, uint BX1, uint BY2) internal returns (Data storage) {
        mar.BX1 = BX1;
        mar.BY2 = BY2;
        mar.unlocked = false;
        return mar;
    }

    /**
     * @notice  Fetches the margin position Id, which is an encoded `owner`.
     * @return  The margin position Id as a bytes32.
     */
    function getMarginId(address owner) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(owner));
    }
}
