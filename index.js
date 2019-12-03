const fs = require('fs');
const util = require('util');
const yargs = require('yargs');
const bs58 = require('bs58');
const ncp = require('ncp').ncp;
const rimraf = require('rimraf');
const readline = require('readline');
const URL = require('url').URL;
const nacl = require('tweetnacl');
const nacl_util = require('tweetnacl-util');
const ed2curve = require('./ed2curve.js');

const nearjs = require('nearlib');
const { KeyPair, keyStores } = require('nearlib');
const UnencryptedFileSystemKeyStore = keyStores.UnencryptedFileSystemKeyStore;

const connect = require('./utils/connect');

ncp.limit = 16;

const inspectResponse = (response) => {
    return util.inspect(response, { showHidden: false, depth: null, colors: true });
};

// TODO: Fix promisified wrappers to handle error properly

exports.newProject = async function(options) {
    // Need to wait for the copy to finish, otherwise next tasks do not find files.
    const projectDir = options.projectDir;
    const sourceDir = __dirname + '/blank_project';
    console.log(`Copying files to new project directory (${projectDir}) from template source (${sourceDir}).`);
    const copyDirFn = () => {
        return new Promise(resolve => {
            ncp (sourceDir, options.projectDir, response => resolve(response));
        });};
    await copyDirFn();
    console.log('Copying project files complete.');
};

exports.clean = async function() {
    const rmDirFn = () => {
        return new Promise(resolve => {
            rimraf(yargs.argv.outDir, response => resolve(response));
        });};
    await rmDirFn();
    console.log('Clean complete.');
};

exports.createAccount = async function(options) {
    let near = await connect(options);
    let keyPair;
    let publicKey;
    if (options.publicKey) {
        publicKey = options.publicKey;
    } else {
        keyPair = await KeyPair.fromRandom('ed25519');
        publicKey = keyPair.getPublicKey();
    }
    await near.createAccount(options.accountId, publicKey);
    if (keyPair) {
        await near.connection.signer.keyStore.setKey(options.networkId, options.accountId, keyPair);
    }
    console.log(`Account ${options.accountId} for network "${options.networkId}" was created.`);
};

exports.viewAccount = async function(options) {
    let near = await connect(options);
    let account = await near.account(options.accountId);
    let state = await account.state();
    console.log(`Account ${options.accountId}`);
    console.log(inspectResponse(state));
};

exports.deleteAccount = async function(options) {
    console.log(
        `Deleting account. Account id: ${options.accountId}, node: ${options.nodeUrl}, helper: ${options.helperUrl}, beneficiary: ${options.beneficiaryId}`);
    const near = await connect(options);
    const account = await near.account(options.accountId);
    await account.deleteAccount(options.beneficiaryId);
    console.log(`Account ${options.accountId} for network "${options.networkId}" was deleted.`);
};

exports.keys = async function(options) {
    let near = await connect(options);
    let account = await near.account(options.accountId);
    let accessKeys = await account.getAccessKeys();
    console.log(`Keys for account ${options.accountId}`);
    console.log(inspectResponse(accessKeys));
};

exports.txStatus = async function(options) {
    let near = await connect(options);
    let status = await near.connection.provider.txStatus(bs58.decode(options.hash), options.accountId || options.masterAccount);
    console.log(`Transaction ${options.hash}`);
    console.log(inspectResponse(status));
};

exports.deploy = async function(options) {
    console.log(
        `Starting deployment. Account id: ${options.accountId}, node: ${options.nodeUrl}, helper: ${options.helperUrl}, file: ${options.wasmFile}`);
    const near = await connect(options);
    const contractData = [...fs.readFileSync(options.wasmFile)];
    const account = await near.account(options.accountId);
    await account.deployContract(contractData);
};

exports.scheduleFunctionCall = async function(options) {
    console.log(`Scheduling a call: ${options.contractName}.${options.methodName}(${options.args || ''})` +
        (options.amount ? ` with attached ${options.amount} NEAR` : ''));
    const near = await connect(options);
    const account = await near.account(options.accountId);
    const functionCallResponse = await account.functionCall(options.contractName, options.methodName, JSON.parse(options.args || '{}'), options.amount);
    const result = nearjs.providers.getTransactionLastResult(functionCallResponse);
    console.log(inspectResponse(result));
};

