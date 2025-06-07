import { Sequelize } from 'sequelize';

// Import model initialization functions
import { initMixRequest } from './MixRequest';
import { initWallet } from './Wallet';
import { initBlockchainTransaction } from './BlockchainTransaction';
import { initTransactionPool } from './TransactionPool';
import { initOutputTransaction } from './OutputTransaction';
import { initMonitoredAddress } from './MonitoredAddress';
import { initAuditLog } from './AuditLog';
import { initSystemConfig } from './SystemConfig';

// Import DepositAddress (has custom export format)
import DepositAddressInit from './DepositAddress';

// Import model classes for type exports
export { MixRequest } from './MixRequest';
export { Wallet } from './Wallet';
export { BlockchainTransaction } from './BlockchainTransaction';
export { TransactionPool } from './TransactionPool';
export { OutputTransaction } from './OutputTransaction';
export { MonitoredAddress } from './MonitoredAddress';
export { AuditLog } from './AuditLog';
export { SystemConfig } from './SystemConfig';
export { default as DepositAddress } from './DepositAddress';

// Export model attributes interfaces
export type { MixRequestAttributes, MixRequestCreationAttributes } from './MixRequest';
export type { WalletAttributes, WalletCreationAttributes } from './Wallet';
export type { BlockchainTransactionAttributes, BlockchainTransactionCreationAttributes } from './BlockchainTransaction';
export type { TransactionPoolAttributes, TransactionPoolCreationAttributes } from './TransactionPool';
export type { OutputTransactionAttributes, OutputTransactionCreationAttributes } from './OutputTransaction';
export type { MonitoredAddressAttributes, MonitoredAddressCreationAttributes } from './MonitoredAddress';
export type { AuditLogAttributes, AuditLogCreationAttributes } from './AuditLog';
export type { SystemConfigAttributes, SystemConfigCreationAttributes } from './SystemConfig';

let sequelize: Sequelize | null = null;
const models: { [key: string]: any } = {};

/**
 * Инициализация всех моделей базы данных
 * @param sequelizeInstance - экземпляр Sequelize
 * @returns объект с инициализированными моделями
 */
const initializeModels = async (sequelizeInstance: Sequelize): Promise<{ [key: string]: any }> => {
  if (sequelizeInstance) {
    sequelize = sequelizeInstance;
  }

  if (!sequelize) {
    throw new Error('Sequelize instance required. Pass it to initializeModels()');
  }

  try {
    console.log('🔄 Initializing database models...');

    // Инициализируем все модели
    models.MixRequest = initMixRequest(sequelize);
    models.Wallet = initWallet(sequelize);
    models.BlockchainTransaction = initBlockchainTransaction(sequelize);
    models.TransactionPool = initTransactionPool(sequelize);
    models.OutputTransaction = initOutputTransaction(sequelize);
    models.MonitoredAddress = initMonitoredAddress(sequelize);
    models.AuditLog = initAuditLog(sequelize);
    models.SystemConfig = initSystemConfig(sequelize);
    models.DepositAddress = DepositAddressInit(sequelize);

    // Устанавливаем ассоциации между моделями
    setupAssociations();

    models.sequelize = sequelize;
    models.Sequelize = Sequelize;

    console.log('✅ Database models initialized successfully');
    return models;

  } catch (error) {
    console.error('❌ Failed to initialize models:', error);
    throw error;
  }
};

/**
 * Настройка связей между моделями
 */
