const assert = require('assert');
const ganache = require('ganache-cli');
const Web3 = require('web3');
const provider = ganache.provider();
const web3 = new Web3(provider);
global.web3 = web3;
const BN = require('bignumber.js');
const e18 = new BN('1000000000000000000');

const GalaTokenTimeLock = require('../build/contracts/GalaTokenTimeLock.json');
const Sample = require('./Sample.json');

var SampleTokenContract = null;
var GalaTokenTimeLockContract = null;
let accounts;
let accountReceiver = null;
let contractCreator = null;

async function getCurrentChainTime() {
    let blockNum = await web3.eth.getBlockNumber();
    let block = await web3.eth.getBlock(blockNum);
    return block.timestamp;
}

let advanceTime = async (time) => {
    let currentTime = await getCurrentChainTime();
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [time],
            id: currentTime
        }, (err, result) => {
            if (err) { return reject(err) }
            return resolve(result)
        })
    })
}


let advanceBlock = async () => {
    let currentTime = await getCurrentChainTime();
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_mine',
            id: currentTime
        }, (err, result) => {
            if (err) { return reject(err) }
            const newBlockHash = web3.eth.getBlock('latest').hash

            return resolve(newBlockHash)
        })
    })
}

let advanceTimeAndBlock = async (time) => {
    await advanceTime(time)
    await advanceBlock()
    return Promise.resolve(web3.eth.getBlock('latest'))
}

function toWei(amount) {
    return new BN(amount).multipliedBy(e18).toFixed(0);
}

