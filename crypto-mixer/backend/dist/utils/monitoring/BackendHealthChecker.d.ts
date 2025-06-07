import { BaseHealthChecker, DatabaseHealthDetails, CacheHealthDetails, BlockchainHealthDetails, MessageQueueHealthDetails, VaultHealthDetails, HSMHealthDetails, DependencyHealthDetails } from './interfaces/HealthCheckInterface';
import { DatabaseManager } from '../../database/DatabaseManager';
export declare function setGlobalDatabaseManager(dbManager: DatabaseManager): void;
/**
 * Реализация Health Check для основного Backend сервиса crypto-mixer
 * Проверяет все критически важные компоненты системы
 */
export declare class BackendHealthChecker extends BaseHealthChecker {
    private static instance;
    private redisClient;
    constructor();
    /**
     * Получение синглтон экземпляра
     */
    static getInstance(): BackendHealthChecker;
    /**
     * Проверка состояния PostgreSQL базы данных
     */
    protected checkDatabase(): Promise<DatabaseHealthDetails>;
    /**
     * Проверка состояния Redis кэша
     */
    protected checkCache(): Promise<CacheHealthDetails>;
    /**
     * Backend сервис не работает напрямую с блокчейном
     */
    protected checkBlockchain(): Promise<BlockchainHealthDetails>;
    /**
     * Проверка состояния RabbitMQ
     */
    protected checkMessageQueue(): Promise<MessageQueueHealthDetails>;
    /**
     * Проверка состояния HashiCorp Vault
     */
    protected checkVault(): Promise<VaultHealthDetails>;
    /**
     * Проверка состояния HSM (Hardware Security Module)
     */
    protected checkHSM(): Promise<HSMHealthDetails>;
    /**
     * Получение экземпляра HSM Manager
     */
    private getHSMManager;
    /**
     * Проверка состояния зависимых сервисов
     */
    protected checkDependencies(): Promise<DependencyHealthDetails[]>;
    /**
     * Выполнение кастомных проверок специфичных для backend
     */
    protected performCustomChecks(): Promise<Record<string, any>>;
    /**
     * Проверка конкретного зависимого сервиса
     */
    private checkDependencyService;
    /**
     * Проверка доступного места на диске
     */
    private checkDiskSpace;
    /**
     * Проверка системы логирования
     */
    private checkLoggingSystem;
    /**
     * Проверка конфигурации
     */
    private checkConfiguration;
    /**
     * Проверка процесса Node.js
     */
    private checkNodeProcess;
    /**
     * Извлечение числового значения из Redis INFO
     */
    private extractInfoValue;
    /**
     * Извлечение строкового значения из Redis INFO
     */
    private extractInfoStringValue;
    /**
     * Очистка ресурсов при завершении работы
     */
    cleanup(): Promise<void>;
}
export default BackendHealthChecker;
