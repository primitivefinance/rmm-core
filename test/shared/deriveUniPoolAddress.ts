import { IUniswapV3Factory, IERC20 } from '../../typechain'
import { BigNumberish } from '../shared/Units'

export const deriveUniPoolAddress = async (factory: IUniswapV3Factory, fee: BigNumberish, tokens: Array<IERC20>) => {
  const [t0, t1] = tokens

  const poolAddr =
    t0.address.toLowerCase() < t1.address.toLowerCase()
      ? await factory.getPool(t0.address, t1.address, fee)
      : await factory.getPool(t1.address, t0.address, fee)

  console.log(poolAddr)

  return poolAddr
}
