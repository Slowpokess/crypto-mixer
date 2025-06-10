import { body, param, query, ValidationChain } from 'express-validator';
import { CurrencyType, MixRequestStatus, TransactionStatus } from '../types';

/**
 * Валидаторы для API запросов
 */

// === Валидаторы для Mix Request ===

export const validateCreateMixRequest: ValidationChain[] = [
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
    .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
  
  body('amount')
    .isFloat({ min: 0.001 })
    .withMessage('Amount must be a positive number >= 0.001'),
  
  body('outputAddresses')
    .isArray({ min: 1, max: 10 })
    .withMessage('Output addresses must be an array with 1-10 elements'),
  
  body('outputAddresses.*')
    .isString()
    .isLength({ min: 20, max: 100 })
    .withMessage('Each output address must be a valid string (20-100 characters)'),
  
  body('outputPercentages')
    .isArray()
    .withMessage('Output percentages must be an array'),
  
  body('outputPercentages.*')
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Each percentage must be between 0.1 and 100'),
  
  body('delayMinutes')
    .optional()
    .isInt({ min: 0, max: 1440 })
    .withMessage('Delay must be between 0 and 1440 minutes (24 hours)'),
  
  body('anonymityLevel')
    .optional()
    .isIn(['LOW', 'MEDIUM', 'HIGH'])
    .withMessage('Anonymity level must be LOW, MEDIUM, or HIGH'),
  
  body('mixingRounds')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Mixing rounds must be between 1 and 10')
];

export const validateUpdateMixRequestStatus: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('Mix request ID must be a valid UUID'),
  
  body('status')
    .isIn(['PENDING', 'DEPOSITED', 'POOLING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .withMessage('Status must be a valid mixing status'),
  
  body('errorMessage')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Error message must be a string (max 1000 characters)')
];

export const validateGetMixRequest: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('Mix request ID must be a valid UUID')
];

export const validateListMixRequests: ValidationChain[] = [
  query('currency')
    .optional()
    .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
    .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
  
  query('status')
    .optional()
    .isIn(['PENDING', 'DEPOSITED', 'POOLING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED'])
    .withMessage('Status must be a valid mixing status'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

// === Валидаторы для Wallet ===

export const validateCreateWallet: ValidationChain[] = [
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
    .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
  
  body('address')
    .isString()
    .isLength({ min: 20, max: 100 })
    .withMessage('Address must be a string (20-100 characters)'),
  
  body('type')
    .isIn(['HOT', 'COLD', 'MULTISIG', 'POOL'])
    .withMessage('Wallet type must be HOT, COLD, MULTISIG, or POOL'),
  
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Wallet name must be a string (1-100 characters)'),
  
  body('description')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Description must be a string (max 500 characters)')
];

export const validateUpdateWalletBalance: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('Wallet ID must be a valid UUID'),
  
  body('balance')
    .isFloat({ min: 0 })
    .withMessage('Balance must be a positive number or zero')
];

export const validateWalletAddress: ValidationChain[] = [
  param('address')
    .isString()
    .isLength({ min: 20, max: 100 })
    .withMessage('Address must be a string (20-100 characters)')
];

// === Валидаторы для Transaction Pool ===

export const validateCreateTransactionPool: ValidationChain[] = [
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
    .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
  
  body('name')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Pool name must be a string (1-100 characters)'),
  
  body('minAmount')
    .isFloat({ min: 0 })
    .withMessage('Minimum amount must be a positive number'),
  
  body('maxAmount')
    .isFloat({ min: 0 })
    .withMessage('Maximum amount must be a positive number'),
  
  body('targetAmount')
    .isFloat({ min: 0 })
    .withMessage('Target amount must be a positive number'),
  
  body('feePercentage')
    .isFloat({ min: 0, max: 10 })
    .withMessage('Fee percentage must be between 0 and 10'),
  
  body('maxParticipants')
    .isInt({ min: 1, max: 1000 })
    .withMessage('Max participants must be between 1 and 1000'),
  
  body('minParticipants')
    .isInt({ min: 1 })
    .withMessage('Min participants must be at least 1')
];

export const validateJoinPool: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('Pool ID must be a valid UUID'),
  
  body('amount')
    .isFloat({ min: 0.001 })
    .withMessage('Amount must be a positive number >= 0.001'),
  
  body('mixRequestId')
    .isUUID()
    .withMessage('Mix request ID must be a valid UUID')
];

