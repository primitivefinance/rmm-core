// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../libraries/Position.sol";

interface IPrimitiveLendingCallback {
    function borrowCallback(
        uint256 deltaL,
        uint256 deltaRisky,
        uint256 deltaStable,
        bytes calldata data
    ) external;

    function repayFromExternalCallback(uint256 deltaStable, bytes calldata data) external;
}
