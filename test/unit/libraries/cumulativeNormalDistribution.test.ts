import { ethers } from 'hardhat'
import { parseEther } from '@ethersproject/units'
import { FixedPointX64, parseFixedPointX64 } from 'web3-units'

import expect from '../../shared/expect'
import { maxError } from '../../shared/utils'
import { librariesFixture } from '../../shared/fixtures'
import { testContext } from '../../shared/testContext'

import { TestCumulativeNormalDistribution } from '../../../typechain'
import { createFixtureLoader } from 'ethereum-waffle'
import { Wallet } from 'ethers'

// array values below calculated with https://keisan.casio.com/calculator
const cdfs = {
  [-5.0]: 2.86651571879193911674e-7,
  [-2.0]: 0.02275013194817920720028,
  [-1.0]: 0.1586552539314570514148,
  [-0.9]: 0.1840601253467594885542,
  [-0.8]: 0.2118553985833966855755,
  [-0.7]: 0.2419636522230730147494,
  [-0.6]: 0.2742531177500735802944,
  [-0.5]: 0.3085375387259868963623,
  [-0.4]: 0.3445782583896758332631,
  [-0.3]: 0.3820885778110473626935,
  [-0.2]: 0.4207402905608969769576,
  [-0.1]: 0.4601721627229710185346,
  [0.0]: 0.5,
  [0.1]: 0.5398278372770289814654,
  [0.2]: 0.5792597094391030230424,
  [0.3]: 0.6179114221889526373065,
  [0.4]: 0.6554217416103241667369,
  [0.5]: 0.6914624612740131036377,
  [0.6]: 0.7257468822499264197056,
  [0.7]: 0.7580363477769269852507,
  [0.8]: 0.7881446014166033144245,
  [0.9]: 0.8159398746532405114458,
  [1.0]: 0.8413447460685429485852,
  [2.0]: 0.9772498680518207927997,
  [5.0]: 0.9999997133484281208061,
}

const icdfs = {
  [0.0]: -Infinity,
  [0.01]: -2.32634787404084110089,
  [0.02]: -2.053748910631823052937,
  [0.1]: -1.281551565544600466965,
  [0.2]: -0.8416212335729142051787,
  [0.3]: -0.5244005127080407840383,
  [0.4]: -0.2533471031357997987982,
  [0.5]: 0,
  [0.6]: 0.2533471031357997987982,
  [0.7]: 0.5244005127080407840383,
  [0.8]: 0.8416212335729142051787,
  [0.9]: 1.281551565544600466965,
  [0.98]: 2.053748910631823052937,
  [0.99]: 2.326347874040841100886,
  [1.0]: Infinity,
}

const DEBUG = false

testContext('testCumulativeNormalDistribution', function () {
  let loadFixture: ReturnType<typeof createFixtureLoader>
  let signer: Wallet, other: Wallet
  before(async function () {
    ;[signer, other] = await (ethers as any).getSigners()
    loadFixture = createFixtureLoader([signer, other])
  })

  beforeEach(async function () {
    const fixture = await loadFixture(librariesFixture)
    this.libraries = fixture.libraries
  })

  describe('cumulative library', function () {
    let cumulative: TestCumulativeNormalDistribution

    beforeEach(async function () {
      cumulative = this.libraries.testCumulativeNormalDistribution
    })

    for (let x in cdfs) {
      it(`gets the cdf of ${x}`, async function () {
        const expected = +cdfs[x]
        const value =
          Math.sign(+x) >= 0
            ? await cumulative.cdf(parseEther(x))
            : await cumulative.signedCDF(parseEther((+x * -1).toString()))

        const actual = new FixedPointX64(value).parsed
        const ae = actual - expected
        const error = (ae / expected) * 100
        if (DEBUG) console.log(`   Expected: ${expected}, actual: ${actual} with ae: ${ae} and error: ${error}%`)

        const addedMaxError = +x <= 0.1 && +x >= -0.1 ? 0.55e-3 : 0
        expect(expected).to.be.closeTo(actual, maxError.cdf + addedMaxError)
      })
    }

    for (let x in icdfs) {
      it(`gets the inverse cdf of ${x}`, async function () {
        const expected = +icdfs[x]
        if (expected == Infinity || expected == -Infinity) {
          await expect(cumulative.inverseCDF(parseEther(x))).to.be.reverted
        } else {
          const isTail = +x > 0.975 || +x < 0.025

          const value = await cumulative.inverseCDF(parseEther(x))

          const actual = new FixedPointX64(value).parsed
          const ae = actual - expected
          const error = (ae / expected) * 100
          if (DEBUG) console.log(`   Expected: ${expected}, actual: ${actual} with ae: ${ae} and error: ${error}%`)
          expect(expected).to.be.closeTo(actual, isTail ? maxError.tailInverseCDF : maxError.centralInverseCDF)
        }
      })
    }

    it('inverseCDF: x >= 1 should revert', async function () {
      await expect(cumulative.inverseCDF(parseEther('1'))).to.be.reverted // flips sign in fn
    })

    it('inverseCDF: x == 0 should revert', async function () {
      await expect(cumulative.inverseCDF(parseEther('0'))).to.be.reverted // flips sign in fn
    })

    it('signedInverseCDF: negative value should revert', async function () {
      let x = 0.25
      await expect(cumulative.signedInverseCDF(parseFixedPointX64(Math.floor(x * 1e4), 4).raw)).to.be.reverted // flips sign in fn
    })
  })
})
