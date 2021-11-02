// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.8.4;

/// @title  Errors for the Primitive Engine contract
/// @author Primitive
interface IPrimitiveEngineErrors {
    /// @notice Thrown when a callback function calls the engine __again__
    error LockedError();

    /// @notice Thrown when the balanceOf function is not successful and does not return data
    error BalanceError();

    /// @notice Thrown when a pool with poolId already exists
    error PoolDuplicateError();

    /// @notice Thrown when calling an expired pool, where block.timestamp > maturity, + BUFFER if swap
    error PoolExpiredError();

    /// @notice Thrown when liquidity is lower than or equal to the minimum amount of liquidity
    error MinLiquidityError(uint256 value);

    /// @notice Thrown when riskyPerLp is outside the range of acceptable values, 0 < riskyPerLp < 1eRiskyDecimals
    error RiskyPerLpError(uint256 value);

    /// @notice Thrown when sigma is outside the range of acceptable values, 100 <= sigma <= 1e7 with 4 precision
    error SigmaError(uint256 value);

    /// @notice Thrown when strike is not valid, i.e. equal to 0 or greater than 2^128
    error StrikeError(uint256 value);

    /// @notice Thrown when gamma, equal to 1 - fee %, is outside its bounds: 9000 <= gamma < 10000; 1000 = 10% fee
    error GammaError(uint256 value);

    /// @notice Thrown when the parameters of a new pool are invalid, causing initial reserves to be 0
    error CalibrationError(uint256 delRisky, uint256 delStable);

    /// @notice         Thrown when the expected risky balance is less than the actual balance
    /// @param expected Expected risky balance
    /// @param actual   Actual risky balance
    error RiskyBalanceError(uint256 expected, uint256 actual);

    /// @notice         Thrown when the expected stable balance is less than the actual balance
    /// @param expected Expected stable balance
    /// @param actual   Actual stable balance
    error StableBalanceError(uint256 expected, uint256 actual);

    /// @notice Thrown when the pool with poolId has not been created
    error UninitializedError();

    /// @notice Thrown when the risky or stable amount is 0
    error ZeroDeltasError();

    /// @notice Thrown when the liquidity parameter is 0
    error ZeroLiquidityError();

    /// @notice Thrown when the deltaIn parameter is 0
    error DeltaInError();

    /// @notice Thrown when the deltaOut parameter is 0
    error DeltaOutError();

    /// @notice                 Thrown when the invariant check fails
    /// @param  invariant       Pre-swap invariant updated with new tau
    /// @param  nextInvariant   Post-swap invariant
    error InvariantError(int128 invariant, int128 nextInvariant);
}
