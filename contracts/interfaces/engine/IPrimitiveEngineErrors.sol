// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  The errors for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineErrors {
    error CalibrationError();
    error PoolDuplicateError();

    // TODO: Add `expect` `actual` variables
    error RiskyBalanceError();
    error StableBalanceError();

    error UninitializedError();
    error ZeroDeltasError();

    error ZeroLiquidityError();
    error RemoveLiquidityError(uint256 delLiquidity, uint256 resLiquidity);

    error DeltaInError();
    error DeltaOutError();

    error InvariantError();

    error InsufficientFloatError();
    error AboveMaxPremiumError();
}
