// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../PrimitiveEngine.sol";

contract MockEngine is PrimitiveEngine {
    uint256 public time = 1;

    function advanceTime(uint256 by) external {
        time += by;
    }

    function _blockTimestamp() internal view override returns (uint32 blockTimestamp) {
        blockTimestamp = uint32(time);
    }

    function setReserves(
        bytes32 poolId,
        uint256 reserveRisky,
        uint256 reserveStable
    ) public {
        Reserve.Data storage res = reserves[poolId];
        res.reserveRisky = SafeCast.toUint128(reserveRisky);
        res.reserveStable = SafeCast.toUint128(reserveStable);
    }
}
