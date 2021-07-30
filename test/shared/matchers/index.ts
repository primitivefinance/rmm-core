import supportRevertCustomError from './supportRevertCustomError'
import supportMargin from './supportMargin'
import supportPosition from './supportPosition'

// Custom Chai matchers for Primitive v2

export default function primitiveChai(chai: Chai.ChaiStatic) {
  supportRevertCustomError(chai.Assertion)
  supportMargin(chai.Assertion)
  supportPosition(chai.Assertion)
}
