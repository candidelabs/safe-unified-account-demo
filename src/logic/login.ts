import { isAddress } from 'viem';
import { SafeMultiChainSigAccountV1 as SafeAccount } from 'abstractionkit';
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

// ── Verifier-proxy pubkey read ─────────────────────────────────────
//
// This demo's deployed accounts are owned by a per-passkey SafeWebAuthnSigner
// verifier proxy (Safe Passkey v0.2.1: Daimo P256 + RIP-7951). The proxy's
// runtime bytecode embeds (verifiers, y, x, singleton) at fixed offsets. We
// extract (x, y) and prove correctness by re-deriving the proxy's CREATE2
// address from them — confirmed against real Arbitrum/Base accounts.

const ZERO_WORD = '0'.repeat(64);
const V_0_2_1_PROXY_RUNTIME_TEMPLATE =
  '0x7f' + ZERO_WORD + '60b63601527f' + ZERO_WORD + '60a03601527f' + ZERO_WORD +
  '36608001523660006080376000806056360160807f' + ZERO_WORD +
  '5af43d600060803e60b1573d6080fd5b3d6080f3fe' +
  'a26469706673582212201660515548d15702d720bbc046b457ca85e941a4559ab9f9518488e4c82e5ee964736f6c634300081a0033';
const V_0_2_1_OFFSETS = { verifiers: 2, y: 78, x: 154, singletonWord: 260 };

function blankFields(hex: string, fields: Array<[number, number]>): string {
  let out = hex;
  for (const [offset, length] of fields) {
    out = out.slice(0, offset) + '0'.repeat(length) + out.slice(offset + length);
  }
  return out;
}

async function readVerifierProxyPubkey(
  chain: AccountChainConfig,
  ownerAddress: string,
): Promise<{ x: bigint; y: bigint } | null> {
  const code = await rpc(chain.jsonRpcProvider, 'eth_getCode', [ownerAddress, 'latest']);
  const body = code.startsWith('0x') ? code.slice(2) : code;
  const tpl = V_0_2_1_PROXY_RUNTIME_TEMPLATE.slice(2);
  if (body.length !== tpl.length) return null;
  const o = V_0_2_1_OFFSETS;
  const blanked = blankFields(body, [[o.verifiers, 64], [o.y, 64], [o.x, 64], [o.singletonWord, 64]]);
  if (blanked !== tpl) return null;
  const x = BigInt('0x' + body.slice(o.x, o.x + 64));
  const y = BigInt('0x' + body.slice(o.y, o.y + 64));
  // Cross-validate: re-derive the CREATE2 proxy address from (x, y).
  const derived = SafeAccount.createWebAuthnSignerVerifierAddress(x, y).toLowerCase();
  if (derived !== ownerAddress.toLowerCase()) return null;
  return { x, y };
}

/**
 * Resolve a Safe address to its passkey public key by reading on-chain state.
 * Walks `accountChains`, uses the first chain where the Safe is deployed, and
 * reads (x, y) from each owner's verifier-proxy bytecode (CREATE2-validated).
 *
 * Demo-local stopgap until abstractionkit ships `getOwnerDetails`.
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

    let owners: string[] = [];
    try {
      owners = await new SafeAccount(address).getOwners(chain.jsonRpcProvider);
    } catch {
      owners = [];
    }
    for (const owner of owners) {
      const viaProxy = await readVerifierProxyPubkey(chain, owner);
      if (viaProxy) return viaProxy;
    }

    // Deployed here but no recognized passkey verifier-proxy owner.
    throw new NotPasskeyOwnerError();
  }

  throw foundDeployed ? new NotPasskeyOwnerError() : new AccountNotFoundError();
}
