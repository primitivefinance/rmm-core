// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

/// @title   Use References
/// @author  Primitive
/// @dev     ONLY FOR TESTING PURPOSES.  

interface IRefCallback {
    function useRefCallback(bytes memory data) external;
    function useClearRefCallback() external;
    function useInRefCallback() external returns (bool);
}

abstract contract useRef {

    /// @notice Triggers a callback on msg.sender and passes data to set a reference
    modifier useRef(bytes memory data) {
        IRefCallback(address(this)).useRefCallback(data); // sets a reference
        _;
        IRefCallback(address(this)).useClearRefCallback(); // clears the reference at the end
    }

    /// @notice Reverts if not executing in a reference
    modifier inRef() {
        require(IRefCallback(address(this)).useInRefCallback(), "not in ref"); //  
        _;
    }

    function useRefCallback(bytes memory data) public virtual;
    function useClearRefCallback() public virtual;
    function useInRefCallback() public virtual returns (bool);

}