exports.sendMoney = async function(options) {
    console.log(`Sending ${options.amount} NEAR to ${options.receiver} from ${options.sender}`);
    const near = await connect(options);
    const account = await near.account(options.sender);
    console.log(inspectResponse(await account.sendMoney(options.receiver, options.amount)));
};

exports.callViewFunction = async function(options) {
    console.log(`View call: ${options.contractName}.${options.methodName}(${options.args || ''})`);
    const near = await connect(options);
    // TODO: Figure out how to run readonly calls without account
    const account = await near.account(options.accountId || options.masterAccount || 'register.near');
    console.log(inspectResponse(await account.viewFunction(options.contractName, options.methodName, JSON.parse(options.args || '{}'))));
};

exports.stake = async function(options) {
    console.log(`Staking ${options.amount} on ${options.accountId} with public key = ${options.publicKey}.`);
    const near = await connect(options);
    const account = await near.account(options.accountId);
    const result = await account.stake(options.publicKey, options.amount);
    console.log(inspectResponse(result));
};

exports.login = async function(options) {
    if (!options.walletUrl) {
        console.log('Log in is not needed on this environment. Please use appropriate master account for shell operations.');
    } else {
        const newUrl = new URL(options.walletUrl + '/login/');
        const title = 'NEAR Shell';
        newUrl.searchParams.set('title', title);
        const keyPair = await KeyPair.fromRandom('ed25519');
        newUrl.searchParams.set('public_key', keyPair.getPublicKey());
        console.log(`Please navigate to this url and follow the instructions to log in: \n${newUrl.toString()}`);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question('Please enter the accountId that you logged in with:', async (accountId) => {
            try {
                // check that the key got added
                const near = await connect(options);
                let account = await near.account(accountId);
                let keys = await account.getAccessKeys();
                let keyFound = keys.some(key => key.public_key == keyPair.getPublicKey().toString());
                if (keyFound) {
                    const keyStore = new UnencryptedFileSystemKeyStore('./neardev');
                    await keyStore.setKey(options.networkId, accountId, keyPair);
                    console.log(`Logged in with ${accountId}`);
                } else {
                    console.log('Log in did not succeed. Please try again.');
                }
            } catch (e) {
                console.log(e);
            }
            rl.close();
        });
    }
};

function p_getSharedSecret(publicKey_base58, secretKey_base58) {
    var publicKey_Curve25519_bin = ed2curve.convertPublicKey(new Uint8Array(bs58.decode(publicKey_base58).buffer))
    var secretKey_Curve25519_bin = ed2curve.convertSecretKey(new Uint8Array(bs58.decode(secretKey_base58).buffer));

    var shared_secret = nacl.box.before(publicKey_Curve25519_bin, secretKey_Curve25519_bin);
    return shared_secret;
}

function p_box(sharedSecret, message) {
    var nonce = nacl.randomBytes(nacl.box.nonceLength);

    var message = (new TextEncoder()).encode(message)
    var encrypted = nacl.box.after(message, nonce, sharedSecret);

    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    var nonceBoxed_base58 = bs58.encode(Buffer.from(fullMessage.buffer));
    return nonceBoxed_base58;
}

//./bin/near box dx7ex8BUnB4XXj4pSobpcDqXdiPkny4pFZXn4EAaV5p7zBakguwKEWzMJBhiPtus6MC8PAdpHviBVuEXUw41d43 9yfgNakMJNAcLumq6tmT3JkX9P4rNFmWf7zaLG3jLXpc hello_joe
exports.box = async function(options) {
    console.log(`Boxing with my privateKey ${options.privateKey} so publicKey ${options.publicKey} can view.`);
    var sharedSecret = p_getSharedSecret(options.privateKey, options.publicKey);

    var nonceBoxed_base58 = p_box(sharedSecret, options.message);
    console.log(nonceBoxed_base58);
};

//./bin/near unbox dx7ex8BUnB4XXj4pSobpcDqXdiPkny4pFZXn4EAaV5p7zBakguwKEWzMJBhiPtus6MC8PAdpHviBVuEXUw41d43 9yfgNakMJNAcLumq6tmT3JkX9P4rNFmWf7zaLG3jLXpc 6G6SmxoTXsSBHKuTGqW82RLmE21NyAWHYLd6V8qUT5LdRQ82ZDquFKVg1usU3bhEMQN
exports.unbox = async function(options) {
    console.log(`Unboxing with my privateKey ${options.privateKey} and publicKey ${options.publicKey} can I view it.`);
    var sharedSecret = p_getSharedSecret(options.privateKey, options.publicKey);

    var nonceBox = bs58.decode(options.box);

    const nonce = nonceBox.slice(0, 24);
    const message = nonceBox.slice(24, options.box.length);

    var unboxed = nacl.box.open.after(message, nonce, sharedSecret);

    var text = (new TextDecoder()).decode(unboxed);
    console.log(text);
};


