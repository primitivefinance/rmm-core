import { inverse_std_n_cdf, std_n_cdf } from '../../CumulativeNormalDistribution'

export const quantilePrime = (x) => {
  return Math.pow(std_n_cdf(inverse_std_n_cdf(x)), -1)
}
