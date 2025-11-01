import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady, blake2AsU8a, encodeAddress } from '@polkadot/util-crypto';
import { u8aConcat } from '@polkadot/util';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { computeAddress } from 'ethers';

// Configuration
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://127.0.0.1:44803';
const FUNDING_AMOUNT = '1000000000000000'; // 1000 tokens (adjust decimals based on your chain)

// Hardhat mnemonic from config
const HARDHAT_MNEMONIC = 'test test test test test test test test test test test junk';
const ACCOUNT_COUNT = 4;

/**
 * Convert H160 (Ethereum) address to AccountId32 (Substrate) using HashedAddressMapping
 * This matches the runtime's HashedAddressMapping<BlakeTwo256> implementation
 * Returns the SS58-encoded address string
 */
function h160ToAccountId32(h160Address: string, ss58Format: number = 42): string {
  // Remove 0x prefix if present
  const cleanAddress = h160Address.startsWith('0x') ? h160Address.slice(2) : h160Address;

  // Convert hex string to bytes
  const addressBytes = new Uint8Array(Buffer.from(cleanAddress, 'hex'));

  // Prefix with "evm:" as per HashedAddressMapping implementation
  const prefix = new TextEncoder().encode('evm:');
  const data = u8aConcat(prefix, addressBytes);

  // Hash with Blake2-256 to get the AccountId32
  const accountId32Bytes = blake2AsU8a(data, 256);

  // Encode as SS58 address
  return encodeAddress(accountId32Bytes, ss58Format);
}

/**
 * Derive Ethereum addresses from mnemonic (same as Hardhat does)
 */
function deriveHardhatAccounts(mnemonic: string, count: number): string[] {
  const seed = mnemonicToSeedSync(mnemonic);
  const masterKey = HDKey.fromMasterSeed(seed);

  const accounts: string[] = [];

  for (let i = 0; i < count; i++) {
    // Hardhat uses the path: m/44'/60'/0'/0/i
    const path = `m/44'/60'/0'/0/${i}`;
    const child = masterKey.derive(path);

    if (child.publicKey) {
      // Compute the Ethereum address from the public key
      const address = computeAddress('0x' + Buffer.from(child.publicKey).toString('hex'));
      accounts.push(address);
    }
  }

  return accounts;
}

async function main() {
  console.log('🚀 Starting funding script for Hardhat accounts...\n');

  // Wait for crypto to be ready
  await cryptoWaitReady();

  // Connect to the chain
  console.log(`📡 Connecting to ${WS_ENDPOINT}...`);
  const provider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });

  // Get chain info
  const chain = await api.rpc.system.chain();
  const chainDecimals = api.registry.chainDecimals[0] || 18;
  const chainToken = api.registry.chainTokens[0] || 'Unit';

  console.log(`✅ Connected to ${chain}`);
  console.log(`💰 Token: ${chainToken}, Decimals: ${chainDecimals}\n`);

  // Initialize keyring for Substrate accounts
  const keyring = new Keyring({ type: 'sr25519' });

  // Get Alice's account (standard development account)
  const alice = keyring.addFromUri('//Alice');
  console.log(`👤 Funder: Alice (${alice.address})\n`);

  // Get Alice's balance
  const { data: aliceBalance } = await api.query.system.account(alice.address);
  console.log(`💵 Alice's balance: ${aliceBalance.free.toString()} ${chainToken}\n`);

  // Derive the 10 Hardhat accounts
  console.log('🔑 Deriving Hardhat accounts from mnemonic...\n');
  const accounts = deriveHardhatAccounts(HARDHAT_MNEMONIC, ACCOUNT_COUNT);

  console.log('Accounts to fund:');
  accounts.forEach((address, i) => {
    console.log(`  ${i}: ${address}`);
  });
  console.log('');

  // Fund each account
  console.log('💸 Starting transfers...\n');

  const transfers = [];

  for (let i = 0; i < accounts.length; i++) {
    const h160Address = accounts[i];

    // Convert H160 to AccountId32 using HashedAddressMapping
    const accountId32 = h160ToAccountId32(h160Address);

    console.log(`  📤 Funding Account ${i}`);
    console.log(`      H160: ${h160Address}`);
    console.log(`      Mapped SS58: ${accountId32}`);

    try {
      // Create transfer transaction to the mapped AccountId32
      const transfer = api.tx.balances.transferKeepAlive(
        accountId32,
        FUNDING_AMOUNT
      );

      // Sign and send transaction, wait for it to be included in a block
      await new Promise<string>((resolve, reject) => {
        let unsubscribe: (() => void) | undefined;

        transfer.signAndSend(alice, ({ status, dispatchError }) => {
          if (status.isInBlock) {
            console.log(`  ✅ Transaction included in block: ${status.asInBlock.toString()}`);

            if (dispatchError) {
              if (dispatchError.isModule) {
                const decoded = api.registry.findMetaError(dispatchError.asModule);
                const { docs, name, section } = decoded;
                if (unsubscribe) unsubscribe();
                reject(new Error(`${section}.${name}: ${docs.join(' ')}`));
              } else {
                if (unsubscribe) unsubscribe();
                reject(new Error(dispatchError.toString()));
              }
            } else {
              transfers.push({ account: i, address: h160Address, hash: status.asInBlock.toString() });
              if (unsubscribe) unsubscribe();
              resolve(status.asInBlock.toString());
            }
          }
        }).then((unsub) => {
          unsubscribe = unsub;
        }).catch(reject);
      });

    } catch (error) {
      console.error(`  ❌ Failed to fund Account ${i}:`, error);
    }

    console.log('');
  }

  console.log(`✅ Successfully funded ${transfers.length}/${ACCOUNT_COUNT} accounts\n`);

  // Check balances of funded accounts
  console.log('📊 Final balances:\n');

  for (const { account, address } of transfers) {
    // Convert H160 to AccountId32 to check balance
    const accountId32 = h160ToAccountId32(address);
    const { data: balance } = await api.query.system.account(accountId32);
    console.log(`  Account ${account} (${address}): ${balance.free.toString()} ${chainToken}`);
  }

  // Disconnect
  await api.disconnect();
  console.log('\n✨ Funding complete!');
}

main()
  .catch(console.error)
  .finally(() => process.exit());
