import { BitcoinCoreConfig } from './BitcoinCoreClient';
import { EthereumGethConfig } from './EthereumGethClient';
import { SolanaRpcConfig } from './SolanaRpcClient';
import { LitecoinCoreConfig } from './LitecoinCoreClient';
import { DashCoreConfig } from './DashCoreClient';
import { ZcashConfig } from './ZcashClient';
import { CurrencyType } from '../../database/types';
/**
 * Интерфейсы для управления блокчейн клиентами
 */
interface BlockchainClientStatus {
    currency: CurrencyType;
    isConnected: boolean;
    lastHealthCheck: Date | null;
    blockHeight?: number;
    peerCount?: number;
    syncStatus?: any;
    error?: string;
}
interface BlockchainManagerConfig {
    bitcoin?: BitcoinCoreConfig & {
        enabled: boolean;
    };
    ethereum?: EthereumGethConfig & {
        enabled: boolean;
    };
    solana?: SolanaRpcConfig & {
        enabled: boolean;
    };
    litecoin?: LitecoinCoreConfig & {
        enabled: boolean;
    };
    dash?: DashCoreConfig & {
        enabled: boolean;
    };
    zcash?: ZcashConfig & {
        enabled: boolean;
    };
    healthCheckInterval?: number;
}
interface UnifiedTransactionResult {
    txHash: string;
    currency: CurrencyType;
    fromAddress: string;
    toAddress: string;
    amount: number;
    fee: number;
    confirmations: number;
    status: 'pending' | 'confirmed' | 'failed';
    blockNumber?: number;
    timestamp?: Date;
}
interface UnifiedAddressInfo {
    address: string;
    currency: CurrencyType;
    balance: number;
    isValid: boolean;
    isWatchOnly?: boolean;
}
interface BlockchainPerformanceStats {
    currency: CurrencyType;
    isConnected: boolean;
    lastHealthCheck: Date | null;
    responseTime: number;
    errorRate: number;
    currentBlock: number;
    networkPeers: number;
    mempooolSize?: number;
    additionalInfo?: any;
}
/**
 * Единый менеджер для управления всеми блокчейн подключениями
 * Предоставляет унифицированный интерфейс для работы с Bitcoin, Ethereum и Solana
 */
export declare class BlockchainManager {
    private config;
    private clients;
    private healthCheckIntervals;
    private performanceMetrics;
    private isInitialized;
    constructor(config: BlockchainManagerConfig);
    /**
     * Инициализация всех блокчейн клиентов
     */
    initialize(): Promise<void>;
    /**
     * Инициализация Bitcoin Core клиента
     */
    private initializeBitcoinClient;
    /**
     * Инициализация Ethereum Geth клиента
     */
    private initializeEthereumClient;
    /**
     * Инициализация Solana RPC клиента
     */
    private initializeSolanaClient;
    /**
     * Инициализация Litecoin Core клиента
     */
    private initializeLitecoinClient;
    /**
     * Инициализация Dash Core клиента
     */
    private initializeDashClient;
    /**
     * Инициализация Zcash клиента
     */
    private initializeZcashClient;
    /**
     * Запуск глобального мониторинга здоровья
     */
    private startGlobalHealthMonitoring;
    /**
     * Выполнение проверок здоровья для всех клиентов
     */
    private performHealthChecks;
    /**
     * Получение баланса адреса
     */
    getBalance(currency: CurrencyType, address: string): Promise<number>;
    /**
     * Создание нового адреса
     */
    createAddress(currency: CurrencyType): Promise<string>;
    /**
     * Получение информации об адресе
     */
    getAddressInfo(currency: CurrencyType, address: string): Promise<UnifiedAddressInfo>;
    /**
     * Получение транзакции по хешу
     */
    getTransaction(currency: CurrencyType, txHash: string): Promise<UnifiedTransactionResult | null>;
    /**
     * Получение статуса всех блокчейн клиентов
     */
    getClientsStatus(): BlockchainClientStatus[];
    /**
     * Получение метрик производительности
     */
    getPerformanceMetrics(): Map<CurrencyType, BlockchainPerformanceStats>;
    /**
     * Проверка доступности клиента для валюты
     */
    isClientAvailable(currency: CurrencyType): boolean;
    /**
     * Получение клиента для валюты
     */
    private getClient;
    /**
     * Получение поддерживаемых валют
     */
    getSupportedCurrencies(): CurrencyType[];
    /**
     * Остановка всех клиентов и очистка ресурсов
     */
    shutdown(): Promise<void>;
    /**
     * Проверка инициализации менеджера
     */
    isReady(): boolean;
    /**
     * Повторная инициализация клиента для конкретной валюты
     */
    reinitializeClient(currency: CurrencyType): Promise<void>;
}
export {};
