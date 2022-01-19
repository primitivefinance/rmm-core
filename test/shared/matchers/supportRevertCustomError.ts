// Chai matcher for custom revert errors

export default function supportRevertCustomError(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod(
    'revertWithCustomError',
    async function (this: any, errorName: string, params?: any[], chainId?: number) {
      const promise = this._obj

      const onSuccess = (value: any) => {
        this.assert(
          false,
          'Expected transaction to be reverted',
          'Expected transaction NOT to be reverted',
          'Transaction reverted.',
          'Transaction NOT reverted.'
        )
        return value
      }

      const onError = (error: any) => {
        const message =
          error instanceof Object && 'message' in error ? (error.message as string) : JSON.stringify(error)

        // reason for this is because hardhat and ganache have different error messages
        const delimiter = chainId ? (chainId === 1337 ? 'revert' : chainId === 31337 ? "'" : 'revert') : 'revert'
        const [, revertMsg] = message?.split(delimiter)

        const [actualErrorName, actualParamsRaw] = revertMsg.split('(')
        const actualParams = actualParamsRaw
          .substring(0, actualParamsRaw.length - 1)
          .replace(/ /g, '')
          .split(',')

        const expectedError = errorName.split('(')[0]
        this.assert(
          actualErrorName.trim() === expectedError.trim(),
          `Expected ${actualErrorName} to be ${expectedError}`,
          `Expected ${actualErrorName} NOT to be ${expectedError}`,
          expectedError,
          actualErrorName
        )

        if (params && params.length > 0) {
          for (let i = 0; i < actualParams.length; i += 1) {
            if (typeof actualParams[i] === 'undefined') continue
            const actual = actualParams[i].trim()
            const expected = params[i].trim()
            this.assert(
              actual === expected,
              `Expected ${actual} to be ${expected}`,
              `Expected ${actual} NOT to be ${expected}`,
              expected,
              actual
            )
          }
        }
      }

      const derivedPromise = promise.then(onSuccess, onError)

      this.then = derivedPromise.then.bind(derivedPromise)
      this.catch = derivedPromise.catch.bind(derivedPromise)
      this.promise = derivedPromise
      return this
    }
  )
}
