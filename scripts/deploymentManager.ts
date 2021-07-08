import fs from 'fs'

export async function updateLog(chainId: number, contractName: string, address: string) {
  try {
    const logRaw = await fs.promises.readFile('./deployments.json', {
      encoding: 'utf-8',
      flag: 'a+',
    })
    let log

    if (logRaw.length === 0) {
      log = {}
    } else {
      log = JSON.parse(logRaw)
    }

    if (!log[chainId]) {
      log[chainId] = {};
    }

    log[chainId][contractName] = address;

    await fs.promises.writeFile('./deployments.json', JSON.stringify(log, null, 2));
  } catch (e) {
    console.error(e)
  }
}
