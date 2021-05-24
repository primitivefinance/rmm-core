import { parseWei, PERCENTAGE } from './Units'
import { getMinTick, getMaxTick } from './utilities'

const [strike, sigma, time] = [parseWei('1000').raw, 0.85 * PERCENTAGE, 31449600]

const TICK_SPACING = 60

const minTick = getMinTick(TICK_SPACING)
const maxTick = getMaxTick(TICK_SPACING)

export { strike, sigma, time, TICK_SPACING, minTick, maxTick }
