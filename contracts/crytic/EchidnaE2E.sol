pragma solidity 0.8.6;
import "../PrimitiveFactory.sol";
import "../interfaces/IERC20.sol";
import "./E2E_Create.sol";
import "./E2E_Global.sol";
import "./E2E_Deposit_Withdraw.sol";
import "./E2E_Allocate_Remove.sol";
import "./E2E_Swap_Adjusted.sol";

// npx hardhat clean && npx hardhat compile && echidna-test-2.0 . --contract EchidnaE2E --config contracts/crytic/E2E.yaml
contract EchidnaE2E is E2E_Create, E2E_Global, E2E_Allocate_Remove, E2E_Deposit_Withdraw, E2E_Swap_Adjusted {

    Deployment d18_d18;
    Deployment d18_d6;
    Deployment d6_d18;
    Deployment d6_d6;
    constructor() {
        d18_d18 = Deployment({
            manager: 0x6A4A62E5A7eD13c361b176A5F62C2eE620Ac0DF8,
            engine: MockEngine(0x48BaCB9266a570d521063EF5dD96e61686DbE788),
            risky: risky,
            stable: stable
        });
        d18_d6 = Deployment({
            manager: 0x6DfFF22588BE9b3ef8cf0aD6Dc9B84796F9fB45f,
            engine: MockEngine(0x34D402F14D58E001D8EfBe6585051BF9706AA064),
            risky: risky,
            stable: stable6
        });
        d6_d18 = Deployment({
            manager: 0xcFC18CEc799fBD1793B5C43E773C98D4d61Cc2dB,
            engine: MockEngine(0x25B8Fe1DE9dAf8BA351890744FF28cf7dFa8f5e3),
            risky: risky6,
            stable: stable
        });
        d6_d6 = Deployment({
            manager: 0xF22469F31527adc53284441bae1665A7b9214DBA,
            engine: MockEngine(0xcdB594a32B1CC3479d8746279712c39D18a07FC0),
            risky: risky6,
            stable: stable6
        });
    }
}
