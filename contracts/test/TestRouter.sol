// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "./TestBase.sol";
import "../libraries/ReplicationMath.sol";
import "../libraries/Units.sol";
import "hardhat/console.sol";
import "../interfaces/engine/IPrimitiveEngineErrors.sol";
import "../libraries/ABDKMath64x64.sol";
import "../libraries/CumulativeNormalDistribution.sol";

contract TestRouter is TestBase {
    using Units for uint256;
    using Units for int128;
    using ABDKMath64x64 for int128;
    using CumulativeNormalDistribution for int128;

    constructor(address engine_) TestBase(engine_) {}

    string public expectedError;

    function expect(string memory errorString) public {
        expectedError = errorString;
    }

    // ===== Create =====

    function create(
        uint256 strike,
        uint256 sigma,
        uint256 maturity,
        uint256 gamma,
        uint256 riskyPerLp,
        uint256 delLiquidity,
        bytes calldata data
    ) public {
        caller = msg.sender;
        try
            IPrimitiveEngine(engine).create(
                uint128(strike),
                uint32(sigma),
                uint32(maturity),
                uint32(gamma),
                riskyPerLp,
                delLiquidity,
                data
            )
        {} catch (bytes memory err) {
            if (keccak256(abi.encodeWithSignature(expectedError)) == keccak256(err)) {
                revert(expectedError);
            } else {
                revert("Unknown()");
            }
        }
    }

    // ===== Margin =====

    function deposit(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
    }

    function depositFail(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.FAIL;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function depositReentrancy(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.REENTRANCY;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function depositOnlyRisky(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.RISKY_ONLY;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function depositOnlyStable(
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.STABLE_ONLY;
        IPrimitiveEngine(engine).deposit(owner, delRisky, delStable, data);
        scenario = Scenario.SUCCESS;
    }

    function withdraw(uint256 delRisky, uint256 delStable) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).withdraw(msg.sender, delRisky, delStable);
    }

    function withdrawToRecipient(
        address recipient,
        uint256 delRisky,
        uint256 delStable
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).withdraw(recipient, delRisky, delStable);
    }

    // ===== Allocate =====

    function allocate(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromMargin(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, true, data);
    }

    function allocateFromExternal(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromExternalNoRisky(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.STABLE_ONLY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromExternalNoStable(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.RISKY_ONLY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    function allocateFromExternalReentrancy(
        bytes32 poolId,
        address owner,
        uint256 delRisky,
        uint256 delStable,
        bytes calldata data
    ) public {
        caller = msg.sender;
        scenario = Scenario.REENTRANCY;
        IPrimitiveEngine(engine).allocate(poolId, owner, delRisky, delStable, false, data);
    }

    // ===== Remove =====

    function remove(
        bytes32 poolId,
        uint256 delLiquidity,
        bytes memory data
    ) public {
        data;
        IPrimitiveEngine(engine).remove(poolId, delLiquidity);
    }

    function removeToMargin(
        bytes32 poolId,
        uint256 delLiquidity,
        bytes memory data
    ) public {
        data;
        IPrimitiveEngine(engine).remove(poolId, delLiquidity);
    }

    function removeToExternal(
        bytes32 poolId,
        uint256 delLiquidity,
        bytes memory data
    ) public {
        data;
        (uint256 delRisky, uint256 delStable) = IPrimitiveEngine(engine).remove(poolId, delLiquidity);
        IPrimitiveEngine(engine).withdraw(msg.sender, delRisky, delStable);
    }

    // ===== Swaps =====

    function swap(
        address recipient,
        bytes32 pid,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut,
        bool fromMargin,
        bool toMargin,
        bytes calldata data
    ) public {
        caller = msg.sender;
        IPrimitiveEngine(engine).swap(recipient, pid, riskyForStable, deltaIn, deltaOut, fromMargin, toMargin, data);
    }

    function getStableOutGivenRiskyIn(bytes32 poolId, uint256 deltaIn) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        uint256 amountInWithFee = (deltaIn * gamma) / 1e4;
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextRisky = ((uint256(reserveRisky) + amountInWithFee) * lens.PRECISION()) / liquidity;
        uint256 nextStable = ReplicationMath.getStableGivenRisky(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextRisky,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaOut = uint256(reserveStable) - (nextStable * liquidity) / lens.PRECISION();
        return deltaOut;
    }

    /// @notice                 Uses stablePerLiquidity and invariant to calculate riskyPerLiquidity
    /// @dev                    Converts unsigned 256-bit values to fixed point 64.64 numbers w/ decimals of precision
    /// @param   invariantLastX64   Signed 64.64 fixed point number. Calculated w/ same `tau` as the parameter `tau`
    /// @param   scaleFactorRisky   Unsigned 256-bit integer scaling factor for `risky`, 10^(18 - risky.decimals())
    /// @param   scaleFactorStable  Unsigned 256-bit integer scaling factor for `stable`, 10^(18 - stable.decimals())
    /// @param   stablePerLiquidity Unsigned 256-bit integer of Pool's stable reserves *per liquidity*, 0 <= x <= strike
    /// @param   strike         Unsigned 256-bit integer value with precision equal to 10^(18 - scaleFactorStable)
    /// @param   sigma          Volatility of the Pool as an unsigned 256-bit integer w/ precision of 1e4, 10000 = 100%
    /// @param   tau            Time until expiry in seconds as an unsigned 256-bit integer
    /// @return  riskyPerLiquidity = 1 - CDF(CDF^-1((stablePerLiquidity - invariantLastX64)/K) + sigma*sqrt(tau))
    function getRiskyGivenStable(
        int128 invariantLastX64,
        uint256 scaleFactorRisky,
        uint256 scaleFactorStable,
        uint256 stablePerLiquidity,
        uint256 strike,
        uint256 sigma,
        uint256 tau
    ) internal pure returns (uint256 riskyPerLiquidity) {
        int128 strikeX64 = strike.scaleToX64(scaleFactorStable);
        int128 volX64 = ReplicationMath.getProportionalVolatility(sigma, tau);
        int128 stableX64 = stablePerLiquidity.scaleToX64(scaleFactorStable);
        int128 phi = stableX64.sub(invariantLastX64).div(strikeX64).getInverseCDF();
        int128 input = phi.add(volX64);
        int128 riskyX64 = ReplicationMath.ONE_INT.sub(input.getCDF());
        riskyPerLiquidity = riskyX64.scaleFromX64(scaleFactorRisky);
    }

    // note: this will probably revert because getRiskyGivenStable is not precise enough to return a valid swap
    function getRiskyOutGivenStableIn(bytes32 poolId, uint256 deltaIn) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        uint256 amountInWithFee = (deltaIn * gamma) / 1e4;
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextStable = ((uint256(reserveStable) + amountInWithFee) * lens.PRECISION()) / liquidity;
        uint256 nextRisky = getRiskyGivenStable(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextStable,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaOut = uint256(reserveRisky) - (nextRisky * liquidity) / lens.PRECISION();
        return deltaOut;
    }

    function getStableInGivenRiskyOut(bytes32 poolId, uint256 deltaOut) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextRisky = ((uint256(reserveRisky) - deltaOut) * lens.PRECISION()) / liquidity;
        uint256 nextStable = ReplicationMath.getStableGivenRisky(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextRisky,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaIn = (nextStable * liquidity) / lens.PRECISION() - uint256(reserveStable);
        uint256 deltaInWithFee = (deltaIn * 1e4) / gamma + 1;
        return deltaInWithFee;
    }

    // note: this will probably revert because getRiskyGivenStable is not precise enough to return a valid swap
    function getRiskyInGivenStableOut(bytes32 poolId, uint256 deltaOut) public view returns (uint256) {
        IPrimitiveEngineView lens = IPrimitiveEngineView(engine);
        (uint128 reserveRisky, uint128 reserveStable, uint128 liquidity, , , , ) = lens.reserves(poolId);
        (uint128 strike, uint32 sigma, uint32 maturity, uint32 lastTimestamp, uint32 gamma) = lens.calibrations(poolId);
        int128 invariant = lens.invariantOf(poolId);

        uint256 nextStable = ((uint256(reserveStable) - deltaOut) * lens.PRECISION()) / liquidity;
        uint256 nextRisky = getRiskyGivenStable(
            invariant,
            lens.scaleFactorRisky(),
            lens.scaleFactorStable(),
            nextStable,
            strike,
            sigma,
            maturity - lastTimestamp
        );

        uint256 deltaIn = (nextRisky * liquidity) / lens.PRECISION() - uint256(reserveRisky);
        uint256 deltaInWithFee = (deltaIn * 1e4) / gamma + 1;
        return deltaInWithFee;
    }

    function name() public pure override(TestBase) returns (string memory) {
        return "TestRouter";
    }
}
