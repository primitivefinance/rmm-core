pragma solidity 0.8.6;
import "../test/engine/MockEngine.sol";
import "../test/TestRouter.sol";
import "../test/TestToken.sol";
import "./FlattenedManager.sol";

contract Addresses {
    TestToken risky_18 = TestToken(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    TestToken stable_18 = TestToken(0x1D7022f5B17d2F8B695918FB48fa1089C9f85401);

    TestToken risky_6 = TestToken(0x871DD7C2B4b25E1Aa18728e9D5f2Af4C4e431f5c);
    TestToken stable_6 = TestToken(0x0B1ba0af832d7C05fD64161E0Db78E85978E8082);

    FlattenedManager manager_18_18 = FlattenedManager(payable(address(0x6A4A62E5A7eD13c361b176A5F62C2eE620Ac0DF8)));
    // address manager_18_18 = 0x6A4A62E5A7eD13c361b176A5F62C2eE620Ac0DF8;
    MockEngine engine_18_18 = MockEngine(0x48BaCB9266a570d521063EF5dD96e61686DbE788);

    address manager_18_6 = 0x6DfFF22588BE9b3ef8cf0aD6Dc9B84796F9fB45f;
    MockEngine engine_18_6 = MockEngine(0x34D402F14D58E001D8EfBe6585051BF9706AA064);

    address manager_6_18 = 0xcFC18CEc799fBD1793B5C43E773C98D4d61Cc2dB;
    MockEngine engine_6_18 = MockEngine(0x25B8Fe1DE9dAf8BA351890744FF28cf7dFa8f5e3);

    address manager_6_6 = 0xF22469F31527adc53284441bae1665A7b9214DBA;
    MockEngine engine_6_6 = MockEngine(0xcdB594a32B1CC3479d8746279712c39D18a07FC0);

    address weth9 = 0x07f96Aa816C1F244CbC6ef114bB2b023Ba54a2EB;

    TestToken risky = risky_18;
    TestToken stable = stable_18;
    FlattenedManager manager = manager_18_18;
    MockEngine engine = engine_18_18;

    mapping(address => bytes32[]) createdPoolIds;
    bytes32[] poolIds;

    function add_to_created_pool(bytes32 poolId) internal {
        // createdPoolIds[address(engine)].push(poolId);
        poolIds.push(poolId);
    }

    function retrieve_created_pool(uint256 id) internal returns (bytes32) {
        // require(createdPoolIds[address(engine)].length > 0);
        // uint256 index = id % (createdPoolIds[address(engine)].length);
        // return createdPoolIds[address(engine)][index];
        require(poolIds.length > 0);
        uint256 index = id % (poolIds.length);
        return poolIds[index];
    }
}
