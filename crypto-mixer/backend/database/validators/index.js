const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');

const validationMiddleware = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const mixRequestValidation = [
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'XMR', 'LTC', 'BCH'])
    .withMessage('Invalid currency'),
  
  body('inputAmount')
    .isFloat({ min: 0.001 })
    .withMessage('Input amount must be greater than 0.001'),
  
  body('inputAddress')
    .isLength({ min: 26, max: 62 })
    .withMessage('Invalid input address format'),
  
  body('outputAddresses')
    .isArray({ min: 1, max: 5 })
    .withMessage('Must provide 1-5 output addresses'),
  
  body('outputAddresses.*.address')
    .isLength({ min: 26, max: 62 })
    .withMessage('Invalid output address format'),
  
  body('outputAddresses.*.percentage')
    .isFloat({ min: 1, max: 100 })
    .withMessage('Percentage must be between 1 and 100'),
  
  body('mixingStrength')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Invalid mixing strength'),
  
  body('delayHours')
    .optional()
    .isInt({ min: 0, max: 168 })
    .withMessage('Delay must be between 0 and 168 hours')
];

const walletValidation = [
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'XMR', 'LTC', 'BCH'])
    .withMessage('Invalid currency'),
  
  body('address')
    .isLength({ min: 26, max: 62 })
    .withMessage('Invalid wallet address format'),
  
  body('privateKey')
    .isLength({ min: 51, max: 52 })
    .withMessage('Invalid private key format'),
  
  body('balance')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Balance must be non-negative'),
  
  body('type')
    .isIn(['hot', 'cold', 'mixing'])
    .withMessage('Invalid wallet type')
];

const addressValidation = [
  body('address')
    .isLength({ min: 26, max: 62 })
    .withMessage('Invalid address format'),
  
  body('currency')
    .isIn(['BTC', 'ETH', 'USDT', 'XMR', 'LTC', 'BCH'])
    .withMessage('Invalid currency'),
  
  body('isUsed')
    .optional()
    .isBoolean()
    .withMessage('isUsed must be boolean')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'updatedAt', 'amount', 'status'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC'])
    .withMessage('Sort order must be ASC or DESC')
];

const idValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid ID format')
];

module.exports = {
  validationMiddleware,
  mixRequestValidation,
  walletValidation,
  addressValidation,
  paginationValidation,
  idValidation
};