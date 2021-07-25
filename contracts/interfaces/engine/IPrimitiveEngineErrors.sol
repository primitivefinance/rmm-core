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
    error RemoveLiquidityError();

    error DeltaInError();
    error DeltaOutError(uint256 expected, uint256 actual);

    error InvariantError();

    error InsufficientFloatError();
    error AboveMaxPremiumError();
}
