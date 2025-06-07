import { Sequelize } from 'sequelize';

// Import repositories
import { BaseRepository } from './BaseRepository';
import { MixRequestRepository } from './MixRequestRepository';
import { WalletRepository } from './WalletRepository';

// Import models
import { MixRequest } from '../models/MixRequest';
import { Wallet } from '../models/Wallet';
import { BlockchainTransaction } from '../models/BlockchainTransaction';
import { TransactionPool } from '../models/TransactionPool';
import { OutputTransaction } from '../models/OutputTransaction';
import { MonitoredAddress } from '../models/MonitoredAddress';
import { AuditLog } from '../models/AuditLog';
import { SystemConfig } from '../models/SystemConfig';

// Export repository classes
export { BaseRepository } from './BaseRepository';
export { MixRequestRepository } from './MixRequestRepository';
export { WalletRepository } from './WalletRepository';

/**
 * Репозиторий для работы с блокчейн транзакциями
 */
export class BlockchainTransactionRepository extends BaseRepository<BlockchainTransaction> {
  constructor(model: typeof BlockchainTransaction) {
    super(model);
  }

  async findByTxid(txid: string): Promise<BlockchainTransaction | null> {
    return await this.findOne({ txid });
  }

  async findUnconfirmed(): Promise<BlockchainTransaction[]> {
    return await this.findAll({
      confirmations: { $lt: 6 },
      status: ['PENDING', 'MEMPOOL']
    });
  }
}

/**
 * Репозиторий для работы с пулами транзакций
 */
export class TransactionPoolRepository extends BaseRepository<TransactionPool> {
  constructor(model: typeof TransactionPool) {
    super(model);
  }

  async findActive(): Promise<TransactionPool[]> {
    return await this.findAll({
      isActive: true,
      status: ['WAITING', 'FILLING', 'READY']
    });
  }

  async findReadyForMixing(): Promise<TransactionPool[]> {
    return await this.findAll({
      status: 'READY',
      isLocked: false
    });
  }
}

/**
 * Репозиторий для работы с исходящими транзакциями
 */
export class OutputTransactionRepository extends BaseRepository<OutputTransaction> {
  constructor(model: typeof OutputTransaction) {
    super(model);
  }

  async findReadyForProcessing(): Promise<OutputTransaction[]> {
    return await this.findAll({
      status: 'PENDING',
      scheduledAt: { $lte: new Date() }
    });
  }

  async findByMixRequest(mixRequestId: string): Promise<OutputTransaction[]> {
    return await this.findAll({ mixRequestId });
  }
}

/**
 * Репозиторий для работы с мониторингом адресов
 */
export class MonitoredAddressRepository extends BaseRepository<MonitoredAddress> {
  constructor(model: typeof MonitoredAddress) {
    super(model);
  }

  async findActiveForMonitoring(): Promise<MonitoredAddress[]> {
    return await this.findAll({
      isActive: true
    });
  }

  async findByAddress(address: string): Promise<MonitoredAddress | null> {
    return await this.findOne({ address });
  }
}

/**
 * Репозиторий для работы с логами аудита
 */
export class AuditLogRepository extends BaseRepository<AuditLog> {
  constructor(model: typeof AuditLog) {
    super(model);
  }

  async findByLevel(level: string): Promise<AuditLog[]> {
    return await this.findAll({ level });
  }

  async findByAction(action: string): Promise<AuditLog[]> {
    return await this.findAll({ action });
  }

  async findByMixRequest(mixRequestId: string): Promise<AuditLog[]> {
    return await this.findAll({ mixRequestId });
  }
}

/**
 * Репозиторий для работы с системными настройками
 */
export class SystemConfigRepository extends BaseRepository<SystemConfig> {
  constructor(model: typeof SystemConfig) {
    super(model);
  }

  async getByKey(key: string): Promise<SystemConfig | null> {
    return await this.findOne({ key });
  }

  async getByCategory(category: string): Promise<SystemConfig[]> {
    return await this.findAll({ category });
  }

  async updateValue(key: string, value: string): Promise<SystemConfig | null> {
    const config = await this.getByKey(key);
    if (config) {
      return await this.updateById(config.id, { value });
    }
    return null;
  }
}

/**
 * Контейнер всех репозиториев
 */
export class RepositoryContainer {
  public mixRequest: MixRequestRepository;
  public wallet: WalletRepository;
  public blockchainTransaction: BlockchainTransactionRepository;
  public transactionPool: TransactionPoolRepository;
  public outputTransaction: OutputTransactionRepository;
  public monitoredAddress: MonitoredAddressRepository;
  public auditLog: AuditLogRepository;
  public systemConfig: SystemConfigRepository;

  constructor(models: any) {
    this.mixRequest = new MixRequestRepository(models.MixRequest);
    this.wallet = new WalletRepository(models.Wallet);
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
  async transaction<T>(callback: (repositories: RepositoryContainer) => Promise<T>): Promise<T> {
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

/**
 * Инициализация всех репозиториев
 */
export function initializeRepositories(models: any): RepositoryContainer {
  console.log('🔄 Initializing repositories...');
  
  const repositories = new RepositoryContainer(models);
  
  console.log('✅ Repositories initialized successfully');
  return repositories;
}

/**
 * Экспорт типов
 */
export type Repositories = RepositoryContainer;

export default {
  initializeRepositories,
  RepositoryContainer,
  BaseRepository,
  MixRequestRepository,
  WalletRepository,
  BlockchainTransactionRepository,
  TransactionPoolRepository,
  OutputTransactionRepository,
  MonitoredAddressRepository,
  AuditLogRepository,
  SystemConfigRepository
};