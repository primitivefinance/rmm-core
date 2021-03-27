Math:

Black-scholes call replication

y = R2 = RISK FREE
x = R1 = RISKY ASSET

y = K CDF(CDF^-1(1-x) - sigma\*sqrt(t))

y = reserve1
x = reverve0
K = strike price
sigma = implied vol
t = time to expiry
Phi = Normal CDF

If we have some constant I

I = y - K\*F(x)
I + K\*F(x) = y

American perpetual put replication:

APP = K - P(c) where P(c) is the Black-scholes price of perpetual put at strike K.

K - R2 - KR1^ ( 2r / (2r + sigma^2))
y = K - Kx^( 2r / (2r + sigma^2))

Where:
K = strike price
sigma = implied vol.
r = risk-free interest rate
R2 = y
R1 = x

100 = 50 - 50x
50 = -50x
x = -1

Constant product

y = k / x

deltaX = deltaY \* rX / rY
deltaX _ rY = deltaY _ rX

first liquidity = sqrt(amount0 \* amount1) - minLiquidity

liquidity = min(
amount0 _ supply / reserve 0,
amount1 _ supply / reserve 1
)

Where:
y = reserve0
x = reserve1
k = liquidity invariant

Covered Call
U(c) = c1 - max(c1 - K, 0)

GMM:

Dk = ( (Ps + Pi) / Ps - 1 ) _ Bk
Dk _ Bk = (Ps + Pi) / Ps - 1
PS _ (Dk _ Bk - 1) = Ps + Pi
Ps _ (Dk _ Bk - 1) - Ps = Pi
