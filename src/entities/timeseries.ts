import stoch from 'stochastic'

export function GBM(S0, mu, sigma, T, steps, path) {
  return stoch.GBM(S0, mu, sigma, T, steps, path)
}