/*
exports.jobInsert = async function(options) {
    console.log(`Inserting a new job with my privateKey ${options.privateKey} so publicKey ${options.publicKey} can view.`);
    var sharedSecret = p_getSharedSecret(options.privateKey, options.publicKey);
    var nonceBoxed_base58 = p_box(sharedSecret, options.message);

    const near = await connect(options);
    const account = await near.account(options.accountId);
    const functionCallResponse = await account.functionCall("contract-zod-tv3", "jobInsert", JSON.parse(options.args || '{}'), options.amount);
    const result = nearjs.providers.getTransactionLastResult(functionCallResponse);
    console.log(result);
    console.log(inspectResponse(result));
};

exports.jobSetMetadata = async function(options) {
    console.log(`Setting jobMetadata with my privateKey ${options.privateKey} so publicKey ${options.publicKey} can view.`);
    var sharedSecret = p_getSharedSecret(options.privateKey, options.publicKey);
    var nonceBoxed_base58 = p_box(sharedSecret, options.message);
};
*/



function test() {
    var keya = ed2curve.convertKeyPair(nacl.sign.keyPair());
    var keyb = ed2curve.convertKeyPair(nacl.sign.keyPair());

    var anotherMessage = nacl_util.decodeUTF8('Keep silence');
    var nonce2 = nacl.randomBytes(nacl.box.nonceLength);

    var shared_secreta = nacl.box.before(keyb.publicKey, keya.secretKey);
    var shared_secretb = nacl.box.before(keya.publicKey, keyb.secretKey);
    console.log(shared_secreta);
    console.log(shared_secretb);

    var encryptedMessage = nacl.box.after(anotherMessage, nonce2, shared_secreta);
    var decryptedMessage = nacl.box.open.after(encryptedMessage, nonce2, shared_secretb);
    console.log(decryptedMessage);
}

function test2() {
    var keya = {
        publicKey: "6gsFQoMjwfkfjwgppzjK6np1PKLTEvWZTN96RHprtm9t",
        secretKey: "5NiZkxxboVYh9haKC7miLG8sjbQnaaQCvqqbxbb6Qi9uhVY1mkiv37yh24WKvAYXxag6jzydhVw7U4r1G3ZrcdEJ",
    }
    var keyb = {
        publicKey: "BxJtrTRehNH38dt9N5szDgXyFQtTe7JoxSrGdXXuKSDj",
        secretKey: "4GU1NUhz62VHnZxMVfJrRn489naWNt6P2q5qWGhACoFBLi27Xfq8svdmKd6yP8MtAAkcEHP124jtgn2Re4diUbLR",
    }
    var wtfa = nacl.sign.keyPair.fromSecretKey(bs58.decode("5NiZkxxboVYh9haKC7miLG8sjbQnaaQCvqqbxbb6Qi9uhVY1mkiv37yh24WKvAYXxag6jzydhVw7U4r1G3ZrcdEJ"))
    var wtfb = nacl.sign.keyPair.fromSecretKey(bs58.decode("4GU1NUhz62VHnZxMVfJrRn489naWNt6P2q5qWGhACoFBLi27Xfq8svdmKd6yP8MtAAkcEHP124jtgn2Re4diUbLR"))
    console.log(bs58.encode(Buffer.from(wtfa.publicKey)));
    console.log(bs58.encode(Buffer.from(wtfb.publicKey)));

    var shared_secreta = p_getSharedSecret(keyb.publicKey, keya.secretKey);
    var shared_secretb = p_getSharedSecret(keya.publicKey, keyb.secretKey);

    console.log(shared_secreta);
    console.log(shared_secretb);

    var anotherMessage = nacl_util.decodeUTF8('Keep silence');
    var nonce = nacl.randomBytes(nacl.box.nonceLength);

    var encryptedMessage = nacl.box.after(anotherMessage, nonce, shared_secreta);
    var decryptedMessage = nacl.box.open.after(encryptedMessage, nonce, shared_secretb);
    console.log(decryptedMessage);
}