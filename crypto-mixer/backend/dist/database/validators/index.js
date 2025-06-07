"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePoolParticipantsRange = exports.validatePoolAmountRange = exports.validateOutputPercentagesSum = exports.validateCryptocurrencyAddress = exports.validateDateRange = exports.validatePagination = exports.validateUUID = exports.validateUpdateSystemConfig = exports.validateCreateSystemConfig = exports.validateCreateMonitoredAddress = exports.validateUpdateOutputTransaction = exports.validateCreateOutputTransaction = exports.validateJoinPool = exports.validateCreateTransactionPool = exports.validateWalletAddress = exports.validateUpdateWalletBalance = exports.validateCreateWallet = exports.validateListMixRequests = exports.validateGetMixRequest = exports.validateUpdateMixRequestStatus = exports.validateCreateMixRequest = void 0;
const express_validator_1 = require("express-validator");
/**
 * Валидаторы для API запросов
 */
// === Валидаторы для Mix Request ===
exports.validateCreateMixRequest = [
    (0, express_validator_1.body)('currency')
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    (0, express_validator_1.body)('amount')
        .isFloat({ min: 0.001 })
        .withMessage('Amount must be a positive number >= 0.001'),
    (0, express_validator_1.body)('outputAddresses')
        .isArray({ min: 1, max: 10 })
        .withMessage('Output addresses must be an array with 1-10 elements'),
    (0, express_validator_1.body)('outputAddresses.*')
        .isString()
        .isLength({ min: 20, max: 100 })
        .withMessage('Each output address must be a valid string (20-100 characters)'),
    (0, express_validator_1.body)('outputPercentages')
        .isArray()
        .withMessage('Output percentages must be an array'),
    (0, express_validator_1.body)('outputPercentages.*')
        .isFloat({ min: 0.1, max: 100 })
        .withMessage('Each percentage must be between 0.1 and 100'),
    (0, express_validator_1.body)('delayMinutes')
        .optional()
        .isInt({ min: 0, max: 1440 })
        .withMessage('Delay must be between 0 and 1440 minutes (24 hours)'),
    (0, express_validator_1.body)('anonymityLevel')
        .optional()
        .isIn(['LOW', 'MEDIUM', 'HIGH'])
        .withMessage('Anonymity level must be LOW, MEDIUM, or HIGH'),
    (0, express_validator_1.body)('mixingRounds')
        .optional()
        .isInt({ min: 1, max: 10 })
        .withMessage('Mixing rounds must be between 1 and 10')
];
exports.validateUpdateMixRequestStatus = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Mix request ID must be a valid UUID'),
    (0, express_validator_1.body)('status')
        .isIn(['PENDING', 'DEPOSITED', 'POOLING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED'])
        .withMessage('Status must be a valid mixing status'),
    (0, express_validator_1.body)('errorMessage')
        .optional()
        .isString()
        .isLength({ max: 1000 })
        .withMessage('Error message must be a string (max 1000 characters)')
];
exports.validateGetMixRequest = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Mix request ID must be a valid UUID')
];
exports.validateListMixRequests = [
    (0, express_validator_1.query)('currency')
        .optional()
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    (0, express_validator_1.query)('status')
        .optional()
        .isIn(['PENDING', 'DEPOSITED', 'POOLING', 'MIXING', 'COMPLETED', 'FAILED', 'CANCELLED'])
        .withMessage('Status must be a valid mixing status'),
    (0, express_validator_1.query)('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    (0, express_validator_1.query)('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    (0, express_validator_1.query)('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
];
// === Валидаторы для Wallet ===
exports.validateCreateWallet = [
    (0, express_validator_1.body)('currency')
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    (0, express_validator_1.body)('address')
        .isString()
        .isLength({ min: 20, max: 100 })
        .withMessage('Address must be a string (20-100 characters)'),
    (0, express_validator_1.body)('type')
        .isIn(['HOT', 'COLD', 'MULTISIG', 'POOL'])
        .withMessage('Wallet type must be HOT, COLD, MULTISIG, or POOL'),
    (0, express_validator_1.body)('name')
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('Wallet name must be a string (1-100 characters)'),
    (0, express_validator_1.body)('description')
        .optional()
        .isString()
        .isLength({ max: 500 })
        .withMessage('Description must be a string (max 500 characters)')
];
exports.validateUpdateWalletBalance = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Wallet ID must be a valid UUID'),
    (0, express_validator_1.body)('balance')
        .isFloat({ min: 0 })
        .withMessage('Balance must be a positive number or zero')
];
exports.validateWalletAddress = [
    (0, express_validator_1.param)('address')
        .isString()
        .isLength({ min: 20, max: 100 })
        .withMessage('Address must be a string (20-100 characters)')
];
// === Валидаторы для Transaction Pool ===
exports.validateCreateTransactionPool = [
    (0, express_validator_1.body)('currency')
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    (0, express_validator_1.body)('name')
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('Pool name must be a string (1-100 characters)'),
    (0, express_validator_1.body)('minAmount')
        .isFloat({ min: 0 })
        .withMessage('Minimum amount must be a positive number'),
    (0, express_validator_1.body)('maxAmount')
        .isFloat({ min: 0 })
        .withMessage('Maximum amount must be a positive number'),
    (0, express_validator_1.body)('targetAmount')
        .isFloat({ min: 0 })
        .withMessage('Target amount must be a positive number'),
    (0, express_validator_1.body)('feePercentage')
        .isFloat({ min: 0, max: 10 })
        .withMessage('Fee percentage must be between 0 and 10'),
    (0, express_validator_1.body)('maxParticipants')
        .isInt({ min: 1, max: 1000 })
        .withMessage('Max participants must be between 1 and 1000'),
    (0, express_validator_1.body)('minParticipants')
        .isInt({ min: 1 })
        .withMessage('Min participants must be at least 1')
];
exports.validateJoinPool = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Pool ID must be a valid UUID'),
    (0, express_validator_1.body)('amount')
        .isFloat({ min: 0.001 })
        .withMessage('Amount must be a positive number >= 0.001'),
    (0, express_validator_1.body)('mixRequestId')
        .isUUID()
        .withMessage('Mix request ID must be a valid UUID')
];
// === Валидаторы для Output Transaction ===
exports.validateCreateOutputTransaction = [
    (0, express_validator_1.body)('mixRequestId')
        .isUUID()
        .withMessage('Mix request ID must be a valid UUID'),
    (0, express_validator_1.body)('currency')
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    (0, express_validator_1.body)('amount')
        .isFloat({ min: 0.001 })
        .withMessage('Amount must be a positive number >= 0.001'),
    (0, express_validator_1.body)('fee')
        .isFloat({ min: 0 })
        .withMessage('Fee must be a positive number or zero'),
    (0, express_validator_1.body)('fromAddress')
        .isString()
        .isLength({ min: 20, max: 100 })
        .withMessage('From address must be a string (20-100 characters)'),
    (0, express_validator_1.body)('toAddress')
        .isString()
        .isLength({ min: 20, max: 100 })
        .withMessage('To address must be a string (20-100 characters)'),
    (0, express_validator_1.body)('delayMinutes')
        .isInt({ min: 0, max: 10080 })
        .withMessage('Delay must be between 0 and 10080 minutes (1 week)'),
    (0, express_validator_1.body)('requiredConfirmations')
        .isInt({ min: 1, max: 100 })
        .withMessage('Required confirmations must be between 1 and 100')
];
exports.validateUpdateOutputTransaction = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Output transaction ID must be a valid UUID'),
    (0, express_validator_1.body)('status')
        .optional()
        .isIn(['PENDING', 'CONFIRMED', 'FAILED', 'BROADCASTING', 'MEMPOOL'])
        .withMessage('Status must be a valid transaction status'),
    (0, express_validator_1.body)('txid')
        .optional()
        .isString()
        .isLength({ min: 10, max: 100 })
        .withMessage('Transaction ID must be a string (10-100 characters)'),
    (0, express_validator_1.body)('confirmations')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Confirmations must be a non-negative integer'),
    (0, express_validator_1.body)('blockHeight')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Block height must be a non-negative integer')
];
// === Валидаторы для Monitored Address ===
exports.validateCreateMonitoredAddress = [
    (0, express_validator_1.body)('currency')
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    (0, express_validator_1.body)('address')
        .isString()
        .isLength({ min: 20, max: 100 })
        .withMessage('Address must be a string (20-100 characters)'),
    (0, express_validator_1.body)('type')
        .isIn(['DEPOSIT', 'WALLET', 'EXTERNAL', 'POOL'])
        .withMessage('Type must be DEPOSIT, WALLET, EXTERNAL, or POOL'),
    (0, express_validator_1.body)('balanceChangeThreshold')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Balance change threshold must be a positive number'),
    (0, express_validator_1.body)('checkIntervalMinutes')
        .optional()
        .isInt({ min: 1, max: 1440 })
        .withMessage('Check interval must be between 1 and 1440 minutes'),
    (0, express_validator_1.body)('alertOnBalance')
        .optional()
        .isBoolean()
        .withMessage('Alert on balance must be a boolean'),
    (0, express_validator_1.body)('alertOnTransactions')
        .optional()
        .isBoolean()
        .withMessage('Alert on transactions must be a boolean')
];
// === Валидаторы для System Config ===
exports.validateCreateSystemConfig = [
    (0, express_validator_1.body)('key')
        .isString()
        .isLength({ min: 1, max: 100 })
        .isUppercase()
        .withMessage('Key must be an uppercase string (1-100 characters)'),
    (0, express_validator_1.body)('value')
        .isString()
        .withMessage('Value must be a string'),
    (0, express_validator_1.body)('type')
        .isIn(['STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENCRYPTED'])
        .withMessage('Type must be STRING, NUMBER, BOOLEAN, JSON, or ENCRYPTED'),
    (0, express_validator_1.body)('category')
        .isString()
        .isLength({ min: 1, max: 50 })
        .isUppercase()
        .withMessage('Category must be an uppercase string (1-50 characters)'),
    (0, express_validator_1.body)('description')
        .optional()
        .isString()
        .isLength({ max: 1000 })
        .withMessage('Description must be a string (max 1000 characters)'),
    (0, express_validator_1.body)('environment')
        .optional()
        .isIn(['DEVELOPMENT', 'STAGING', 'PRODUCTION', 'ALL'])
        .withMessage('Environment must be DEVELOPMENT, STAGING, PRODUCTION, or ALL')
];
exports.validateUpdateSystemConfig = [
    (0, express_validator_1.param)('key')
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('Key must be a string (1-100 characters)'),
    (0, express_validator_1.body)('value')
        .isString()
        .withMessage('Value must be a string'),
    (0, express_validator_1.body)('lastModifiedBy')
        .optional()
        .isString()
        .isLength({ max: 100 })
        .withMessage('Last modified by must be a string (max 100 characters)')
];
// === Общие валидаторы ===
exports.validateUUID = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('ID must be a valid UUID')
];
exports.validatePagination = [
    (0, express_validator_1.query)('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100')
];
exports.validateDateRange = [
    (0, express_validator_1.query)('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    (0, express_validator_1.query)('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
];
// === Кастомные валидаторы ===
const validateCryptocurrencyAddress = (currency) => {
    return (0, express_validator_1.body)('address').custom((value) => {
        const validators = {
            BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
            ETH: /^0x[a-fA-F0-9]{40}$/,
            USDT: /^0x[a-fA-F0-9]{40}$|^T[A-Za-z1-9]{33}$/,
            SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
        };
        const pattern = validators[currency];
        if (pattern && !pattern.test(value)) {
            throw new Error(`Invalid ${currency} address format`);
        }
        return true;
    });
};
exports.validateCryptocurrencyAddress = validateCryptocurrencyAddress;
exports.validateOutputPercentagesSum = (0, express_validator_1.body)('outputPercentages').custom((percentages) => {
    if (!Array.isArray(percentages)) {
        throw new Error('Output percentages must be an array');
    }
    const sum = percentages.reduce((acc, curr) => acc + curr, 0);
    if (Math.abs(sum - 100) > 0.01) {
        throw new Error('Output percentages must sum to 100%');
    }
    return true;
});
exports.validatePoolAmountRange = [
    (0, express_validator_1.body)().custom((body) => {
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
exports.validatePoolParticipantsRange = [
    (0, express_validator_1.body)().custom((body) => {
        const { minParticipants, maxParticipants } = body;
        if (minParticipants >= maxParticipants) {
            throw new Error('Minimum participants must be less than maximum participants');
        }
        return true;
    })
];
// === Экспорт всех валидаторов ===
exports.default = {
    // Mix Request validators
    validateCreateMixRequest: exports.validateCreateMixRequest,
    validateUpdateMixRequestStatus: exports.validateUpdateMixRequestStatus,
    validateGetMixRequest: exports.validateGetMixRequest,
    validateListMixRequests: exports.validateListMixRequests,
    // Wallet validators
    validateCreateWallet: exports.validateCreateWallet,
    validateUpdateWalletBalance: exports.validateUpdateWalletBalance,
    validateWalletAddress: exports.validateWalletAddress,
    // Transaction Pool validators
    validateCreateTransactionPool: exports.validateCreateTransactionPool,
    validateJoinPool: exports.validateJoinPool,
    validatePoolAmountRange: exports.validatePoolAmountRange,
    validatePoolParticipantsRange: exports.validatePoolParticipantsRange,
    // Output Transaction validators
    validateCreateOutputTransaction: exports.validateCreateOutputTransaction,
    validateUpdateOutputTransaction: exports.validateUpdateOutputTransaction,
    // Monitored Address validators
    validateCreateMonitoredAddress: exports.validateCreateMonitoredAddress,
    // System Config validators
    validateCreateSystemConfig: exports.validateCreateSystemConfig,
    validateUpdateSystemConfig: exports.validateUpdateSystemConfig,
    // Common validators
    validateUUID: exports.validateUUID,
    validatePagination: exports.validatePagination,
    validateDateRange: exports.validateDateRange,
    validateCryptocurrencyAddress: exports.validateCryptocurrencyAddress,
    validateOutputPercentagesSum: exports.validateOutputPercentagesSum
};
//# sourceMappingURL=index.js.map