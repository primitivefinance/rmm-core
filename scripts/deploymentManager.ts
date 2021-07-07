import fs from 'fs-extra'

async function updateDeployments(chainId: number, contractName: string, address: string) {
  try {
    const file = await fs.readJson('./deployments.json', {
      encoding: 'utf-8',
      flag: 'a',
    })
    console.log(file)
  } catch (e) {
    console.error(e)
  }
}

async function main() {
  await updateDeployments(0, 'Foo', '0x0')
}

main()
