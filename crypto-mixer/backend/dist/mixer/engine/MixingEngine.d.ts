import { EventEmitter } from 'events';
import { CoinJoinAlgorithm } from '../algorithms/CoinJoinAlgorithm';
import { RingSignaturesAlgorithm } from '../algorithms/RingSignaturesAlgorithm';
interface MixingEngineDependencies {
    poolManager?: any;
    scheduler?: any;
    validator?: any;
    security?: any;
    logger?: any;
    database?: any;
    blockchainManager?: any;
    config?: MixingEngineConfig;
    coinJoinAlgorithm?: CoinJoinAlgorithm;
    ringSignaturesAlgorithm?: RingSignaturesAlgorithm;
}
interface MixingEngineConfig {
    maxConcurrentMixes?: number;
    minPoolSize?: number;
    phaseDelay?: number;
    maxMixingTime?: number;
    minCoinJoinParticipants?: number;
    maxRetryAttempts?: number;
    defaultAlgorithm?: 'COINJOIN' | 'RING_SIGNATURES' | 'STEALTH';
    cryptographic?: {
        enableAdvancedAlgorithms?: boolean;
        useSchnorrSignatures?: boolean;
        enableStealthAddresses?: boolean;
        enableConfidentialTransactions?: boolean;
    };
}
interface MixingStatistics {
    totalMixes: number;
    successfulMixes: number;
    failedMixes: number;
    totalVolume: Map<string, number>;
    averageTime: number;
    lastUpdated?: number;
}
interface MixRequest {
    id: string;
    currency: string;
    amount: number;
    inputAddresses: string[];
    outputAddresses: Array<{
        address: string;
        percentage: number;
        amount: number;
    }>;
    strategy: 'COINJOIN' | 'POOL_MIXING' | 'FAST_MIX';
    algorithm?: 'COINJOIN' | 'RING_SIGNATURES' | 'STEALTH' | 'TORNADO';
    priority: 'LOW' | 'NORMAL' | 'HIGH';
    delay?: number;
    createdAt: Date;
    status: 'PENDING' | 'PROCESSING' | 'MIXING' | 'COMPLETED' | 'FAILED';
}
interface MixingResult {
    id: string;
    success: boolean;
    outputTransactions?: Array<{
        txHash: string;
        amount: number;
        address: string;
    }>;
    error?: string;
    processingTime?: number;
    anonymityScore?: number;
}
interface HealthCheckResult {
    healthy: boolean;
    dependencies: {
        poolManager: boolean;
        scheduler: boolean;
        validator: boolean;
        security: boolean;
        database: boolean;
        blockchainManager: boolean;
    };
    capacity: {
        currentLoad: number;
        maxCapacity: number;
        utilizationPercent: number;
    };
    performance: {
        averageProcessingTime: number;
        successRate: number;
        errorRate: number;
    };
    issues: string[];
}
/**
 * Основной движок микширования - координирует все процессы микширования транзакций
 * Обеспечивает безопасное смешивание криптовалют с максимальной анонимностью
 */
