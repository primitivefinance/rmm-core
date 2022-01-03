// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.8.0;

import "./SafeCast.sol";

/// @title   Reserves Library
/// @author  Primitive
/// @dev     Data structure library for an Engine's Reserves
library Reserve {
    using SafeCast for uint256;

    /// @notice                Stores global state of a pool
    /// @param reserveRisky    Risky token reserve
    /// @param reserveStable   Stable token reserve
    /// @param liquidity       Total supply of liquidity
    /// @param blockTimestamp  Last timestamp of which updated the accumulators
    /// @param cumulativeRisky Cumulative sum of the risky reserves
    /// @param cumulativeStable Cumulative sum of stable reserves
    /// @param cumulativeLiquidity Cumulative sum of total liquidity supply
    struct Data {
        uint128 reserveRisky;
        uint128 reserveStable;
        uint128 liquidity;
        uint32 blockTimestamp;
        uint256 cumulativeRisky;
        uint256 cumulativeStable;
        uint256 cumulativeLiquidity;
    }

    /// @notice                 Adds to the cumulative reserves
    /// @dev                    Overflow is desired on the cumulative values
    /// @param  res             Reserve storage to update
    /// @param  blockTimestamp  Checkpoint timestamp of update
    function update(Data storage res, uint32 blockTimestamp) internal {
        uint32 deltaTime = blockTimestamp - res.blockTimestamp;
        // overflow is desired
        if (deltaTime != 0) {
            unchecked {
                res.cumulativeRisky += uint256(res.reserveRisky) * deltaTime;
                res.cumulativeStable += uint256(res.reserveStable) * deltaTime;
                res.cumulativeLiquidity += uint256(res.liquidity) * deltaTime;
            }
            res.blockTimestamp = blockTimestamp;
        }
    }

    /// @notice                 Increases one reserve value and decreases the other
    /// @param  reserve         Reserve state to update
    /// @param  riskyForStable  Direction of swap
    /// @param  deltaIn         Amount of tokens paid, increases one reserve by
    /// @param  deltaOut        Amount of tokens sent out, decreases the other reserve by
    /// @param  blockTimestamp  Timestamp used to update cumulative reserves
    function swap(
        Data storage reserve,
        bool riskyForStable,
        uint256 deltaIn,
        uint256 deltaOut,
        uint32 blockTimestamp
    ) internal {
        update(reserve, blockTimestamp);
        if (riskyForStable) {
            reserve.reserveRisky += deltaIn.toUint128();
            reserve.reserveStable -= deltaOut.toUint128();
        } else {
            reserve.reserveRisky -= deltaOut.toUint128();
            reserve.reserveStable += deltaIn.toUint128();
        }
    }

    /// @notice                 Add to both reserves and total supply of liquidity
    /// @param  reserve         Reserve storage to manipulate
    /// @param  delRisky        Amount of risky tokens to add to the reserve
    /// @param  delStable       Amount of stable tokens to add to the reserve
    /// @param  delLiquidity    Amount of liquidity created with the provided tokens
    /// @param  blockTimestamp  Timestamp used to update cumulative reserves
    function allocate(
        Data storage reserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity,
        uint32 blockTimestamp
    ) internal {
        update(reserve, blockTimestamp);
        reserve.reserveRisky += delRisky.toUint128();
        reserve.reserveStable += delStable.toUint128();
        reserve.liquidity += delLiquidity.toUint128();
    }

    /// @notice                 Remove from both reserves and total supply of liquidity
    /// @param  reserve         Reserve storage to manipulate
    /// @param  delRisky        Amount of risky tokens to remove to the reserve
    /// @param  delStable       Amount of stable tokens to remove to the reserve
    /// @param  delLiquidity    Amount of liquidity removed from total supply
    /// @param  blockTimestamp  Timestamp used to update cumulative reserves
    function remove(
        Data storage reserve,
        uint256 delRisky,
        uint256 delStable,
        uint256 delLiquidity,
        uint32 blockTimestamp
    ) internal {
        update(reserve, blockTimestamp);
        reserve.reserveRisky -= delRisky.toUint128();
        reserve.reserveStable -= delStable.toUint128();
        reserve.liquidity -= delLiquidity.toUint128();
    }

    /// @notice                 Calculates risky and stable token amounts of `delLiquidity`
    /// @param reserve          Reserve in memory to use reserves and liquidity of
    /// @param delLiquidity     Amount of liquidity to fetch underlying tokens of
    /// @return delRisky        Amount of risky tokens controlled by `delLiquidity`
    /// @return delStable       Amount of stable tokens controlled by `delLiquidity`
    function getAmounts(Data memory reserve, uint256 delLiquidity)
        internal
        pure
        returns (uint256 delRisky, uint256 delStable)
    {
        uint256 liq = uint256(reserve.liquidity);
        delRisky = (delLiquidity * uint256(reserve.reserveRisky)) / liq;
        delStable = (delLiquidity * uint256(reserve.reserveStable)) / liq;
    }
}
