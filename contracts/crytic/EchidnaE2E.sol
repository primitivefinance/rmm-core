pragma solidity 0.8.6;
import "../PrimitiveFactory.sol";
import "../interfaces/IERC20.sol";
import "./E2E_Create.sol";
import "./E2E_Global.sol";
import "./E2E_Deposit_Withdraw.sol";
import "./E2E_Allocate_Remove.sol";
import "./E2E_Swap_Adjusted.sol";
import "./E2E_Manager.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract EchidnaE2E --config contracts/crytic/E2ECore.yaml
contract EchidnaE2E is E2E_Manager, 
    E2E_Create,
    E2E_Allocate_Remove,
    E2E_Deposit_Withdraw,
    E2E_Global,
    E2E_Swap_Adjusted
    {
    // function changeTargetDeployment(uint256 id) public {
    //     uint256 toTest = id % 4;
    //     if (toTest == 0) {
    //         risky = risky_18;
    //         stable = stable_18;
    //         manager = manager_18_18;
    //         engine = engine_18_18;
    //     } else if (toTest == 1) {
    //         risky = risky_18;
    //         stable = stable_6;
    //         manager = manager_18_6;
    //         engine = engine_18_6;
    //     } else if (toTest == 2) {
    //         risky = risky_6;
    //         stable = stable_18;
    //         manager = manager_6_18;
    //         engine = engine_6_18;
    //     } else {
    //         risky = risky_6;
    //         stable = stable_6;
    //         manager = manager_6_6;
    //         engine = engine_6_6;
    //     }
    // }
}
