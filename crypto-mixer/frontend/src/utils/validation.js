// Address validation utilities
export const validateAddress = (address, currency) => {
  if (!address || typeof address !== 'string') return false;
  
  const addressPatterns = {
    BTC: {
      legacy: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
      segwit: /^bc1[a-z0-9]{39,59}$/,
      testnet: /^[2mn][a-km-zA-HJ-NP-Z1-9]{25,34}$/
    },
    ETH: /^0x[a-fA-F0-9]{40}$/,
    USDT: /^0x[a-fA-F0-9]{40}$/, // USDT on Ethereum
    SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    LTC: {
      legacy: /^[LM][a-km-zA-HJ-NP-Z1-9]{26,33}$/,  // Legacy P2PKH starts with L
      p2sh: /^[M3][a-km-zA-HJ-NP-Z1-9]{26,33}$/,    // P2SH starts with M or 3
      bech32: /^ltc1[a-z0-9]{39,59}$/,              // Bech32 starts with ltc1
      testnet: /^[mn2][a-km-zA-HJ-NP-Z1-9]{26,33}$/ // Testnet
    },
    DASH: {
      mainnet: /^X[1-9A-HJ-NP-Za-km-z]{33}$/,       // Dash mainnet starts with X
      testnet: /^[y][a-km-zA-HJ-NP-Z1-9]{33}$/      // Dash testnet starts with y
    },
    ZEC: {
      transparent: /^t1[a-km-zA-HJ-NP-Z1-9]{33}$/,   // Transparent addresses start with t1
      multisig: /^t3[a-km-zA-HJ-NP-Z1-9]{33}$/,      // Multisig addresses start with t3
      sprout: /^zc[a-km-zA-HJ-NP-Z1-9]{93}$/,        // Sprout shielded addresses start with zc
      sapling: /^zs[a-km-zA-HJ-NP-Z1-9]{76}$/        // Sapling shielded addresses start with zs
    }
  };

  const patterns = addressPatterns[currency];
  if (!patterns) return false;

  if (typeof patterns === 'object') {
    // Bitcoin with multiple formats
    return Object.values(patterns).some(pattern => pattern.test(address));
  }
  
  return patterns.test(address);
};

export const validateAmount = (amount, currency, fees = {}) => {
  const numAmount = parseFloat(amount);
  
  if (isNaN(numAmount) || numAmount <= 0) {
    return { isValid: false, error: 'Amount must be greater than 0' };
  }

  const minAmount = fees[currency]?.minimum || 0;
  if (numAmount < minAmount) {
    return { 
      isValid: false, 
      error: `Minimum amount is ${minAmount} ${currency}` 
    };
  }

  const maxAmount = fees[currency]?.maximum || Infinity;
  if (numAmount > maxAmount) {
    return { 
      isValid: false, 
      error: `Maximum amount is ${maxAmount} ${currency}` 
    };
  }

  return { isValid: true };
};

export const validateOutputAddresses = (addresses, currency) => {
  const validAddresses = addresses.filter(addr => addr.trim() !== '');
  
  if (validAddresses.length === 0) {
    return { isValid: false, error: 'At least one output address is required' };
  }

  if (validAddresses.length > 10) {
    return { isValid: false, error: 'Maximum 10 output addresses allowed' };
  }

  // Check for duplicate addresses
  const uniqueAddresses = [...new Set(validAddresses)];
  if (uniqueAddresses.length !== validAddresses.length) {
    return { isValid: false, error: 'Duplicate addresses are not allowed' };
  }

  // Validate each address
  for (let i = 0; i < validAddresses.length; i++) {
    const address = validAddresses[i];
    if (!validateAddress(address, currency)) {
      return { 
        isValid: false, 
        error: `Invalid ${currency} address #${i + 1}` 
      };
    }
  }

  return { isValid: true };
};

export const validateDelay = (delay) => {
  const numDelay = parseInt(delay);
  
  if (isNaN(numDelay) || numDelay < 1 || numDelay > 72) {
    return { isValid: false, error: 'Delay must be between 1 and 72 hours' };
  }

  return { isValid: true };
};