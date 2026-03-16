/**
 * Somnia Testnet Configuration
 * Chain ID: 50312 (Shannon Testnet)
 */

export const SOMNIA_TESTNET = {
  chainId: 50312,
  chainIdHex: '0xC498',
  name: 'Somnia Testnet',
  rpcUrl: 'https://dream-rpc.somnia.network',
  wsUrl: 'wss://dream-rpc.somnia.network',
  explorer: 'https://somnia-testnet.socialscan.io',
  currency: {
    name: 'Somnia Test Token',
    symbol: 'STT',
    decimals: 18,
  },
} as const;

export const CONTRACT_ADDRESSES = {
  ReactiveBettingPool: '0x19Dd500B5950BB9A20A3Bf8DA54F41f6D004A375',
  ReactiveSponsorship: '0xAf189D6bD0Ee1d4724847367A9a25a69f9834B6c',
  ReactiveMatchTimer: '0xEAB3270FC17A4df2d174D5e8bE8C14344880c509',
} as const;

// House fee: 7% (700 bps)
export const DEFAULT_HOUSE_FEE_BPS = 700;
