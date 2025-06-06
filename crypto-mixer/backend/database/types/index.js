const CURRENCIES = ['BTC', 'ETH', 'USDT', 'XMR', 'LTC', 'BCH'];

const MIX_STATUSES = [
  'pending',
  'processing', 
  'mixing',
  'completed',
  'failed',
  'expired',
  'cancelled'
];

const WALLET_TYPES = ['hot', 'cold', 'mixing'];

const WALLET_STATUSES = ['active', 'inactive', 'maintenance'];

const MIXING_STRENGTHS = ['low', 'medium', 'high'];

const TRANSACTION_TYPES = [
  'deposit',
  'withdrawal', 
  'mixing',
  'fee',
  'refund'
];

const TRANSACTION_STATUSES = [
  'pending',
  'confirmed',
  'failed',
  'rejected'
];

const validateCurrency = (currency) => {
  return CURRENCIES.includes(currency);
};

const validateMixStatus = (status) => {
  return MIX_STATUSES.includes(status);
};

const validateWalletType = (type) => {
  return WALLET_TYPES.includes(type);
};

const validateAmount = (amount) => {
  return typeof amount === 'number' && amount > 0 && Number.isFinite(amount);
};

const validateAddress = (address, currency) => {
  if (!address || typeof address !== 'string') {
    return false;
  }

  const patterns = {
    BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
    ETH: /^0x[a-fA-F0-9]{40}$/,
    USDT: /^0x[a-fA-F0-9]{40}$|^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    XMR: /^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$/,
    LTC: /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$|^ltc1[a-z0-9]{39,59}$/,
    BCH: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^q[a-z0-9]{41}$/
  };

  return patterns[currency] ? patterns[currency].test(address) : false;
};

const validatePercentages = (outputAddresses) => {
  if (!Array.isArray(outputAddresses) || outputAddresses.length === 0) {
    return false;
  }

  const totalPercentage = outputAddresses.reduce((sum, output) => {
    return sum + (output.percentage || 0);
  }, 0);

  return Math.abs(totalPercentage - 100) < 0.01;
};

const formatAmount = (amount, decimals = 8) => {
  return parseFloat(amount.toFixed(decimals));
};

const calculateFee = (amount, feePercentage = 0.5) => {
  const fee = amount * (feePercentage / 100);
  return formatAmount(fee);
};

const generateMixingMetadata = (strength = 'medium') => {
  const configs = {
    low: {
      rounds: 1,
      delay: { min: 5, max: 30 },
      poolSize: { min: 3, max: 7 }
    },
    medium: {
      rounds: 2,
      delay: { min: 15, max: 60 },
      poolSize: { min: 5, max: 12 }
    },
    high: {
      rounds: 3,
      delay: { min: 30, max: 120 },
      poolSize: { min: 8, max: 20 }
    }
  };

  return configs[strength] || configs.medium;
};

const sanitizeData = (data) => {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = value.trim();
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

module.exports = {
  CURRENCIES,
  MIX_STATUSES,
  WALLET_TYPES,
  WALLET_STATUSES,
  MIXING_STRENGTHS,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES,
  validateCurrency,
  validateMixStatus,
  validateWalletType,
  validateAmount,
  validateAddress,
  validatePercentages,
  formatAmount,
  calculateFee,
  generateMixingMetadata,
  sanitizeData
};