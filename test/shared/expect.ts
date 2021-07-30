import { expect, use } from 'chai'
import { solidity } from 'ethereum-waffle'
import primitiveChai from './matchers'

use(solidity)
use(primitiveChai)

export default expect
