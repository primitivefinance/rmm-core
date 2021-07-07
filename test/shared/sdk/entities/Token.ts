export class Token {
  public readonly chainId: number
  public readonly address: string
  public readonly decimals: number
  public readonly symbol?: string
  public readonly name?: string
  constructor(chainId: number, address: string, decimals: number, symbol?: string, name?: string) {
    this.address = address
    this.chainId = chainId
    this.decimals = decimals
    this.symbol = symbol
    this.name = name
  }
}
