import { BaseRepository } from './BaseRepository';
import { MixRequestRepository } from './MixRequestRepository';
import { WalletRepository } from './WalletRepository';
import { BlockchainTransaction } from '../models/BlockchainTransaction';
import { TransactionPool } from '../models/TransactionPool';
import { OutputTransaction } from '../models/OutputTransaction';
import { MonitoredAddress } from '../models/MonitoredAddress';
import { AuditLog } from '../models/AuditLog';
import { SystemConfig } from '../models/SystemConfig';
export { BaseRepository } from './BaseRepository';
export { MixRequestRepository } from './MixRequestRepository';
export { WalletRepository } from './WalletRepository';
/**
 * Репозиторий для работы с блокчейн транзакциями
 */
export declare class BlockchainTransactionRepository extends BaseRepository<BlockchainTransaction> {
    constructor(model: typeof BlockchainTransaction);
    findByTxid(txid: string): Promise<BlockchainTransaction | null>;
    findUnconfirmed(): Promise<BlockchainTransaction[]>;
}
/**
 * Репозиторий для работы с пулами транзакций
 */
export declare class TransactionPoolRepository extends BaseRepository<TransactionPool> {
    constructor(model: typeof TransactionPool);
    findActive(): Promise<TransactionPool[]>;
    findReadyForMixing(): Promise<TransactionPool[]>;
}
/**
 * Репозиторий для работы с исходящими транзакциями
 */
export declare class OutputTransactionRepository extends BaseRepository<OutputTransaction> {
    constructor(model: typeof OutputTransaction);
    findReadyForProcessing(): Promise<OutputTransaction[]>;
    findByMixRequest(mixRequestId: string): Promise<OutputTransaction[]>;
}
/**
 * Репозиторий для работы с мониторингом адресов
 */
export declare class MonitoredAddressRepository extends BaseRepository<MonitoredAddress> {
    constructor(model: typeof MonitoredAddress);
    findActiveForMonitoring(): Promise<MonitoredAddress[]>;
    findByAddress(address: string): Promise<MonitoredAddress | null>;
}
/**
 * Репозиторий для работы с логами аудита
 */
export declare class AuditLogRepository extends BaseRepository<AuditLog> {
    constructor(model: typeof AuditLog);
    findByLevel(level: string): Promise<AuditLog[]>;
    findByAction(action: string): Promise<AuditLog[]>;
    findByMixRequest(mixRequestId: string): Promise<AuditLog[]>;
}
/**
 * Репозиторий для работы с системными настройками
 */
export declare class SystemConfigRepository extends BaseRepository<SystemConfig> {
    constructor(model: typeof SystemConfig);
    getByKey(key: string): Promise<SystemConfig | null>;
    getByCategory(category: string): Promise<SystemConfig[]>;
    updateValue(key: string, value: string): Promise<SystemConfig | null>;
}
/**
 * Контейнер всех репозиториев
 */
export declare class RepositoryContainer {
    mixRequest: MixRequestRepository;
    wallet: WalletRepository;
    blockchainTransaction: BlockchainTransactionRepository;
    transactionPool: TransactionPoolRepository;
    outputTransaction: OutputTransactionRepository;
    monitoredAddress: MonitoredAddressRepository;
    auditLog: AuditLogRepository;
    systemConfig: SystemConfigRepository;
    constructor(models: any);
    /**
     * Выполнение операции в транзакции
     */
    transaction<T>(callback: (repositories: RepositoryContainer) => Promise<T>): Promise<T>;
}
/**
 * Инициализация всех репозиториев
 */
export declare function initializeRepositories(models: any): RepositoryContainer;
/**
 * Экспорт типов
 */
export type Repositories = RepositoryContainer;
declare const _default: {
    initializeRepositories: typeof initializeRepositories;
    RepositoryContainer: typeof RepositoryContainer;
    BaseRepository: typeof BaseRepository;
    MixRequestRepository: typeof MixRequestRepository;
    WalletRepository: typeof WalletRepository;
    BlockchainTransactionRepository: typeof BlockchainTransactionRepository;
    TransactionPoolRepository: typeof TransactionPoolRepository;
    OutputTransactionRepository: typeof OutputTransactionRepository;
    MonitoredAddressRepository: typeof MonitoredAddressRepository;
    AuditLogRepository: typeof AuditLogRepository;
    SystemConfigRepository: typeof SystemConfigRepository;
};
export default _default;
