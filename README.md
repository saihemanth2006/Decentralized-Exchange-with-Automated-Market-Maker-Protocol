DEX AMM Project

Overview

This is a Decentralized Exchange implementation using an Automated Market Maker model. The project demonstrates how a simple DEX works by allowing users to trade tokens directly from a liquidity pool. Instead of using traditional order books like centralized exchanges do, this DEX uses liquidity pools where anyone can add tokens and anyone can trade against those pools.

The main idea is that when you have two tokens (Token A and Token B) in a pool, the price is determined by the ratio of how much of each token is in the pool. When someone trades one token for another, they add one type of token and take out the other type. This changes the ratio and thus changes the price.

Features

Initial and subsequent liquidity provision - Users can add tokens to create or add to liquidity pools, and they receive LP tokens representing their share.

Liquidity removal with proportional share calculation - Users can burn their LP tokens to withdraw their proportional share of tokens from the pool, including any fees they earned.

Token swaps using constant product formula (x * y = k) - The core mechanism that ensures fair pricing. The product of the two token reserves always stays constant (ignoring fees).

0.3% trading fee for liquidity providers - Every trade takes a 0.3% fee which goes to liquidity providers. This fee is collected by keeping some of the input tokens in the pool.

LP token minting and burning - When users add liquidity, they receive LP tokens. When they remove liquidity, these tokens are burned.

Architecture

The project has a simple architecture with one main smart contract called DEX.sol that handles all the logic. It manages two ERC20 tokens and keeps track of reserves (how many tokens are in the pool at any time).

The contract uses a mapping to track how many LP tokens each user has. When someone provides liquidity, we calculate how many LP tokens they should get. When they remove liquidity, we calculate what share of the pool they own and give them back that proportion of both tokens.

For swaps, the contract takes the input tokens, adds them to one reserve, calculates how many output tokens should be given based on the constant product formula, and then sends those tokens to the user.

We also use the ReentrancyGuard pattern to prevent reentrancy attacks, which is when someone tries to call back into the contract while it's processing a transaction.

Mathematical Implementation

Constant Product Formula

The core of the DEX is the constant product formula: x * y = k

Here x is the reserve of token A, y is the reserve of token B, and k is the constant product. After any trade, this product must stay the same (well, it actually increases because of fees, but ignoring fees it stays constant).

So if we have 100 tokens of A and 200 tokens of B, then k = 20000. If someone trades 10 A for B, we now have 110 A. Using the formula:
110 * y = 20000
y = 181.82

So they get 200 - 181.82 = 18.18 tokens of B.

This formula is what creates the automatic price discovery. As people trade, the ratios change, which makes the price change. If someone tries to buy too much of one token, they have to pay more and more as the ratio gets more extreme.

Fee Calculation

The 0.3% fee works like this: when someone gives us 10 tokens to swap, they actually only get credit for 9.97 tokens (10 * 0.997). The 0.03 tokens stay in the pool forever, which means the reserves grew but the user didnt get all the benefit.

This is calculated in the getAmountOut function:
amountOutWithFee = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)

The 997 in the numerator and 1000 in the denominator is just a way to apply the 0.3% fee. So the fee goes directly to all liquidity providers because their share of k increased.

LP Token Minting

For the first liquidity provider, we give them LP tokens equal to the square root of the product of the two amounts they deposit. So if they deposit 100 A and 200 B, they get sqrt(100 * 200) = 141.42 LP tokens.

For subsequent providers, we calculate how many LP tokens they should get based on the minimum of:
(amount A provided * total LP tokens) / current reserve A
(amount B provided * total LP tokens) / current reserve B

This ensures the price ratio is maintained and new providers dont get cheated by bad pricing.

Setup Instructions

Prerequisites

You need Docker and Docker Compose installed on your machine. You also need Git to clone the repository.

Installation

First, clone the repository:


cd dex-amm

Then start the Docker environment:

docker-compose up -d

To compile the contracts:

docker-compose exec app npm run compile

To run the tests:

docker-compose exec app npm test

To check test coverage:

docker-compose exec app npm run coverage

When you are done, stop Docker:

docker-compose down

Running Tests Locally (without Docker)

If you want to run tests without Docker, you can do it locally:

npm install
npm run compile
npm test

This will install dependencies, compile the smart contracts, and run all the test cases.

Contract Addresses

This project has not been deployed to any live network yet. The contracts are only tested on local networks using Hardhat. If this were deployed to a testnet like Sepolia, the addresses would be listed here.

Known Limitations

This is a simplified implementation for learning purposes. It does not handle all the edge cases that a real DEX like Uniswap handles.

We only support exactly two tokens per pool. Real DEXs support multiple pools with different token pairs.

There is no price oracle integration. The price is only based on the current pool reserves.

There is no governance token or protocol fees. All fees go to liquidity providers.

The LP token is tracked in a simple mapping instead of being a full ERC20 token. A real implementation would make LP tokens transferable.

We do not handle token decimals properly in the price calculation.

Security Considerations

The main security measure we use is ReentrancyGuard on all functions that transfer tokens. This prevents attackers from calling back into our contract while we are in the middle of a transfer.

We also use SafeERC20 patterns implicitly by checking return values on transfer calls.

All state changes happen before token transfers to prevent issues with reentrancy.

We validate all inputs and require amounts to be positive before processing.

However, this is still a learning project and should not be used in production without a proper security audit by professional auditors.