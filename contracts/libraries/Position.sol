// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/**
 * @notice  Position Library
 * @author  Primitive
 * @dev     This library is a generalized position data structure for any engine.
 */

library Position {
    // every position in an Engine is this data structure.
    struct Data {
        // the address which can withdraw balances
        address owner;
        // the nonce of the position, which is iterated for each engine
        uint nonce;
        // Balance of X, the RISKY, or underlying asset.
        uint BX1;
        // Balance of Y, the RISK-FREE, or "quote" asset, a stablecoin.
        uint BY2;
        // The amount of liquidity shares, which each can replicate different payoffs.
        uint liquidity;
        // Transiently set as true when a position is being edited.
        bool unlocked;
        // Set when liquidity is locked for the owner and unlocked for borrowers.
        bool loaned;
        // Set when liquidity shares are borrowed.
        bool borrowed;
    }

    /**
     * @notice  An Engine's mapping of position Ids to Data structs can be used to fetch any position.
     * @dev     Used across all Engines.
     */
    function fetch(
        mapping(bytes32 => Data) storage pos,
        address owner,
        uint nonce
    ) internal returns (Data storage) {
        return pos[getPositionId(owner, nonce)];
    }

    /**
     * @notice  Transitions a `pos` to the `nextPos` by setting pos = nextPos.
     * @return  The new position.
     */
    function edit(Data storage pos, Data memory nextPos) internal returns (Data storage) {
        require(pos.owner == nextPos.owner, "Not owner");
        require(pos.nonce == nextPos.nonce, "Not nonce");
        pos.BX1 = nextPos.BX1;
        pos.BY2 = nextPos.BY2;
        pos.liquidity = nextPos.liquidity;
        pos.unlocked = false;
        return pos;
    }

    /**
     * @notice  Fetches the position Id, which is an encoded `owner` and `nonce` bytes32.
     * @return  The position Id as a bytes32.
     */
    function getPositionId(address owner, uint nonce) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(owner, nonce));
    }
}