const setupAssociations = (): void => {
  const {
    MixRequest,
    Wallet,
    BlockchainTransaction,
    TransactionPool,
    OutputTransaction,
    DepositAddress,
    MonitoredAddress,
    AuditLog,
    SystemConfig
  } = models;

  // === MixRequest Associations ===
  
  // MixRequest -> DepositAddress (1:1)
  MixRequest.hasOne(DepositAddress, {
    foreignKey: 'mix_request_id',
    as: 'depositAddress',
    onDelete: 'CASCADE'
  });
  DepositAddress.belongsTo(MixRequest, {
    foreignKey: 'mix_request_id',
    as: 'mixRequest'
  });

  // MixRequest -> OutputTransaction (1:Many)
  MixRequest.hasMany(OutputTransaction, {
    foreignKey: 'mixRequestId',
    as: 'outputTransactions',
    onDelete: 'CASCADE'
  });
  OutputTransaction.belongsTo(MixRequest, {
    foreignKey: 'mixRequestId',
    as: 'mixRequest'
  });

  // MixRequest -> BlockchainTransaction (1:Many)
  MixRequest.hasMany(BlockchainTransaction, {
    foreignKey: 'mixRequestId',
    as: 'blockchainTransactions',
    onDelete: 'SET NULL'
  });
  BlockchainTransaction.belongsTo(MixRequest, {
    foreignKey: 'mixRequestId',
    as: 'mixRequest'
  });

  // MixRequest -> AuditLog (1:Many)
  MixRequest.hasMany(AuditLog, {
    foreignKey: 'mixRequestId',
    as: 'auditLogs',
    onDelete: 'SET NULL'
  });
  AuditLog.belongsTo(MixRequest, {
    foreignKey: 'mixRequestId',
    as: 'mixRequest'
  });

  // === BlockchainTransaction Associations ===
  
  // BlockchainTransaction -> OutputTransaction (1:1)
  BlockchainTransaction.hasOne(OutputTransaction, {
    foreignKey: 'blockchainTransactionId',
    as: 'outputTransaction',
    onDelete: 'SET NULL'
  });
  OutputTransaction.belongsTo(BlockchainTransaction, {
    foreignKey: 'blockchainTransactionId',
    as: 'blockchainTransaction'
  });

  // === MonitoredAddress Associations ===
  
  // MonitoredAddress -> DepositAddress (1:1) через address
  MonitoredAddress.belongsTo(DepositAddress, {
    foreignKey: 'address',
    targetKey: 'address',
    as: 'depositAddress'
  });
  DepositAddress.hasOne(MonitoredAddress, {
    foreignKey: 'address',
    sourceKey: 'address',
    as: 'monitoredAddress'
  });

  console.log('🔗 Database models associations have been set up successfully');
};

const getModels = (): { [key: string]: any } => {
  if (Object.keys(models).length === 0) {
      throw new Error('Models not initialized. Call initializeModels() first.');
  }
  return models;
};

const getModel = (modelName: string): any => {
  const model = models[modelName];
  if (!model) {
      throw new Error(`Model ${modelName} not found. Available models: ${Object.keys(models).join(', ')}`);
  }
  return model;
};

/**
 * Инициализация базовых данных системы
 * @param models - объект с инициализированными моделями
 */
const initializeSystemData = async (): Promise<void> => {
  try {
    // Инициализируем системные настройки по умолчанию
    await models.SystemConfig.initializeDefaults();

    // Создаем базовые пулы транзакций для каждой валюты
    await models.TransactionPool.createDefaultPools();

    console.log('✅ System data has been initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing system data:', error);
    throw error;
  }
};

/**
 * Проверка целостности базы данных
 */
const validateDatabaseIntegrity = async (): Promise<string[]> => {
  const issues: string[] = [];

  try {
    // Проверяем orphaned OutputTransaction записи
    const orphanedOutputs = await models.OutputTransaction.count({
      include: [{
        model: models.MixRequest,
        as: 'mixRequest',
        required: false
      }],
      where: {
        '$mixRequest.id$': null
      }
    });

    if (orphanedOutputs > 0) {
      issues.push(`Found ${orphanedOutputs} orphaned OutputTransaction records`);
    }

    // Проверяем orphaned DepositAddress записи
    const orphanedDeposits = await models.DepositAddress.count({
      include: [{
        model: models.MixRequest,
        as: 'mixRequest',
        required: false
      }],
      where: {
        '$mixRequest.id$': null
      }
    });

    if (orphanedDeposits > 0) {
      issues.push(`Found ${orphanedDeposits} orphaned DepositAddress records`);
    }

    // Проверяем inconsistent статусы
    const inconsistentMixRequests = await models.MixRequest.findAll({
      include: [{
        model: models.OutputTransaction,
        as: 'outputTransactions'
      }],
      where: {
        status: 'COMPLETED'
      }
    });

    for (const mixRequest of inconsistentMixRequests) {
      const hasUnconfirmedOutputs = mixRequest.outputTransactions.some(
        (tx: any) => tx.status !== 'CONFIRMED'
      );
      
      if (hasUnconfirmedOutputs) {
        issues.push(`MixRequest ${mixRequest.id} marked as COMPLETED but has unconfirmed outputs`);
      }
    }

    if (issues.length === 0) {
      console.log('✅ Database integrity check passed');
    } else {
      console.warn('⚠️ Database integrity issues found:', issues);
    }

    return issues;
  } catch (error) {
    console.error('❌ Error during database integrity check:', error);
    throw error;
  }
};

// Экспорт функций для использования в других модулях
export { initializeModels, getModels, getModel, initializeSystemData, validateDatabaseIntegrity };

export default {
  initializeModels,
  getModels,
  getModel,
  initializeSystemData,
  validateDatabaseIntegrity,
  ...models
};