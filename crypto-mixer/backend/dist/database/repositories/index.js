"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepositoryContainer = exports.SystemConfigRepository = exports.AuditLogRepository = exports.MonitoredAddressRepository = exports.OutputTransactionRepository = exports.TransactionPoolRepository = exports.BlockchainTransactionRepository = exports.WalletRepository = exports.MixRequestRepository = exports.BaseRepository = void 0;
exports.initializeRepositories = initializeRepositories;
// Import repositories
const BaseRepository_1 = require("./BaseRepository");
const MixRequestRepository_1 = require("./MixRequestRepository");
const WalletRepository_1 = require("./WalletRepository");
// Export repository classes
var BaseRepository_2 = require("./BaseRepository");
Object.defineProperty(exports, "BaseRepository", { enumerable: true, get: function () { return BaseRepository_2.BaseRepository; } });
var MixRequestRepository_2 = require("./MixRequestRepository");
Object.defineProperty(exports, "MixRequestRepository", { enumerable: true, get: function () { return MixRequestRepository_2.MixRequestRepository; } });
var WalletRepository_2 = require("./WalletRepository");
Object.defineProperty(exports, "WalletRepository", { enumerable: true, get: function () { return WalletRepository_2.WalletRepository; } });
/**
 * Репозиторий для работы с блокчейн транзакциями
 */
class BlockchainTransactionRepository extends BaseRepository_1.BaseRepository {
    constructor(model) {
        super(model);
    }
    async findByTxid(txid) {
        return await this.findOne({ txid });
    }
    async findUnconfirmed() {
        return await this.findAll({
            confirmations: { $lt: 6 },
            status: ['PENDING', 'MEMPOOL']
        });
    }
}
exports.BlockchainTransactionRepository = BlockchainTransactionRepository;
/**
 * Репозиторий для работы с пулами транзакций
 */
class TransactionPoolRepository extends BaseRepository_1.BaseRepository {
    constructor(model) {
        super(model);
    }
    async findActive() {
        return await this.findAll({
            isActive: true,
            status: ['WAITING', 'FILLING', 'READY']
        });
    }
    async findReadyForMixing() {
        return await this.findAll({
            status: 'READY',
            isLocked: false
        });
    }
}
exports.TransactionPoolRepository = TransactionPoolRepository;
/**
 * Репозиторий для работы с исходящими транзакциями
 */
class OutputTransactionRepository extends BaseRepository_1.BaseRepository {
    constructor(model) {
        super(model);
    }
    async findReadyForProcessing() {
        return await this.findAll({
            status: 'PENDING',
            scheduledAt: { $lte: new Date() }
        });
    }
    async findByMixRequest(mixRequestId) {
        return await this.findAll({ mixRequestId });
    }
}
exports.OutputTransactionRepository = OutputTransactionRepository;
/**
 * Репозиторий для работы с мониторингом адресов
 */
class MonitoredAddressRepository extends BaseRepository_1.BaseRepository {
    constructor(model) {
        super(model);
    }
    async findActiveForMonitoring() {
        return await this.findAll({
            isActive: true
        });
    }
    async findByAddress(address) {
        return await this.findOne({ address });
    }
}
exports.MonitoredAddressRepository = MonitoredAddressRepository;
/**
 * Репозиторий для работы с логами аудита
 */
class AuditLogRepository extends BaseRepository_1.BaseRepository {
    constructor(model) {
        super(model);
    }
    async findByLevel(level) {
        return await this.findAll({ level });
    }
    async findByAction(action) {
        return await this.findAll({ action });
    }
    async findByMixRequest(mixRequestId) {
        return await this.findAll({ mixRequestId });
    }
}
exports.AuditLogRepository = AuditLogRepository;
/**
 * Репозиторий для работы с системными настройками
 */
class SystemConfigRepository extends BaseRepository_1.BaseRepository {
    constructor(model) {
        super(model);
    }
    async getByKey(key) {
        return await this.findOne({ key });
    }
    async getByCategory(category) {
        return await this.findAll({ category });
    }
    async updateValue(key, value) {
        const config = await this.getByKey(key);
        if (config) {
            return await this.updateById(config.id, { value });
        }
        return null;
    }
}
exports.SystemConfigRepository = SystemConfigRepository;
/**
 * Контейнер всех репозиториев
 */
class RepositoryContainer {
    constructor(models) {
        this.mixRequest = new MixRequestRepository_1.MixRequestRepository(models.MixRequest);
        this.wallet = new WalletRepository_1.WalletRepository(models.Wallet);
        this.blockchainTransaction = new BlockchainTransactionRepository(models.BlockchainTransaction);
        this.transactionPool = new TransactionPoolRepository(models.TransactionPool);
        this.outputTransaction = new OutputTransactionRepository(models.OutputTransaction);
        this.monitoredAddress = new MonitoredAddressRepository(models.MonitoredAddress);
        this.auditLog = new AuditLogRepository(models.AuditLog);
        this.systemConfig = new SystemConfigRepository(models.SystemConfig);
    }
    /**
     * Выполнение операции в транзакции
     */
    async transaction(callback) {
        const sequelize = this.mixRequest.getModel().sequelize;
        if (!sequelize) {
            throw new Error('Sequelize instance not available');
        }
        return await sequelize.transaction(async (transaction) => {
            // Создаем копию контейнера с транзакцией
            // В реальной реализации можно передавать транзакцию в методы репозиториев
            return await callback(this);
        });
    }
}
exports.RepositoryContainer = RepositoryContainer;
/**
 * Инициализация всех репозиториев
 */
function initializeRepositories(models) {
    console.log('🔄 Initializing repositories...');
    const repositories = new RepositoryContainer(models);
    console.log('✅ Repositories initialized successfully');
    return repositories;
}
exports.default = {
    initializeRepositories,
    RepositoryContainer,
    BaseRepository: BaseRepository_1.BaseRepository,
    MixRequestRepository: MixRequestRepository_1.MixRequestRepository,
    WalletRepository: WalletRepository_1.WalletRepository,
    BlockchainTransactionRepository,
    TransactionPoolRepository,
    OutputTransactionRepository,
    MonitoredAddressRepository,
    AuditLogRepository,
    SystemConfigRepository
};
//# sourceMappingURL=index.js.map