contract("GalaTokenTimeLock", () => {
    before(async function () {
        accounts = await web3.eth.getAccounts();
        contractCreator = accounts[0];
        SampleTokenContract = await new web3.eth.Contract(Sample.abi)
            .deploy({ data: Sample.bytecode })
            .send({ gas: "2000000", from: contractCreator });
        GalaTokenTimeLockContract = await new web3.eth.Contract(GalaTokenTimeLock.abi)
            .deploy({ data: GalaTokenTimeLock.bytecode, arguments: [SampleTokenContract.options.address] })
            .send({ gas: "2000000", from: contractCreator });
        accountReceiver = accounts[1];
        await SampleTokenContract.methods.transfer(accountReceiver, toWei('15000')).send({ from: contractCreator });
        for (var i = 2; i < accounts.length; i++) {
            await SampleTokenContract.methods.transfer(accounts[i], toWei('15000')).send({ from: contractCreator });
        }
        console.log('sample:', SampleTokenContract.options.address);
        console.log('time lock:', GalaTokenTimeLockContract.options.address);
    });
    it("Full cycle: deposit, withdraw", async () => {
        await SampleTokenContract.methods.approve(GalaTokenTimeLockContract.options.address, toWei('1000')).send(
            { from: contractCreator }
        )
        //deposoit
        var balBefore = await SampleTokenContract.methods.balanceOf(GalaTokenTimeLockContract.options.address).call();
        var depositAmount = toWei('555');
        await GalaTokenTimeLockContract.methods.deposit(depositAmount).send(
            { gas: "2000000", from: contractCreator }
        )
        var balAfter = await SampleTokenContract.methods.balanceOf(GalaTokenTimeLockContract.options.address).call();
        var diff = new BN(balAfter).minus(new BN(balBefore));
        assert.strictEqual(diff.toString(), depositAmount, 'deposit failed');
    });

    it("deposit failed if not approve", async () => {
        //reset approve
        await SampleTokenContract.methods.approve(GalaTokenTimeLockContract.options.address, toWei('0')).send(
            { from: contractCreator }
        )

        var balBefore = await SampleTokenContract.methods.balanceOf(GalaTokenTimeLockContract.options.address).call();
        var depositAmount = toWei(555);
        try {
            await GalaTokenTimeLockContract.methods.deposit(depositAmount).send(
                { gas: "2000000", from: contractCreator }
            )
            assert.ok(false);
        } catch (e) {

        }
        var balAfter = await SampleTokenContract.methods.balanceOf(GalaTokenTimeLockContract.options.address).call();
        assert.strictEqual(balBefore, balAfter, 'deposit failed');
    });

    it("Should be able to unlock after lock period", async () => {
        await SampleTokenContract.methods.approve(GalaTokenTimeLockContract.options.address, toWei('1000')).send(
            { from: contractCreator }
        )
        //deposoit
        var depositAmount = toWei('555');
        await GalaTokenTimeLockContract.methods.deposit(depositAmount).send(
            { gas: "2000000", from: contractCreator }
        )

        var depositID = await GalaTokenTimeLockContract.methods.getTotalNumDeposits().call();
        depositID = new BN(depositID).minus(1);

        let withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositID.toString()).call();
        assert.ok(!withdrawable, "lock token should not be withdrawnable");

        let withdrawableAmount = await GalaTokenTimeLockContract.methods.getTotalWithdrawnableAmount(contractCreator).call();
        assert.strictEqual(0, new BN(0).comparedTo(new BN(withdrawableAmount)), 'Withdrawanble amount should be zero if no locks are available for withdrawal');

        let withdrawableList = await GalaTokenTimeLockContract.methods.getWithdrawnableList(contractCreator).call();
        assert.strictEqual(0, withdrawableList.length, "Withdrawable list should be empty");

        //time travel forwards 90 day+
        await advanceTimeAndBlock(86400 * 90 + 1);
        withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositID.toString).call();
        assert.ok(withdrawable, "lock token should be withdrawnable after 90 days+ lock");

        withdrawableAmount = await GalaTokenTimeLockContract.methods.getTotalWithdrawnableAmount(contractCreator).call();
        assert.ok(new BN(withdrawableAmount).comparedTo(new BN(0)) > 0, 'Withdrawanble amount should be > zero after lock period');

        withdrawableList = await GalaTokenTimeLockContract.methods.getWithdrawnableList(contractCreator).call();
        assert.ok(withdrawableList.length > 0, "Withdrawable list should be not empty");

        //withdraw all 
        //balance before withdraw
        let balBefore = await SampleTokenContract.methods.balanceOf(contractCreator).call();
        await GalaTokenTimeLockContract.methods.withdrawAllPossible(contractCreator).send({ gas: "2000000", from: contractCreator });
        let balAfter = await SampleTokenContract.methods.balanceOf(contractCreator).call();
        var diff = new BN(balAfter).minus(new BN(balBefore));
        assert.strictEqual(diff.toString(), new BN(withdrawableAmount).toString(), 'Withdrawed amount should be exact withdrawnable amount');

        withdrawableAmount = await GalaTokenTimeLockContract.methods.getTotalWithdrawnableAmount(contractCreator).call();
        assert.strictEqual(0, new BN(withdrawableAmount).comparedTo(0), 'Withdrawed amount should be 0 after withdrawing all deposits');

        try {
            await GalaTokenTimeLockContract.methods.withdrawAllPossible(contractCreator).send({ gas: "2000000", from: contractCreator });
            assert.fail('Double withdrawn: buggy');
        } catch (e) {

        }
    });

    it("Failed to unlock before lock period", async () => {
        await SampleTokenContract.methods.approve(GalaTokenTimeLockContract.options.address, toWei('1000')).send(
            { from: accountReceiver }
        )
        //deposoit
        var balBefore = await SampleTokenContract.methods.balanceOf(GalaTokenTimeLockContract.options.address).call();
        var depositAmount = toWei('555');
        await GalaTokenTimeLockContract.methods.deposit(depositAmount).send(
            { gas: "2000000", from: accountReceiver }
        )

        var balAfter = await SampleTokenContract.methods.balanceOf(GalaTokenTimeLockContract.options.address).call();
        var diff = new BN(balAfter).minus(new BN(balBefore));
        assert.strictEqual(diff.toString(), depositAmount, 'deposit failed');

        //get deposit id
        var depositID = await GalaTokenTimeLockContract.methods.getTotalNumDeposits().call();
        depositID = new BN(depositID).minus(1);

        let withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositID.toString()).call();
        assert.ok(!withdrawable, "lock token should not be withdrawnable");

        let withdrawableAmount = await GalaTokenTimeLockContract.methods.getTotalWithdrawnableAmount(accountReceiver).call();
        assert.strictEqual(0, new BN(0).comparedTo(new BN(withdrawableAmount)), 'Withdrawanble amount should be zero if no locks are available for withdrawal');

        let withdrawableList = await GalaTokenTimeLockContract.methods.getWithdrawnableList(accountReceiver).call();
        assert.strictEqual(0, withdrawableList.length, "Withdrawable list should be empty");

        try {
            await GalaTokenTimeLockContract.methods.withdraw(depositID.toString()).send(
                { gas: "2000000", from: accountReceiver }
            )
            assert.fail('Buggy: user can unlock before locking period')
        } catch (e) {
            assert.ok(true);
        }

        try {
            await GalaTokenTimeLockContract.methods.withdrawAllPossible(accountReceiver).send(
                { gas: "2000000", from: accountReceiver }
            )
            assert.fail('Buggy: user can unlock before locking period')
        } catch (e) {
            assert.ok(true);
        }
    });

    it("Should not be able to double withdraw", async () => {
        await SampleTokenContract.methods.approve(GalaTokenTimeLockContract.options.address, toWei('1000')).send(
            { from: accounts[2] }
        )
        //deposoit
        var depositAmount = toWei('555');
        await GalaTokenTimeLockContract.methods.deposit(depositAmount).send(
            { gas: "2000000", from: accounts[2] }
        )

        var depositID = await GalaTokenTimeLockContract.methods.getTotalNumDeposits().call();
        depositID = new BN(depositID).minus(1);

        let withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositID.toString()).call();
        assert.ok(!withdrawable, "lock token should not be withdrawnable");

        let withdrawableAmount = await GalaTokenTimeLockContract.methods.getTotalWithdrawnableAmount(accounts[2]).call();
        assert.strictEqual(0, new BN(0).comparedTo(new BN(withdrawableAmount)), 'Withdrawanble amount should be zero if no locks are available for withdrawal');

        let withdrawableList = await GalaTokenTimeLockContract.methods.getWithdrawnableList(accounts[2]).call();
        assert.strictEqual(0, withdrawableList.length, "Withdrawable list should be empty");
        //time travel forwards 90 day+
        await advanceTimeAndBlock(86400 * 90 + 1);
        withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositID.toString()).call();
        assert.ok(withdrawable, "lock token should be withdrawnable after 90 days+ lock");

        //balance before withdraw
        let balBefore = await SampleTokenContract.methods.balanceOf(accounts[2]).call();
        await GalaTokenTimeLockContract.methods.withdraw(depositID.toString()).send({ gas: "2000000", from: accounts[2] });
        let balAfter = await SampleTokenContract.methods.balanceOf(accounts[2]).call();
        var diff = new BN(balAfter).minus(new BN(balBefore));
        assert.strictEqual(diff.toString(), depositAmount.toString(), 'Withdrawed amount should be exactly the deposit amount');

        withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositID.toString()).call();
        assert.ok(!withdrawable, "Token already withdrawn");

        withdrawableAmount = await GalaTokenTimeLockContract.methods.getTotalWithdrawnableAmount(accounts[2]).call();
        assert.strictEqual(0, new BN(withdrawableAmount).comparedTo(0), 'Withdrawed amount should be 0 after withdrawing all deposits');

        try {
            await GalaTokenTimeLockContract.methods.withdrawAllPossible(accounts[2]).send({ gas: "2000000", from: accounts[2] });
            assert.fail('Double withdrawn: buggy');
        } catch (e) {

        }
    });

    it("Many deposits can be withdrawn", async () => {
        let depositIDs = [];
        let times = 2;
        let balanceBefore = {};
        for (var i = 0; i < accounts.length; i++) {
            let balBefore = await SampleTokenContract.methods.balanceOf(accounts[i]).call();
            balanceBefore[accounts[i]] = balBefore;
            await SampleTokenContract.methods.approve(GalaTokenTimeLockContract.options.address, toWei('1000000')).send(
                { from: accounts[i] }
            )
            for (var j = 0; j < times; j++) {
                //deposoit
                var whole = 10 * (i + 1) + j;
                var depositAmount = toWei(whole);
                await GalaTokenTimeLockContract.methods.deposit(depositAmount).send(
                    { gas: "2000000", from: accounts[i] }
                )

                var depositID = await GalaTokenTimeLockContract.methods.getTotalNumDeposits().call();
                depositID = new BN(depositID).minus(1);
                depositIDs.push(depositID);
            }
            let balAfter = await SampleTokenContract.methods.balanceOf(accounts[i]).call();
            assert.ok(new BN(balBefore).comparedTo(new BN(balAfter)) > 0, 'Token should be sent already');
        }

        //verify that all withdrawal ids are not withdrawnable
        for (var i = 0; i < depositIDs.length; i++) {
            let withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositIDs[i].toString()).call();
            assert.ok(!withdrawable, "lock token should not be withdrawnable");
        }

        await advanceTimeAndBlock(86400 * 90 + 1);

        //verify that all withdrawal ids are not withdrawnable
        for (var i = 0; i < depositIDs.length; i++) {
            let withdrawable = await GalaTokenTimeLockContract.methods.isWithdrawnable(depositIDs[i].toString()).call();
            assert.ok(withdrawable, "lock token should not be withdrawnable");
        }

        //withdraw all deposits
        for (var i = 0; i < depositIDs.length; i++) {
            await GalaTokenTimeLockContract.methods.withdraw(depositIDs[i].toString()).send({ gas: "2000000", from: accounts[0] });
        }

        //check token balance come back
        for (var i = 0; i < accounts.length; i++) {
            let balAfter = await SampleTokenContract.methods.balanceOf(accounts[i]).call();
            assert.strictEqual(balanceBefore[accounts[i]], balAfter, "token should come back after withdrawals");
        }
    })
})




