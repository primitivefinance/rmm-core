// Chai matcher for custom revert errors

export default function supportRevertCustomError(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod('revertWithCustomError', async function (this: any, errorName: string, params?: any[]) {
    try {
      await this._obj
    } catch (e: any) {
      const msg: string = e?.message
      const [, revertMsg] = msg?.split("'")

      const [actualErrorName, actualParamsRaw] = revertMsg.split('(')
      const actualParams = actualParamsRaw
        .substring(0, actualParamsRaw.length - 1)
        .replace(/ /g, '')
        .split(',')

      this.assert(
        actualErrorName === errorName,
        `Expected ${actualErrorName} to be ${errorName}`,
        `Expected ${actualErrorName} NOT to be ${errorName}`,
        errorName,
        actualErrorName
      )

      if (params) {
        for (let i = 0; i < actualParams.length; i += 1) {
          this.assert(
            actualParams[i] === params[i],
            `Expected ${actualParams[i]} to be ${params[i]}`,
            `Expected ${actualParams[i]} NOT to be ${params[i]}`,
            params[i],
            actualParams[i]
          )
        }
      }
    }
  })
}