declare class MixingEngine extends EventEmitter {
    private poolManager?;
    private scheduler?;
    private validator?;
    private security?;
    private logger?;
    private database?;
    private blockchainManager?;
    private coinJoinAlgorithm;
    private ringSignaturesAlgorithm;
    private config;
    private state;
    private metrics;
    private queueProcessorInterval?;
    private periodicTasksInterval?;
    private poolMonitoringInterval?;
    constructor(dependencies?: MixingEngineDependencies);
    /**
     * Запускает движок микширования
     */
    start(): Promise<void>;
    /**
     * Останавливает движок микширования
     */
    stop(): Promise<void>;
    /**
     * Основной метод для запуска процесса микширования
     */
    processMixing(request: MixRequest): Promise<MixingResult>;
    /**
     * Получение статуса движка и текущих операций
     */
    getStatus(): any;
    /**
     * Проверка здоровья движка и всех его зависимостей
     */
    healthCheck(): Promise<HealthCheckResult>;
    /**
     * Валидация всех зависимостей движка микширования
     */
    private _validateDependencies;
    /**
     * Инициализация системы безопасности движка
     */
    private _initializeSecurity;
    /**
     * Запуск мониторинга пулов микширования
     */
    private _startPoolMonitoring;
    /**
     * Запуск обработчика очереди микширований
     */
    private _startQueueProcessor;
    /**
     * Запуск периодических задач обслуживания
     */
    private _startPeriodicTasks;
    /**
     * Ожидание завершения всех активных операций микширования
     */
    private _waitForActiveMixes;
    /**
     * Валидация запроса на микширование (исправленная версия без дублирования)
     */
    private _validateMixRequest_legacy;
    /**
     * Проверка безопасности запроса на микширование
     */
    private _securityCheck;
    /**
     * Обновление статистики движка
     */
    private _updateStatistics;
    /**
     * Расчет текущих метрик производительности
     */
    private _calculateMetrics;
    /**
     * Проверка здоровья зависимостей
     */
    private _checkDependencyHealth;
    /**
     * Добавление запроса в очередь микширования
     */
    enqueueMixRequest(mixRequest: MixRequest): Promise<void>;
    /**
     * Обработка запроса на микширование
     */
    processMixRequest(mixRequest: MixRequest): Promise<void>;
    /**
     * Отмена запроса на микширование
     */
    cancelMix(sessionId: string): Promise<void>;
    /**
     * Получение статистики движка
     */
    getEngineStatistics(): MixingStatistics & {
        activeCount: number;
        queueSize: number;
    };
    private _validateMixRequest;
    private _initializeMixing;
    private _waitForDeposit;
    private _assembleMixingPool;
    private _executeMixing;
    private _distributeOutputs;
    private _completeMixing;
    private _cancelActiveMix;
    /**
     * Выполнение CoinJoin микширования
     */
    private _executeCoinJoin;
    /**
     * Выполнение Pool микширования
     */
    private _executePoolMixing;
    /**
     * Выполнение быстрого микширования
     */
    private _executeFastMix;
    private _executeCoinJoinMixing;
    private _executeRingSignatureMixing;
    private _executeStealthMixing;
    private _delay;
    /**
     * Инициализация мониторинга подозрительной активности
     */
    private _initializeSuspiciousActivityMonitoring;
    /**
     * Конфигурация лимитов безопасности
     */
    private _configureSecurityLimits;
    /**
     * Инициализация системы аудит логирования
     */
    private _initializeAuditLogging;
    /**
     * Настройка детекторов активности
     */
    private _setupActivityDetectors;
    /**
     * Установка лимитов безопасности
     */
    private _setSecurityLimits;
    /**
     * Настройка audit logger
     */
    private _setupAuditLogger;
    /**
     * Запись в audit log
     */
    private _auditLog;
    private _generateInternalAddresses;
    private _initializeMixingMetrics;
    /**
     * Мониторинг здоровья пулов
     */
    private _monitorPoolsHealth;
    /**
     * Оптимизация распределения пулов
     */
    private _optimizePoolDistribution;
    /**
     * Очистка устаревших записей пула
     */
    private _cleanupStalePoolEntries;
    /**
     * Инициализация статистики пулов
     */
    private _initializePoolStatistics;
    private _monitorDepositAddress;
    private _findPoolParticipants;
    private _waitForSufficientPool;
    private _createOutputTransactions;
    private _broadcastOutputTransactions;
    /**
     * Поиск участников для CoinJoin
     */
    private _findCoinJoinParticipants;
    /**
     * Создание CoinJoin транзакции
     */
    private _createCoinJoinTransaction;
    /**
     * Сбор подписей для CoinJoin
     */
    private _collectCoinJoinSignatures;
    /**
     * Трансляция CoinJoin транзакции
     */
    private _broadcastCoinJoinTransaction;
    /**
     * Расчет анонимности для CoinJoin
     */
    private _calculateCoinJoinAnonymityScore;
    /**
     * Получение доступного пула
     */
    private _getAvailablePool;
    /**
     * Добавление в пул
     */
    private _addToPool;
    /**
     * Ожидание перемешивания в пуле
     */
    private _waitForPoolMixing;
    /**
     * Извлечение из пула
     */
    private _withdrawFromPool;
    /**
     * Распределение выходов пула
     */
    private _distributePoolOutputs;
    /**
     * Расчет анонимности для Pool
     */
    private _calculatePoolAnonymityScore;
    /**
     * Получение канала быстрого микширования
     */
    private _getFastMixingChannel;
    /**
     * Генерация промежуточных адресов
     */
    private _generateIntermediateAddresses;
    /**
     * Выполнение быстрых переходов
     */
    private _performFastMixingHops;
    /**
     * Финальное распределение
     */
    private _performFinalDistribution;
    /**
     * Расчет анонимности для Fast Mix
     */
    private _calculateFastMixAnonymityScore;
    /**
     * Получение статистики пулов
     */
    private _getPoolStatistics;
    /**
     * Оценка здоровья пула
     */
    private _evaluatePoolHealth;
    /**
     * Создание плана оптимизации
     */
    private _createOptimizationPlan;
    /**
     * Выполнение действия оптимизации
     */
    private _executeOptimizationAction;
    /**
     * Выполнение очистки пула по категории
     */
    private _performPoolCleanup;
    /**
     * Получение требуемого размера пула для валюты
     */
    private _getRequiredPoolSize;
    /**
     * Установка начальной статистики пулов
     */
    private _setInitialPoolStats;
    /**
     * Получение лимитов для валюты
     */
    private _getCurrencyLimits;
    /**
     * Валидация адреса для конкретной валюты
     */
    private _isValidAddress;
    /**
     * Получение минимальной суммы вывода для валюты
     */
    private _getMinOutputAmount;
    /**
     * Валидация Ethereum checksum (EIP-55)
     */
    private _validateEthereumChecksum;
    /**
     * Дополнительная валидация Bitcoin адреса
     */
    private _validateBitcoinAddress;
    /**
     * Проверка лимитов суммы для валюты
     */
    private _validateAmountLimits;
    /**
     * Валидация процентного распределения выходных адресов
     */
    private _validateOutputPercentages;
    /**
     * Выполнение периодического обслуживания системы
     */
    private _performPeriodicMaintenance;
    /**
     * Очистка неактивных микширований
     */
    private _cleanupInactiveMixes;
    /**
     * Оптимизация использования памяти
     */
    private _optimizeMemoryUsage;
    /**
     * Проверка метрик производительности
     */
    private _checkPerformanceMetrics;
    /**
     * Проверка адресов в черном списке
     */
    private _checkAddressBlacklist;
    /**
     * Проверка адреса в черном списке
     */
    private _isAddressBlacklisted;
    /**
     * Проверка подозрительных паттернов транзакций
     */
    private _checkTransactionPatterns;
    /**
     * Проверка подозрительных сумм
     */
    private _checkSuspiciousAmounts;
    /**
     * Проверка частоты транзакций
     */
    private _checkTransactionFrequency;
    /**
     * Проверка связи с известными миксерами
     */
    private _checkMixerConnections;
    /**
     * Проверка ограничений скорости
     */
    private _checkRateLimits;
    /**
     * Проверка дневных лимитов
     */
    private _checkDailyLimits;
    /**
     * Проверка лимитов по IP
     */
    private _checkIPRateLimits;
    /**
     * Проверка глобальных лимитов системы
     */
    private _checkGlobalRateLimits;
    /**
     * Категоризация ошибок для метрик
     */
    private _categorizeError;
    /**
     * Очистка старых метрик
     */
    private _cleanupOldMetrics;
    /**
     * Обновление статистики движка
     */
    private _updateEngineStatistics;
    /**
     * Настройка обработчиков событий алгоритмов
     */
    private _setupAlgorithmEventHandlers;
    /**
     * Получение статистики алгоритмов
     */
    getAlgorithmStatistics(): any;
    /**
     * Очистка кешей алгоритмов
     */
    cleanupAlgorithms(): Promise<void>;
}
export default MixingEngine;
export { MixingEngine };
export type { MixingEngineConfig, MixingEngineDependencies, MixRequest, MixingResult, HealthCheckResult };
