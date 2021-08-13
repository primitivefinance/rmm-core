import supportRevertCustomError from './supportRevertCustomError'
import supportMargin from './supportMargin'
import supportPosition from './supportPosition'
import supportReserve from './supportReserve'

// Custom Chai matchers for Primitive v2

export default function primitiveChai(chai: Chai.ChaiStatic) {
  supportRevertCustomError(chai.Assertion)
  supportMargin(chai.Assertion)
  supportPosition(chai.Assertion)
  supportReserve(chai.Assertion)
}
