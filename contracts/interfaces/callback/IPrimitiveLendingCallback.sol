// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../../libraries/Position.sol";

interface IPrimitiveLendingCallback {
    function borrowCallback(uint deltaL, uint deltaRisky, uint deltaStable, bytes calldata data) external;
    function repayFromExternalCallback(uint deltaStable, bytes calldata data) external;
}
