"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeInput = exports.validateDepositAddress = exports.validateSessionId = exports.validateCreateMixRequest = exports.handleValidationErrors = void 0;
const express_validator_1 = require("express-validator");
const handleValidationErrors = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            error: 'Validation failed',
            details: errors.array()
        });
        return;
    }
    next();
};
exports.handleValidationErrors = handleValidationErrors;
exports.validateCreateMixRequest = [
    (0, express_validator_1.body)('currency')
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    (0, express_validator_1.body)('amount')
        .isFloat({ min: 0.000001 })
        .withMessage('Amount must be a positive number')
        .custom((value, { req }) => {
        const currency = req.body?.currency;
        const limits = {
            BTC: { min: 0.001, max: 10 },
            ETH: { min: 0.01, max: 100 },
            USDT: { min: 100, max: 1000000 },
            SOL: { min: 1, max: 10000 }
        };
        if (currency && limits[currency]) {
            const { min, max } = limits[currency];
            if (value < min || value > max) {
                throw new Error(`Amount must be between ${min} and ${max} ${currency}`);
            }
        }
        return true;
    }),
    (0, express_validator_1.body)('outputAddresses')
        .isArray({ min: 1, max: 10 })
        .withMessage('Output addresses must be an array with 1-10 addresses'),
    (0, express_validator_1.body)('outputAddresses.*.address')
        .isString()
        .isLength({ min: 26, max: 64 })
        .withMessage('Address must be a valid cryptocurrency address')
        .custom((value, { req }) => {
        const currency = req.body?.currency;
        // Basic address format validation
        const addressPatterns = {
            BTC: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
            ETH: /^0x[a-fA-F0-9]{40}$/,
            USDT: /^0x[a-fA-F0-9]{40}$/,
            SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
        };
        if (currency && addressPatterns[currency] && !addressPatterns[currency].test(value)) {
            throw new Error(`Invalid ${currency} address format`);
        }
        return true;
    }),
    (0, express_validator_1.body)('outputAddresses.*.percentage')
        .isFloat({ min: 0.01, max: 100 })
        .withMessage('Percentage must be between 0.01 and 100'),
    (0, express_validator_1.body)('outputAddresses')
        .custom((addresses) => {
        const totalPercentage = addresses.reduce((sum, addr) => sum + addr.percentage, 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
            throw new Error('Output address percentages must sum to 100%');
        }
        return true;
    }),
    (0, express_validator_1.body)('delay')
        .optional()
        .isInt({ min: 1, max: 72 })
        .withMessage('Delay must be between 1 and 72 hours'),
    exports.handleValidationErrors
];
exports.validateSessionId = [
    (0, express_validator_1.param)('sessionId')
        .isUUID(4)
        .withMessage('Session ID must be a valid UUID'),
    exports.handleValidationErrors
];
exports.validateDepositAddress = [
    (0, express_validator_1.body)('currency')
        .isIn(['BTC', 'ETH', 'USDT', 'SOL'])
        .withMessage('Currency must be one of: BTC, ETH, USDT, SOL'),
    exports.handleValidationErrors
];
const sanitizeInput = (req, res, next) => {
    // Remove potentially dangerous characters from string inputs
    const sanitizeString = (str) => {
        return str.replace(/[<>'"&]/g, '');
    };
    const sanitizeObject = (obj) => {
        if (typeof obj === 'string') {
            return sanitizeString(obj);
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitizeObject);
        }
        if (obj && typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = sanitizeObject(value);
            }
            return sanitized;
        }
        return obj;
    };
    if (req.body) {
        req.body = sanitizeObject(req.body);
    }
    if (req.query) {
        req.query = sanitizeObject(req.query);
    }
    if (req.params) {
        req.params = sanitizeObject(req.params);
    }
    next();
};
exports.sanitizeInput = sanitizeInput;
//# sourceMappingURL=validation.js.map