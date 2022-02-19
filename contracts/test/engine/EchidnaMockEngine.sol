// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

import "../../crytic/EchidnaPrimitiveEngine.sol";

contract EchidnaMockEngine is EchidnaPrimitiveEngine {
    uint256 public time = 1;

    constructor(address _risky, address _stable, uint256 _scaleFactorRisky, uint256 _scaleFactorStable, uint256 _min_liquidity) public EchidnaPrimitiveEngine(_risky, _stable, _scaleFactorRisky, _scaleFactorStable, _min_liquidity)
            {}

    function advanceTime(uint256 by) external {
        time += by;
    }

    function _blockTimestamp() internal view override returns (uint32 blockTimestamp) {
        blockTimestamp = uint32(time);
    }

    function setReserves(
        bytes32 poolId,
        uint256 reserveRisky,
        uint256 reserveStable
    ) public {
        Reserve.Data storage res = reserves[poolId];
        res.reserveRisky = SafeCast.toUint128(reserveRisky);
        res.reserveStable = SafeCast.toUint128(reserveStable);
    }

    function updateReserves(bytes32 poolId, uint256 reserveRisky) public {
        Reserve.Data storage res = reserves[poolId];
        Calibration memory cal = calibrations[poolId];
        (uint256 curRisky, uint256 curStable) = (res.reserveRisky, res.reserveStable);
        int128 invariant = invariantOf(poolId);
        res.reserveRisky = SafeCast.toUint128(reserveRisky);
        uint256 reserveStable = ReplicationMath.getStableGivenRisky(
            invariant,
            scaleFactorRisky,
            scaleFactorStable,
            reserveRisky,
            cal.strike,
            cal.sigma,
            cal.maturity - cal.lastTimestamp
        );
        res.reserveStable = SafeCast.toUint128(reserveStable);
        (uint256 nextRisky, uint256 nextStable) = (res.reserveRisky, res.reserveStable);

        {
            uint256 riskyDeficit = nextRisky > curRisky ? nextRisky - curRisky : 0;
            uint256 riskySurplus = nextRisky > curRisky ? 0 : curRisky - nextRisky;

            uint256 stableDeficit = nextStable > curStable ? nextStable - curStable : 0;
            uint256 stableSurplus = nextStable > curStable ? 0 : curStable - nextStable;
            IERC20(risky).transfer(msg.sender, riskySurplus);
            IERC20(risky).transferFrom(msg.sender, address(this), riskyDeficit);

            IERC20(stable).transfer(msg.sender, stableSurplus);
            IERC20(stable).transferFrom(msg.sender, address(this), stableDeficit);
        }
    }
}
