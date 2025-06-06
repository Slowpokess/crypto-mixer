// Application constants
export const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USDT', 'SOL'];

export const CURRENCY_CONFIG = {
  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    minAmount: 0.001,
    maxAmount: 10,
    defaultFee: 1.5,
    confirmationsRequired: 6
  },
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 6,
    minAmount: 0.01,
    maxAmount: 100,
    defaultFee: 1.5,
    confirmationsRequired: 12
  },
  USDT: {
    name: 'Tether',
    symbol: 'USDT',
    decimals: 2,
    minAmount: 10,
    maxAmount: 50000,
    defaultFee: 2.0,
    confirmationsRequired: 12
  },
  SOL: {
    name: 'Solana',
    symbol: 'SOL',
    decimals: 6,
    minAmount: 0.1,
    maxAmount: 1000,
    defaultFee: 1.0,
    confirmationsRequired: 1
  }
};

export const MIX_STATUS = {
  PENDING: 'PENDING',
  DEPOSIT_RECEIVED: 'DEPOSIT_RECEIVED',
  PROCESSING: 'PROCESSING',
  MIXING: 'MIXING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED'
};

export const STATUS_MESSAGES = {
  [MIX_STATUS.PENDING]: 'Waiting for deposit',
  [MIX_STATUS.DEPOSIT_RECEIVED]: 'Deposit received, waiting for confirmations',
  [MIX_STATUS.PROCESSING]: 'Processing your mix request',
  [MIX_STATUS.MIXING]: 'Mixing in progress',
  [MIX_STATUS.COMPLETED]: 'Mixing completed successfully',
  [MIX_STATUS.FAILED]: 'Mixing failed',
  [MIX_STATUS.EXPIRED]: 'Mix request expired'
};

export const API_ENDPOINTS = {
  CREATE_MIX: '/mixer/create',
  GET_STATUS: '/mixer/status',
  GET_FEES: '/mixer/fees',
  HEALTH: '/health',
  CURRENCIES: '/currencies'
};

export const APP_CONFIG = {
  SESSION_STORAGE_KEY: 'cryptomixer_session',
  STATUS_CHECK_INTERVAL: 10000, // 10 seconds
  MAX_OUTPUT_ADDRESSES: 10,
  MIN_DELAY_HOURS: 1,
  MAX_DELAY_HOURS: 72,
  DEFAULT_DELAY_HOURS: 24
};

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  INVALID_AMOUNT: 'Please enter a valid amount',
  INVALID_ADDRESS: 'Invalid address format',
  INSUFFICIENT_BALANCE: 'Insufficient balance for this transaction',
  SESSION_EXPIRED: 'Session expired. Please start a new mix.',
  GENERIC_ERROR: 'An unexpected error occurred. Please try again.'
};