// === Валидаторы для Output Transaction ===

export const validateCreateOutputTransaction: ValidationChain[] = [
  body('mixRequestId')
    .isUUID()
    .withMessage('Mix request ID must be a valid UUID'),
  
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
    .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
  
  body('amount')
    .isFloat({ min: 0.001 })
    .withMessage('Amount must be a positive number >= 0.001'),
  
  body('fee')
    .isFloat({ min: 0 })
    .withMessage('Fee must be a positive number or zero'),
  
  body('fromAddress')
    .isString()
    .isLength({ min: 20, max: 100 })
    .withMessage('From address must be a string (20-100 characters)'),
  
  body('toAddress')
    .isString()
    .isLength({ min: 20, max: 100 })
    .withMessage('To address must be a string (20-100 characters)'),
  
  body('delayMinutes')
    .isInt({ min: 0, max: 10080 })
    .withMessage('Delay must be between 0 and 10080 minutes (1 week)'),
  
  body('requiredConfirmations')
    .isInt({ min: 1, max: 100 })
    .withMessage('Required confirmations must be between 1 and 100')
];

export const validateUpdateOutputTransaction: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('Output transaction ID must be a valid UUID'),
  
  body('status')
    .optional()
    .isIn(['PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'])
    .withMessage('Status must be a valid transaction status'),
  
  body('txid')
    .optional()
    .isString()
    .isLength({ min: 10, max: 100 })
    .withMessage('Transaction ID must be a string (10-100 characters)'),
  
  body('confirmations')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Confirmations must be a non-negative integer'),
  
  body('blockHeight')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Block height must be a non-negative integer')
];

// === Валидаторы для Monitored Address ===

export const validateCreateMonitoredAddress: ValidationChain[] = [
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
    .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
  
  body('address')
    .isString()
    .isLength({ min: 20, max: 100 })
    .withMessage('Address must be a string (20-100 characters)'),
  
  body('type')
    .isIn(['DEPOSIT', 'WALLET', 'EXTERNAL', 'POOL'])
    .withMessage('Type must be DEPOSIT, WALLET, EXTERNAL, or POOL'),
  
  body('balanceChangeThreshold')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Balance change threshold must be a positive number'),
  
  body('checkIntervalMinutes')
    .optional()
    .isInt({ min: 1, max: 1440 })
    .withMessage('Check interval must be between 1 and 1440 minutes'),
  
  body('alertOnBalance')
    .optional()
    .isBoolean()
    .withMessage('Alert on balance must be a boolean'),
  
  body('alertOnTransactions')
    .optional()
    .isBoolean()
    .withMessage('Alert on transactions must be a boolean')
];

// === Валидаторы для System Config ===

export const validateCreateSystemConfig: ValidationChain[] = [
  body('key')
    .isString()
    .isLength({ min: 1, max: 100 })
    .isUppercase()
    .withMessage('Key must be an uppercase string (1-100 characters)'),
  
  body('value')
    .isString()
    .withMessage('Value must be a string'),
  
  body('type')
    .isIn(['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENCRYPTED'])
    .withMessage('Type must be STRING, NUMBER, BOOLEAN, JSON, or ENCRYPTED'),
  
  body('category')
    .isString()
    .isLength({ min: 1, max: 50 })
    .isUppercase()
    .withMessage('Category must be an uppercase string (1-50 characters)'),
  
  body('description')
    .optional()
    .isString()
    .isLength({ max: 1000 })
    .withMessage('Description must be a string (max 1000 characters)'),
  
  body('environment')
    .optional()
    .isIn(['DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'])
    .withMessage('Environment must be DEVELOPMENT, STAGING, PRODUCTION, or ALL')
];

