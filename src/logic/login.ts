import { keccak256, stringToBytes, isAddress } from 'viem';
import { accountChains, type AccountChainConfig } from './chains';

/** Thrown when the entered string is not a valid EVM address. */
export class InvalidAddressError extends Error {
  constructor() { super('Enter a valid address.'); this.name = 'InvalidAddressError'; }
}
/** Thrown when no deployed account exists at the address on any account chain. */
export class AccountNotFoundError extends Error {
  constructor() { super('No account found at this address.'); this.name = 'AccountNotFoundError'; }
}
/** Thrown when the account exists but isn't controlled by a recognized passkey signer. */
export class NotPasskeyOwnerError extends Error {
  constructor() { super("This account isn't controlled by a passkey."); this.name = 'NotPasskeyOwnerError'; }
}
/** Thrown when the passkey public key could not be read (zero/unreadable). */
export class PubkeyUnreadableError extends Error {
  constructor() { super("Couldn't read this account's passkey key."); this.name = 'PubkeyUnreadableError'; }
}

// keccak256("SafeWebAuthnSharedSigner.signer") - 1 — the namespaced slot the
// SafeWebAuthnSharedSigner writes (x, y, verifiers) into the Safe's own storage
// (configure() runs via DELEGATECALL). This demo's accounts use the shared
// signer; (x, y) live at base and base+1.
const SHARED_SIGNER_SLOT_BASE =
  BigInt(keccak256(stringToBytes('SafeWebAuthnSharedSigner.signer'))) - 1n;

function slotHex(slot: bigint): string {
  return '0x' + slot.toString(16).padStart(64, '0');
}

async function rpc(rpcUrl: string, method: string, params: unknown[]): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result as string;
}

async function isDeployed(chain: AccountChainConfig, address: string): Promise<boolean> {
  const code = await rpc(chain.jsonRpcProvider, 'eth_getCode', [address, 'latest']);
  return code !== '0x' && code !== '0x0' && code.length > 2;
}

async function readSharedSignerPubkey(
  chain: AccountChainConfig,
  address: string,
): Promise<{ x: bigint; y: bigint }> {
  const [xHex, yHex] = await Promise.all([
    rpc(chain.jsonRpcProvider, 'eth_getStorageAt', [address, slotHex(SHARED_SIGNER_SLOT_BASE), 'latest']),
    rpc(chain.jsonRpcProvider, 'eth_getStorageAt', [address, slotHex(SHARED_SIGNER_SLOT_BASE + 1n), 'latest']),
  ]);
  const x = BigInt(xHex);
  const y = BigInt(yHex);
  if (x === 0n && y === 0n) throw new PubkeyUnreadableError();
  return { x, y };
}

/**
 * Resolve a Safe address to its passkey public key by reading on-chain state.
 * Walks `accountChains`, uses the first chain where the Safe is deployed, and
 * reads (x, y) from the SafeWebAuthnSharedSigner storage slot.
 *
 * Demo-local stopgap until abstractionkit ships `getOwnerDetails`. Only the
 * shared-signer path (this demo's model) is supported.
 */
export async function resolvePasskeyFromAddress(
  address: string,
): Promise<{ x: bigint; y: bigint }> {
  if (!isAddress(address)) throw new InvalidAddressError();

  let foundDeployed = false;
  for (const chain of accountChains) {
    let deployed = false;
    try {
      deployed = await isDeployed(chain, address);
    } catch {
      continue; // RPC hiccup on this chain — try the next
    }
    if (!deployed) continue;
    foundDeployed = true;
    try {
      return await readSharedSignerPubkey(chain, address);
    } catch (e) {
      if (e instanceof PubkeyUnreadableError) {
        // Deployed but no shared-signer key here — not a passkey shared-signer Safe.
        throw new NotPasskeyOwnerError();
      }
      throw e;
    }
  }

  throw foundDeployed ? new NotPasskeyOwnerError() : new AccountNotFoundError();
}
