// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

interface IPrimitiveFactory {

    function create(address risky, address stable) external returns (address engine);

    // ===== View =====
    function args() external view returns (
        address factory,
        address risky,
        address stable
    );
    function getEngine(address risky, address stable) external view returns (address engine);
    function owner() external view returns (address);
}