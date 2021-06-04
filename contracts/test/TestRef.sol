// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Use References Test
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.  

import "./useRef.sol";
import "hardhat/console.sol";

contract TestRef is useRef {

    /// @notice State variable stored as a reference
    address public owner;
    address public owner1;

    /// @notice Entry point to trigger the `useRef` modifier
    function testRef(bytes memory data) external useRef(data) {}

    /// @notice Function to set a reference
    function setOwner(address owner_) public {
        owner = owner_;
        owner1 = owner_;
    }

    // ===== Ref stuff =====

    /// @notice Triggered on entering a function with the `useRef` modifier
    function useRefCallback(bytes memory data) public override {
        address(this).call(data);
    }

    /// @notice Triggered at the end of a function call with the `useRef` modifier
    function useClearRefCallback() public override inRef {
        owner = address(0x0);
    }

    /// @notice Called anytime to check if a reference is set
    function useInRefCallback() public override returns (bool) {
        return address(0x0) != owner;
    }
}