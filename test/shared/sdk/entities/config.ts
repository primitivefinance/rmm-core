// Pool Parameters
export const PoolParameters = {
  STRIKE_PRICE: 2100,
  TIME_TO_MATURITY: 0.165,
  FEE: 0.003,
}

// Price Action Parameters
export const PriceActionParameters = {
  INITIAL_REFERENCE_PRICE: 2000, // reference market price
  ANNUALIZED_VOLATILITY: 1.5, // desired volatility
  DRIFT: 0.00003, // drift of geometric brownian motion
  TIME_HORIZON: 60, // time horizon in days
  TIME_STEP_SIZE: 1, // size of time steps in days
}

// Simulation Parameters
export const SimulationParameters = {
  TAU_UPDATE_FREQUENCY: 1,
  SIMULATION_CUTOFF: 5,
  SEED: 5,
}
