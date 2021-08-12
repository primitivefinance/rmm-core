// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.6;

/// @title  Errors for the Primitive Engine contract
/// @author Primitive

interface IPrimitiveEngineErrors {
    /// @notice Thrown when a callback function calls the engine again
    error LockedError();

    /// @notice Thrown when the actual balance is less than the expected balance
    error BalanceError();

    /// @notice Thrown when a pool already exists
    error PoolDuplicateError();

    /// @notice Thrown when timestamp is > than maturity
    error PoolExpiredError();

    /// @notice Thrown when the parameters of a new pool are invalid
    error CalibrationError(uint256 delRisky, uint256 delStable);

    /// @notice Thrown when the actual risky balance is less than the actual balance
    /// @param expected The expected risky balance
    /// @param actual The actual risky balance
    error RiskyBalanceError(uint256 expected, uint256 actual);

    /// @notice Thrown when the actual stable balance is less than the actual balance
    /// @param expected The expected stable balance
    /// @param actual The actual stable balance
    error StableBalanceError(uint256 expected, uint256 actual);

    /// @notice Thrown when the pool does not exist
    error UninitializedError();

    /// @notice Thrown when the risky or stable amount is 0
    error ZeroDeltasError();

    /// @notice Thrown when the liquidity parameter is 0
    error ZeroLiquidityError();

    /// @notice Thrown when the deltaIn parameter is 0
    error DeltaInError();

    /// @notice Thrown when the deltaOut parameter is 0
    error DeltaOutError();

    /// @notice Thrown when the invariant is invalid
    /// @param  invariant Pre-swap invariant updated with new tau
    /// @param  nextInvariant Post-swap invariant
    error InvariantError(int128 invariant, int128 nextInvariant);
}
