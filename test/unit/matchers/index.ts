import supportMargin from './supportMargin'

export function primitiveChai(chai: Chai.ChaiStatic) {
  supportMargin(chai.Assertion)
}
