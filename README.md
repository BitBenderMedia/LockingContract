# Gala Time lock token contract

## To deploy GalaTokenTimeLock contract:

- Intall truffle: npm i -g truffle truffle-flattener
- Install dependencies: `npm i`
- Compile contracts: `truffle compile`
- Configure your private key and web3 URL (usually from infura) to deploy your contract: copy `.env.example` to `.env` and fill your info.
- Deploy: `node deploy <token address>` where `token address` is the token to be locked in the contract.

## To run unit tests

- Install Ganache or ganache-cli and turn it on port 7545
- truffle test --network-name development
