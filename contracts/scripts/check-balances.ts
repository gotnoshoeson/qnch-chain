import { ApiPromise, WsProvider } from '@polkadot/api';
import { blake2AsU8a, encodeAddress } from '@polkadot/util-crypto';
import { u8aConcat } from '@polkadot/util';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeedSync } from '@scure/bip39';
import { computeAddress } from 'ethers';

// Configuration
const WS_ENDPOINT = process.env.WS_ENDPOINT || 'ws://127.0.0.1:45843';

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
    const path = `m/44'/60'/0'/0/${i}`;
    const child = masterKey.derive(path);

    if (child.publicKey) {
      const address = computeAddress('0x' + Buffer.from(child.publicKey).toString('hex'));
      accounts.push(address);
    }
  }

  return accounts;
}

async function main() {
  console.log('Checking account balances...\n');

  // Connect to the chain
  const provider = new WsProvider(WS_ENDPOINT);
  const api = await ApiPromise.create({ provider });

  // Derive the Hardhat accounts
  const accounts = deriveHardhatAccounts(HARDHAT_MNEMONIC, ACCOUNT_COUNT);

  // Query and print each balance immediately
  for (let i = 0; i < accounts.length; i++) {
    const h160Address = accounts[i];

    // Convert H160 to AccountId32 using HashedAddressMapping
    const accountId32 = h160ToAccountId32(h160Address);

    // Query balance from the mapped AccountId32
    const { data: balance } = await api.query.system.account(accountId32);
    const free = balance.free.toString();

    console.log(`Account ${i}: ${h160Address} - ${free}`);
  }

  await api.disconnect();
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => process.exit());
