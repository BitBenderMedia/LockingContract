require("dotenv").config();
const Web3 = require("web3");
//Factory.json file contains my compiled Factory.sol file
const contract = require("./build/contracts/GalaTokenTimeLock.json");
const PrivateKeyProvider = require("truffle-privatekey-provider");
const tokenAddress = process.argv[2];

const privateKey = process.env.PRIVATE_KEY;
const web3url = process.env.WEB3URL;

const provider = new PrivateKeyProvider(privateKey, web3url);

const web3 = new Web3(provider);

const deploy = async () => {
    const accounts = await web3.eth.getAccounts();

    console.log("Attempting to deploy from account: ", accounts[0]);

    const result = await new web3.eth.Contract(contract.abi)
        .deploy({ data: contract.bytecode, arguments: [tokenAddress, '0'] })
        .send({ gas: "2000000", from: accounts[0] });

    //This will display the address to which your contract was deployed
    console.log("Contract deployed to: ", result.options.address);
};
deploy();
