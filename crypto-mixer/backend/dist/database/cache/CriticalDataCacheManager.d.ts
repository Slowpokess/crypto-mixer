/**
 * Менеджер кэширования критических данных микширования
 *
 * Специализированное кэширование для:
 * - Активные запросы микширования
 * - Балансы кошельков и пулы ликвидности
 * - Курсы валют и комиссии
 * - Временные ключи и сессии
 * - Blockchain confirmations статусы
 * - Anti-fraud данные и блэклисты
 */
import { RedisCacheLayer } from './RedisCacheLayer';
import { EventEmitter } from 'events';
export interface MixingSessionData {
    id: string;
    currency: string;
    inputAmount: number;
    outputAddresses: string[];
    depositAddress: string;
    status: 'PENDING' | 'DEPOSITED' | 'POOLING' | 'MIXING' | 'COMPLETED' | 'FAILED';
    expiresAt: Date;
    lastUpdated: Date;
    metadata: {
        userAgent?: string;
        ipAddress?: string;
        fingerprint?: string;
    };
}
export interface WalletBalanceData {
    id: string;
    currency: string;
    balance: number;
    availableBalance: number;
    lockedBalance: number;
    lastTransactionAt: Date;
    lastUpdated: Date;
    isActive: boolean;
    isLocked: boolean;
}
export interface ExchangeRateData {
    baseCurrency: string;
    quoteCurrency: string;
    rate: number;
    timestamp: Date;
    source: string;
    confidence: number;
}
export interface AntifraudData {
    address: string;
    riskScore: number;
    lastSeen: Date;
    flags: string[];
    source: 'INTERNAL' | 'EXTERNAL' | 'USER_REPORT';
}
export interface BlockchainConfirmationData {
    txid: string;
    currency: string;
    confirmations: number;
    requiredConfirmations: number;
    blockHeight: number;
    timestamp: Date;
    isConfirmed: boolean;
}
/**
 * Менеджер критических данных с высокой производительностью
 */
export declare class CriticalDataCacheManager extends EventEmitter {
    private cache;
    private readonly PREFIXES;
    private readonly TTL;
    constructor(cache: RedisCacheLayer);
    /**
     * MIXING SESSION MANAGEMENT
     */
    /**
     * Сохранение данных сессии микширования
     */
    setMixingSession(sessionData: MixingSessionData): Promise<void>;
    /**
     * Получение данных сессии микширования
     */
    getMixingSession(sessionId: string): Promise<MixingSessionData | null>;
    /**
     * Поиск сессии по deposit address
     */
    findMixingSessionByDeposit(depositAddress: string): Promise<MixingSessionData | null>;
    /**
     * Обновление статуса сессии микширования
     */
    updateMixingSessionStatus(sessionId: string, status: MixingSessionData['status'], metadata?: Partial<MixingSessionData>): Promise<boolean>;
    /**
     * WALLET BALANCE MANAGEMENT
     */
    /**
     * Кэширование баланса кошелька
     */
    setWalletBalance(balanceData: WalletBalanceData): Promise<void>;
    /**
     * Получение баланса кошелька
     */
    getWalletBalance(walletId: string): Promise<WalletBalanceData | null>;
    /**
     * Инвалидация баланса кошелька
     */
    invalidateWalletBalance(walletId: string): Promise<void>;
    /**
     * EXCHANGE RATES MANAGEMENT
     */
    /**
     * Кэширование курса валют
     */
    setExchangeRate(rateData: ExchangeRateData): Promise<void>;
    /**
     * Получение курса валют
     */
    getExchangeRate(baseCurrency: string, quoteCurrency: string): Promise<ExchangeRateData | null>;
    /**
     * ANTIFRAUD & SECURITY MANAGEMENT
     */
    /**
     * Кэширование antifraud данных
     */
    setAntifraudData(data: AntifraudData): Promise<void>;
    /**
     * Получение antifraud данных
     */
    getAntifraudData(address: string): Promise<AntifraudData | null>;
    /**
     * Добавление адреса в blacklist
     */
    addToBlacklist(address: string, reason: string): Promise<void>;
    /**
     * Проверка, находится ли адрес в blacklist
     */
    isBlacklisted(address: string): Promise<boolean>;
    /**
     * BLOCKCHAIN CONFIRMATIONS MANAGEMENT
     */
    /**
     * Кэширование данных о подтверждениях
     */
    setConfirmationData(data: BlockchainConfirmationData): Promise<void>;
    /**
     * Получение данных о подтверждениях
     */
    getConfirmationData(txid: string): Promise<BlockchainConfirmationData | null>;
    /**
     * TEMPORARY KEYS & SESSION MANAGEMENT
     */
    /**
     * Сохранение временного ключа
     */
    setTempKey(keyId: string, data: any, customTTL?: number): Promise<void>;
    /**
     * Получение временного ключа
     */
    getTempKey(keyId: string): Promise<any | null>;
    /**
     * Удаление временного ключа
     */
    deleteTempKey(keyId: string): Promise<boolean>;
    /**
     * BULK OPERATIONS для высокой производительности
     */
    /**
     * Bulk кэширование балансов кошельков
     */
    bulkSetWalletBalances(balances: WalletBalanceData[]): Promise<void>;
    /**
     * Bulk получение балансов кошельков
     */
    bulkGetWalletBalances(walletIds: string[]): Promise<Map<string, WalletBalanceData | null>>;
    /**
     * ANALYTICS & MONITORING
     */
    /**
     * Получение статистики кэша критических данных
     */
    getCacheStats(): any;
    /**
     * Очистка всех критических данных (ОСТОРОЖНО!)
     */
    clearAllCriticalData(): Promise<void>;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
}
export default CriticalDataCacheManager;