export const validateUpdateSystemConfig: ValidationChain[] = [
  param('key')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Key must be a string (1-100 characters)'),
  
  body('value')
    .isString()
    .withMessage('Value must be a string'),
  
  body('lastModifiedBy')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Last modified by must be a string (max 100 characters)')
];

// === Общие валидаторы ===

export const validateUUID: ValidationChain[] = [
  param('id')
    .isUUID()
    .withMessage('ID must be a valid UUID')
];

export const validatePagination: ValidationChain[] = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

export const validateDateRange: ValidationChain[] = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
];

// === Кастомные валидаторы ===

export const validateCryptocurrencyAddress = (currency: CurrencyType) => {
  return body('address').custom((value: string) => {
    const validators: Record<CurrencyType, RegExp> = {
      BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/,
      USDT: /^0x[a-fA-F0-9]{40}$|^T[A-Za-z1-9]{33}$/,
      SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
      LTC: /^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$|^ltc1[a-z0-9]{39,59}$/, // Legacy, P2SH и bech32 адреса Litecoin
      DASH: /^X[a-km-zA-HJ-NP-Z1-9]{33}$/, // DASH адреса начинаются с X
      ZEC: /^t1[a-km-zA-HJ-NP-Z1-9]{33}$|^t3[a-km-zA-HJ-NP-Z1-9]{33}$|^zs1[a-z0-9]{75}$/ // t1 (P2PKH), t3 (P2SH), zs1 (Sapling shielded)
    };
    
    const pattern = validators[currency];
    if (pattern && !pattern.test(value)) {
      throw new Error(`Invalid ${currency} address format`);
    }
    
    return true;
  });
};

export const validateOutputPercentagesSum = body('outputPercentages').custom((percentages: number[]) => {
  if (!Array.isArray(percentages)) {
    throw new Error('Output percentages must be an array');
  }
  
  const sum = percentages.reduce((acc: number, curr: number) => acc + curr, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new Error('Output percentages must sum to 100%');
  }
  
  return true;
});

export const validatePoolAmountRange = [
  body().custom((body: any) => {
    const { minAmount, maxAmount, targetAmount } = body;
    
    if (minAmount >= maxAmount) {
      throw new Error('Minimum amount must be less than maximum amount');
    }
    
    if (targetAmount < maxAmount) {
      throw new Error('Target amount must be greater than or equal to maximum amount');
    }
    
    return true;
  })
];

export const validatePoolParticipantsRange = [
  body().custom((body: any) => {
    const { minParticipants, maxParticipants } = body;
    
    if (minParticipants >= maxParticipants) {
      throw new Error('Minimum participants must be less than maximum participants');
    }
    
    return true;
  })
];

// === Экспорт всех валидаторов ===

export default {
  // Mix Request validators
  validateCreateMixRequest,
  validateUpdateMixRequestStatus,
  validateGetMixRequest,
  validateListMixRequests,
  
  // Wallet validators
  validateCreateWallet,
  validateUpdateWalletBalance,
  validateWalletAddress,
  
  // Transaction Pool validators
  validateCreateTransactionPool,
  validateJoinPool,
  validatePoolAmountRange,
  validatePoolParticipantsRange,
  
  // Output Transaction validators
  validateCreateOutputTransaction,
  validateUpdateOutputTransaction,
  
  // Monitored Address validators
  validateCreateMonitoredAddress,
  
  // System Config validators
  validateCreateSystemConfig,
  validateUpdateSystemConfig,
  
  // Common validators
  validateUUID,
  validatePagination,
  validateDateRange,
  validateCryptocurrencyAddress,
  validateOutputPercentagesSum
};