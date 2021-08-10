// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../interfaces/IPrimitiveEngine.sol";
import "../../interfaces/IERC20.sol";

contract ReentrancyAttacker {
    address public engine;
    address public risky;
    address public stable;
    address public CALLER;

    uint256 private _strike;
    uint256 private _sigma;
    uint256 private _maturity;
    uint256 private _delta;
    uint256 private _delLiquidity;
    bytes32 private _poolId;
    address private _owner;

    bool private _goodCallback;

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

        _strike = strike;
        _sigma = sigma;
        _maturity = maturity;
        _delta = delta;
        _delLiquidity = delLiquidity;

        IPrimitiveEngine(engine).create(strike, uint64(sigma), uint32(maturity), delta, delLiquidity, data);
    }

    function createCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        delRisky;
        delStable;
        IPrimitiveEngine(engine).create(_strike, uint64(_sigma), uint32(_maturity), _delta, _delLiquidity, data);
    }

    function deposit(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        CALLER = msg.sender;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
    }

    function depositCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        IPrimitiveEngine(engine).deposit(CALLER, delRisky, delStable, data);
    }

    function allocate(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        CALLER = msg.sender;

        _poolId = poolId;
        _owner = owner;
        _delLiquidity = delLiquidity;

        IPrimitiveEngine(engine).allocate(poolId, owner, delLiquidity, false, data);
    }

    function allocateCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        delRisky;
        delStable;
        IPrimitiveEngine(engine).allocate(_poolId, _owner, _delLiquidity, false, data);
    }

    function remove(
        bytes32 poolId,
        uint256 delLiquidity,
        bytes memory data
    ) public {
        _poolId = poolId;
        _delLiquidity = delLiquidity;
        data;
        IPrimitiveEngine(engine).remove(poolId, delLiquidity);
    }

    function removeCallback(
        uint256 delRisky,
        uint256 delStable,
        bytes memory data
    ) public {
        delRisky;
        delStable;
        data;
        IPrimitiveEngine(engine).remove(_poolId, _delLiquidity);
    }

    function borrow(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        CALLER = msg.sender;

        _poolId = poolId;
        _owner = owner;
        _delLiquidity = delLiquidity;

        IPrimitiveEngine(engine).borrow(poolId, delLiquidity, false, data);
    }

    function borrowWithGoodCallback(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        CALLER = msg.sender;

        _poolId = poolId;
        _owner = owner;
        _delLiquidity = delLiquidity;

        _goodCallback = true;
        IPrimitiveEngine(engine).borrow(poolId, delLiquidity, false, data);
        _goodCallback = false;
    }

    function borrowCallback(
        uint256 delLiquidity,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        uint256 riskyNeeded = delLiquidity - delRisky;

        if (_goodCallback) {
            IERC20(risky).transferFrom(CALLER, msg.sender, riskyNeeded);
            IERC20(stable).transfer(CALLER, delStable);
        } else {
            IPrimitiveEngine(engine).borrow(_poolId, _delLiquidity, false, data);
        }
    }

    function repay(
        bytes32 poolId,
        address owner,
        uint256 delLiquidity,
        bool fromMargin,
        bytes calldata data
    ) external {
        CALLER = msg.sender;

        _poolId = poolId;
        _owner = owner;
        _delLiquidity = delLiquidity;

        IPrimitiveEngine(engine).repay(poolId, owner, delLiquidity, fromMargin, data);
    }

    function repayCallback(uint256 delStable, bytes calldata data) external {
        delStable;
        IPrimitiveEngine(engine).repay(_poolId, _owner, _delLiquidity, false, data);
    }
}
