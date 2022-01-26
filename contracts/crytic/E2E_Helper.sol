pragma solidity 0.8.6;
import "./Addresses.sol";

contract E2E_Helper is Addresses {
    // requires tokens to be minted prior to reaching the callback
    function mint_tokens(uint256 riskyAmt, uint256 stableAmt) internal {
        mint_helper(address(this), riskyAmt, stableAmt);
    }
    function mint_tokens_sender(uint256 riskyAmt, uint256 stableAmt) internal {
        mint_helper(msg.sender, riskyAmt, stableAmt);
    }
    function approve_tokens_sender(address recipient, uint256 riskyAmt, uint256 stableAmt) internal {
        risky.approve(recipient, riskyAmt);
        stable.approve(recipient, stableAmt);
    }
    function mint_helper(address recip, uint256 riskyAmt, uint256 stableAmt) internal {
        risky.mint(recip,riskyAmt);
        stable.mint(recip, stableAmt);
    }

    function executeCallback(uint256 delRisky, uint256 delStable) internal {
        if (delRisky > 0) {
            risky.transfer(address(engine), delRisky);
        }
        if (delStable > 0) {
            stable.transfer(address(engine), delStable);
        }
    }

    function one_to_max_uint64(uint256 random) internal returns (uint256) {
        return 1 + (random % (type(uint64).max - 1));
    }
}
