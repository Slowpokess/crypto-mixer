const { Sequelize } = require('sequelize');
const logger = require('../../utils/logger');

let sequelize = null;
const models = {};

const initializeModels = async (sequelizeInstance) => {
  if (sequelizeInstance) {
    sequelize = sequelizeInstance;
  }

  if (!sequelize) {
    throw new Error('Sequelize instance required. Pass it to initializeModels()');
  }

  try {
    logger.info('Initializing database models...');

    models.MixRequest = require('./MixRequest')(sequelize, Sequelize.DataTypes);
    models.Wallet = require('./Wallet')(sequelize, Sequelize.DataTypes);
    models.DepositAddress = require('./DepositAddress')(sequelize, Sequelize.DataTypes);
    models.OutputTransaction = require('./OutputTransaction')(sequelize, Sequelize.DataTypes);
    models.TransactionPool = require('./TransactionPool')(sequelize, Sequelize.DataTypes);
    models.BlockchainTransaction = require('./BlockchainTransaction')(sequelize, Sequelize.DataTypes);
    models.MonitoredAddress = require('./MonitoredAddress')(sequelize, Sequelize.DataTypes);
    models.AuditLog = require('./AuditLog')(sequelize, Sequelize.DataTypes);
    models.SystemConfig = require('./SystemConfig')(sequelize, Sequelize.DataTypes);

    setupAssociations();

    models.sequelize = sequelize;
    models.Sequelize = Sequelize;

    logger.info('Database models initialized successfully');
    return models;

  } catch (error) {
    logger.error('Failed to initialize models:', error);
    throw error;
  }
};

const setupAssociations = () => {
  const { 
    MixRequest, 
    Wallet, 
    DepositAddress, 
    OutputTransaction, 
    TransactionPool, 
    BlockchainTransaction, 
    MonitoredAddress, 
    AuditLog 
  } = models;

  MixRequest.hasMany(OutputTransaction, {
    foreignKey: 'mix_request_id',
    as: 'outputTransactions'
  });
  OutputTransaction.belongsTo(MixRequest, {
    foreignKey: 'mix_request_id',
    as: 'mixRequest'
  });

  MixRequest.hasMany(DepositAddress, {
    foreignKey: 'mix_request_id',
    as: 'depositAddresses'
  });
  DepositAddress.belongsTo(MixRequest, {
    foreignKey: 'mix_request_id',
    as: 'mixRequest'
  });

  MixRequest.hasMany(TransactionPool, {
    foreignKey: 'mix_request_id',
    as: 'poolTransactions'
  });
  TransactionPool.belongsTo(MixRequest, {
    foreignKey: 'mix_request_id',
    as: 'mixRequest'
  });

  Wallet.hasMany(BlockchainTransaction, {
    foreignKey: 'wallet_id',
    as: 'transactions'
  });
  BlockchainTransaction.belongsTo(Wallet, {
    foreignKey: 'wallet_id',
    as: 'wallet'
  });

  Wallet.hasMany(MonitoredAddress, {
    foreignKey: 'wallet_id',
    as: 'monitoredAddresses'
  });
  MonitoredAddress.belongsTo(Wallet, {
    foreignKey: 'wallet_id',
    as: 'wallet'
  });

  MixRequest.hasMany(AuditLog, {
    foreignKey: 'related_id',
    constraints: false,
    scope: {
      entity_type: 'mix_request'
    },
    as: 'auditLogs'
  });

  Wallet.hasMany(AuditLog, {
    foreignKey: 'related_id',
    constraints: false,
    scope: {
      entity_type: 'wallet'
    },
    as: 'auditLogs'
  });

  logger.info('Model associations configured');
};

const getModels = () => {
  if (Object.keys(models).length === 0) {
    throw new Error('Models not initialized. Call initializeModels() first.');
  }
  return models;
};

const getModel = (modelName) => {
  const model = models[modelName];
  if (!model) {
    throw new Error(`Model ${modelName} not found. Available models: ${Object.keys(models).join(', ')}`);
  }
  return model;
};

module.exports = {
  initializeModels,
  getModels,
  getModel,
  ...models
};