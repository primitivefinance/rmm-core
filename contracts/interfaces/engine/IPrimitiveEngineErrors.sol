// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Errors for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineErrors {
    error LockedError();
    error BalanceError();

    error CalibrationError();
    error PoolDuplicateError();

    error RiskyBalanceError(uint256 expected, uint256 actual);
    error StableBalanceError(uint256 expected, uint256 actual);

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
