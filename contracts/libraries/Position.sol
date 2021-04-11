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
        // The pool ID of the liquidity shares
        bytes32 pid;
        // Balance of X, the RISKY, or underlying asset.
        uint BX1;
        // Balance of Y, the RISK-FREE, or "quote" asset, a stablecoin.
        uint BY2;
        // The amount of liquidity shares, which each can replicate different payoffs.
        uint liquidity;
        // The amount of liquidity shares lent out.
        uint float;
        // The amount of liquidity shares borrowed.
        uint loan;
        // Transiently set as true when a position is being edited.
        bool unlocked;
    }

    /**
     * @notice  An Engine's mapping of position Ids to Data structs can be used to fetch any position.
     * @dev     Used across all Engines.
     */
    function fetch(
        mapping(bytes32 => Data) storage pos,
        address owner,
        uint nonce,
        bytes32 pid
    ) internal returns (Data storage) {
        return pos[getPositionId(owner, nonce, pid)];
    }

    /**
     * @notice  Transitions a `pos` to the `nextPos` by setting pos = nextPos.
     * @return  The new position.
     */
    function edit(Data storage pos, uint BX1, uint BY2, uint liquidity, uint float, uint loan) internal returns (Data storage) {
        pos.BX1 = BX1;
        pos.BY2 = BY2;
        pos.float = float;
        pos.liquidity = liquidity;
        pos.loan = loan;
        pos.unlocked = false;
        return pos;
    }

    /**
     * @notice  Fetches the position Id, which is an encoded `owner`, `nonce`, and  `pid`.
     * @return  The position Id as a bytes32.
     */
    function getPositionId(address owner, uint nonce, bytes32 pid) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(owner, nonce, pid));
    }
}