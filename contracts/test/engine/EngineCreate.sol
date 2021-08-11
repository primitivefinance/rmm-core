// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";
import "../../libraries/Position.sol";

contract EngineCreate {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    constructor() {}

    function initialize(
        address _engine,
        address _risky,
        address _stable
    ) public {
        engine = _engine;
        risky = _risky;
        stable = _stable;
    }

    function create(
        uint256 strike,
        uint256 sigma,
        uint256 maturity,
        uint256 delta,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).create(strike, uint64(sigma), uint32(maturity), delta, delLiquidity, data);
    }

    function createCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        data;
        IERC20(risky).transferFrom(CALLER, engine, delRisky);
        IERC20(stable).transferFrom(CALLER, engine, delStable);
    }

    function fetch(bytes32 pid)
        public
        view
        returns (
            uint128 float,
            uint128 liquidity,
            uint128 debt
        )
    {
        return IPrimitiveEngine(engine).positions(keccak256(abi.encodePacked(address(this), pid)));
    }

    function name() public pure returns (string memory) {
        return "EngineCreate";
    }
}
