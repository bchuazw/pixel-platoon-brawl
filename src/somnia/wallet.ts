/**
 * Wallet connection for Somnia Testnet
 * Supports MetaMask (browser extension) wallet
 */
import { BrowserProvider, JsonRpcSigner, formatEther } from 'ethers';
import { SOMNIA_TESTNET } from './config';

export interface WalletState {
  connected: boolean;
  address: string | null;
  balance: string | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  chainId: number | null;
  error: string | null;
}

const initialState: WalletState = {
  connected: false,
  address: null,
  balance: null,
  signer: null,
  provider: null,
  chainId: null,
  error: null,
};

let currentState = { ...initialState };
const listeners: Set<(state: WalletState) => void> = new Set();

function notify() {
  listeners.forEach(fn => fn({ ...currentState }));
}

export function subscribeWallet(fn: (state: WalletState) => void) {
  listeners.add(fn);
  fn({ ...currentState });
  return () => { listeners.delete(fn); };
}

export function getWalletState(): WalletState {
  return { ...currentState };
}

/**
 * Request the user to switch to Somnia Testnet in their wallet
 */
async function ensureSomniaNetwork(provider: BrowserProvider) {
  const network = await provider.getNetwork();
  if (Number(network.chainId) === SOMNIA_TESTNET.chainId) return;

  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('No wallet detected');

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SOMNIA_TESTNET.chainIdHex }],
    });
  } catch (switchError: any) {
    // Chain not added — add it
    if (switchError.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: SOMNIA_TESTNET.chainIdHex,
          chainName: SOMNIA_TESTNET.name,
          nativeCurrency: SOMNIA_TESTNET.currency,
          rpcUrls: [SOMNIA_TESTNET.rpcUrl],
          blockExplorerUrls: [SOMNIA_TESTNET.explorer],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

export async function connectWallet(): Promise<WalletState> {
  try {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      currentState = { ...initialState, error: 'No wallet detected. Please install MetaMask.' };
      notify();
      return currentState;
    }

    const provider = new BrowserProvider(ethereum);
    await provider.send('eth_requestAccounts', []);
    await ensureSomniaNetwork(provider);

    // Re-create provider after network switch
    const freshProvider = new BrowserProvider(ethereum);
    const signer = await freshProvider.getSigner();
    const address = await signer.getAddress();
    const balance = formatEther(await freshProvider.getBalance(address));
    const network = await freshProvider.getNetwork();

    currentState = {
      connected: true,
      address,
      balance,
      signer,
      provider: freshProvider,
      chainId: Number(network.chainId),
      error: null,
    };

    // Listen for account/chain changes
    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    notify();
    return currentState;
  } catch (err: any) {
    currentState = { ...initialState, error: err.message || 'Connection failed' };
    notify();
    return currentState;
  }
}

export async function disconnectWallet() {
  const ethereum = (window as any).ethereum;
  if (ethereum) {
    ethereum.removeListener('accountsChanged', handleAccountsChanged);
    ethereum.removeListener('chainChanged', handleChainChanged);
  }
  currentState = { ...initialState };
  notify();
}

async function handleAccountsChanged(accounts: string[]) {
  if (accounts.length === 0) {
    currentState = { ...initialState };
    notify();
  } else {
    await connectWallet();
  }
}

function handleChainChanged() {
  // Reconnect on chain change
  connectWallet();
}

export async function refreshBalance() {
  if (!currentState.provider || !currentState.address) return;
  try {
    const balance = formatEther(await currentState.provider.getBalance(currentState.address));
    currentState = { ...currentState, balance };
    notify();
  } catch { /* ignore */ }
}
