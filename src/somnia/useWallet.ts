/**
 * React hook for wallet connection state
 */
import { useState, useEffect, useCallback } from 'react';
import { connectWallet, disconnectWallet, subscribeWallet, type WalletState } from './wallet';

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    connected: false,
    address: null,
    balance: null,
    signer: null,
    provider: null,
    chainId: null,
    error: null,
  });
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    return subscribeWallet(setState);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      await connectWallet();
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
  }, []);

  const shortAddress = state.address
    ? `${state.address.slice(0, 6)}...${state.address.slice(-4)}`
    : null;

  return {
    ...state,
    connecting,
    connect,
    disconnect,
    shortAddress,
  };
}
