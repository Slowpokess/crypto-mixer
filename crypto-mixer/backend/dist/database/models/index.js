"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDatabaseIntegrity = exports.initializeSystemData = exports.getModel = exports.getModels = exports.initializeModels = exports.DepositAddress = exports.SystemConfig = exports.AuditLog = exports.MonitoredAddress = exports.OutputTransaction = exports.TransactionPool = exports.BlockchainTransaction = exports.Wallet = exports.MixRequest = void 0;
const sequelize_1 = require("sequelize");
// Import model initialization functions
const MixRequest_1 = require("./MixRequest");
const Wallet_1 = require("./Wallet");
const BlockchainTransaction_1 = require("./BlockchainTransaction");
const TransactionPool_1 = require("./TransactionPool");
const OutputTransaction_1 = require("./OutputTransaction");
const MonitoredAddress_1 = require("./MonitoredAddress");
const AuditLog_1 = require("./AuditLog");
const SystemConfig_1 = require("./SystemConfig");
// Import DepositAddress (has custom export format)
const DepositAddress_1 = __importDefault(require("./DepositAddress"));
// Import model classes for type exports
var MixRequest_2 = require("./MixRequest");
Object.defineProperty(exports, "MixRequest", { enumerable: true, get: function () { return MixRequest_2.MixRequest; } });
var Wallet_2 = require("./Wallet");
Object.defineProperty(exports, "Wallet", { enumerable: true, get: function () { return Wallet_2.Wallet; } });
var BlockchainTransaction_2 = require("./BlockchainTransaction");
Object.defineProperty(exports, "BlockchainTransaction", { enumerable: true, get: function () { return BlockchainTransaction_2.BlockchainTransaction; } });
var TransactionPool_2 = require("./TransactionPool");
Object.defineProperty(exports, "TransactionPool", { enumerable: true, get: function () { return TransactionPool_2.TransactionPool; } });
var OutputTransaction_2 = require("./OutputTransaction");
Object.defineProperty(exports, "OutputTransaction", { enumerable: true, get: function () { return OutputTransaction_2.OutputTransaction; } });
var MonitoredAddress_2 = require("./MonitoredAddress");
Object.defineProperty(exports, "MonitoredAddress", { enumerable: true, get: function () { return MonitoredAddress_2.MonitoredAddress; } });
var AuditLog_2 = require("./AuditLog");
Object.defineProperty(exports, "AuditLog", { enumerable: true, get: function () { return AuditLog_2.AuditLog; } });
var SystemConfig_2 = require("./SystemConfig");
Object.defineProperty(exports, "SystemConfig", { enumerable: true, get: function () { return SystemConfig_2.SystemConfig; } });
var DepositAddress_2 = require("./DepositAddress");
Object.defineProperty(exports, "DepositAddress", { enumerable: true, get: function () { return __importDefault(DepositAddress_2).default; } });
let sequelize = null;
const models = {};
/**
 * Инициализация всех моделей базы данных
 * @param sequelizeInstance - экземпляр Sequelize
 * @returns объект с инициализированными моделями
 */
const initializeModels = async (sequelizeInstance) => {
    if (sequelizeInstance) {
        sequelize = sequelizeInstance;
    }
    if (!sequelize) {
        throw new Error('Sequelize instance required. Pass it to initializeModels()');
    }
    try {
        console.log('🔄 Initializing database models...');
        // Инициализируем все модели
        models.MixRequest = (0, MixRequest_1.initMixRequest)(sequelize);
        models.Wallet = (0, Wallet_1.initWallet)(sequelize);
        models.BlockchainTransaction = (0, BlockchainTransaction_1.initBlockchainTransaction)(sequelize);
        models.TransactionPool = (0, TransactionPool_1.initTransactionPool)(sequelize);
        models.OutputTransaction = (0, OutputTransaction_1.initOutputTransaction)(sequelize);
        models.MonitoredAddress = (0, MonitoredAddress_1.initMonitoredAddress)(sequelize);
        models.AuditLog = (0, AuditLog_1.initAuditLog)(sequelize);
        models.SystemConfig = (0, SystemConfig_1.initSystemConfig)(sequelize);
        models.DepositAddress = (0, DepositAddress_1.default)(sequelize);
        // Устанавливаем ассоциации между моделями
        setupAssociations();
        models.sequelize = sequelize;
        models.Sequelize = sequelize_1.Sequelize;
        console.log('✅ Database models initialized successfully');
        return models;
    }
    catch (error) {
        console.error('❌ Failed to initialize models:', error);
        throw error;
    }
};
exports.initializeModels = initializeModels;
/**
 * Настройка связей между моделями
 */
const setupAssociations = () => {
    const { MixRequest, Wallet, BlockchainTransaction, TransactionPool, OutputTransaction, DepositAddress, MonitoredAddress, AuditLog, SystemConfig } = models;
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
const getModels = () => {
    if (Object.keys(models).length === 0) {
        throw new Error('Models not initialized. Call initializeModels() first.');
    }
    return models;
};
exports.getModels = getModels;
const getModel = (modelName) => {
    const model = models[modelName];
    if (!model) {
        throw new Error(`Model ${modelName} not found. Available models: ${Object.keys(models).join(', ')}`);
    }
    return model;
};
exports.getModel = getModel;
/**
 * Инициализация базовых данных системы
 * @param models - объект с инициализированными моделями
 */
const initializeSystemData = async () => {
    try {
        // Инициализируем системные настройки по умолчанию
        await models.SystemConfig.initializeDefaults();
        // Создаем базовые пулы транзакций для каждой валюты
        await models.TransactionPool.createDefaultPools();
        console.log('✅ System data has been initialized successfully');
    }
    catch (error) {
        console.error('❌ Error initializing system data:', error);
        throw error;
    }
};
exports.initializeSystemData = initializeSystemData;
/**
 * Проверка целостности базы данных
 */
const validateDatabaseIntegrity = async () => {
    const issues = [];
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
            const hasUnconfirmedOutputs = mixRequest.outputTransactions.some((tx) => tx.status !== 'CONFIRMED');
            if (hasUnconfirmedOutputs) {
                issues.push(`MixRequest ${mixRequest.id} marked as COMPLETED but has unconfirmed outputs`);
            }
        }
        if (issues.length === 0) {
            console.log('✅ Database integrity check passed');
        }
        else {
            console.warn('⚠️ Database integrity issues found:', issues);
        }
        return issues;
    }
    catch (error) {
        console.error('❌ Error during database integrity check:', error);
        throw error;
    }
};
exports.validateDatabaseIntegrity = validateDatabaseIntegrity;
exports.default = {
    initializeModels,
    getModels,
    getModel,
    initializeSystemData,
    validateDatabaseIntegrity,
    ...models
};
//# sourceMappingURL=index.js.map