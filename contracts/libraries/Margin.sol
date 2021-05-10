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
        // Transiently set as true when a margin position is being edited.
        bool unlocked;
    }

    /**
     * @notice  An Engine's mapping of margin position Ids to Data structs can be used to fetch any margin position.
     * @dev     Used across all Engines.
     */
    function fetch(
        mapping(address => Data) storage mar,
        address owner
    ) internal returns (Data storage) {
        require(owner != address(0x0), "No owner");
        return mar[owner];
    }

    function deposit(Data storage mar, uint deltaX, uint deltaY) internal returns (Data storage) {
        if(deltaX > 0) mar.BX1 += deltaX;
        if(deltaY > 0) mar.BY2 += deltaY;
        return mar;
    }

    function withdraw(mapping(address => Data) storage mar, uint deltaX, uint deltaY) internal returns (Data storage) {
        Data storage margin = mar[msg.sender];
        if(deltaX > 0) margin.BX1 -= deltaX;
        if(deltaY > 0) margin.BY2 -= deltaY;
        return margin;
    }
}
