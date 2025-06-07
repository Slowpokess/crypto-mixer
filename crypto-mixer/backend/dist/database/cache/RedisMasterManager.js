"use strict";
/**
 * Redis Master Manager - Центральная система управления Redis
 *
 * Объединяет все Redis компоненты:
 * - Connection Management
 * - Cache Layer
 * - Critical Data Caching
 * - Session Management
 * - Monitoring & Health Checks
 * - Performance Analytics
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisMasterManager = void 0;
const RedisConnectionManager_1 = require("./RedisConnectionManager");
const RedisCacheLayer_1 = require("./RedisCacheLayer");
const CriticalDataCacheManager_1 = require("./CriticalDataCacheManager");
const RedisSessionManager_1 = require("./RedisSessionManager");
const logger_1 = require("../logger");
const events_1 = require("events");
/**
 * Центральная система управления Redis для криптомиксера
 */
class RedisMasterManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.isInitialized = false;
        this.isShuttingDown = false;
        this.config = {
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || '0'),
                keyPrefix: process.env.REDIS_KEY_PREFIX || 'mixer:',
                enableCluster: false,
                enableReadWriteSplit: false,
                ...config.connection
            },
            cache: {
                defaultTTL: 3600,
                enableCompression: true,
                enableMultiLevel: true,
                enableBatching: true,
                ...config.cache
            },
            monitoring: {
                enableHealthChecks: true,
                healthCheckInterval: 30000,
                enablePerformanceTracking: true,
                enableAnalytics: true,
                ...config.monitoring
            },
            security: {
                enableRateLimiting: true,
                enableAntiSpam: true,
                enableDistributedLocking: true,
                ...config.security
            }
        };
        this.initializeHealthStatus();
        this.initializePerformanceMetrics();
        logger_1.enhancedDbLogger.info('🚀 RedisMasterManager создан', {
            host: this.config.connection.host,
            port: this.config.connection.port,
            enableCluster: this.config.connection.enableCluster
        });
    }
    /**
     * Полная инициализация Redis системы
     */
    async initialize() {
        if (this.isInitialized) {
            logger_1.enhancedDbLogger.warn('⚠️ Redis система уже инициализирована');
            return;
        }
        try {
            logger_1.enhancedDbLogger.info('🔄 Инициализация Redis системы...');
            // 1. Инициализация Connection Manager
            logger_1.enhancedDbLogger.info('🔗 Инициализация Redis Connection Manager...');
            this.connectionManager = new RedisConnectionManager_1.RedisConnectionManager({
                host: this.config.connection.host,
                port: this.config.connection.port,
                password: this.config.connection.password,
                db: this.config.connection.db,
                keyPrefix: this.config.connection.keyPrefix,
                enableCluster: this.config.connection.enableCluster,
                enableReadWriteSplit: this.config.connection.enableReadWriteSplit,
                enableHealthChecks: this.config.monitoring.enableHealthChecks,
                maxConnections: 20,
                minConnections: 5
            });
            await this.connectionManager.connect();
            this.setupConnectionEventHandlers();
            // 2. Инициализация Cache Layer
            logger_1.enhancedDbLogger.info('🗄️ Инициализация Redis Cache Layer...');
            this.cacheLayer = new RedisCacheLayer_1.RedisCacheLayer(this.connectionManager, {
                defaultTTL: this.config.cache.defaultTTL,
                enableCompression: this.config.cache.enableCompression,
                enableMultiLevel: this.config.cache.enableMultiLevel,
                enableBatching: this.config.cache.enableBatching,
                enableAnalytics: this.config.monitoring.enableAnalytics
            });
            this.setupCacheEventHandlers();
            // 3. Инициализация Critical Data Manager
            logger_1.enhancedDbLogger.info('🔒 Инициализация Critical Data Manager...');
            this.criticalDataManager = new CriticalDataCacheManager_1.CriticalDataCacheManager(this.cacheLayer);
            this.setupCriticalDataEventHandlers();
            // 4. Инициализация Session Manager
            logger_1.enhancedDbLogger.info('🔐 Инициализация Session Manager...');
            this.sessionManager = new RedisSessionManager_1.RedisSessionManager(this.cacheLayer);
            this.setupSessionEventHandlers();
            // 5. Запуск мониторинга
            if (this.config.monitoring.enableHealthChecks) {
                this.startHealthMonitoring();
            }
            if (this.config.monitoring.enablePerformanceTracking) {
                this.startPerformanceTracking();
            }
            this.isInitialized = true;
            logger_1.enhancedDbLogger.info('✅ Redis система полностью инициализирована');
            this.emit('initialized');
            // Первоначальная проверка здоровья
            await this.performHealthCheck();
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инициализации Redis системы', { error });
            throw error;
        }
    }
    /**
     * Настройка обработчиков событий Connection Manager
     */
    setupConnectionEventHandlers() {
        this.connectionManager.on('connected', () => {
            logger_1.enhancedDbLogger.info('✅ Redis подключение установлено');
            this.systemHealth.components.connection = 'HEALTHY';
            this.emit('redis_connected');
        });
        this.connectionManager.on('connection_error', (error) => {
            logger_1.enhancedDbLogger.error('❌ Ошибка Redis подключения', { error });
            this.systemHealth.components.connection = 'CRITICAL';
            this.emit('redis_connection_error', error);
        });
        this.connectionManager.on('failover_success', () => {
            logger_1.enhancedDbLogger.info('✅ Redis failover выполнен успешно');
            this.systemHealth.components.connection = 'WARNING';
            this.emit('redis_failover_success');
        });
        this.connectionManager.on('failover_failed', (error) => {
            logger_1.enhancedDbLogger.error('❌ Redis failover неуспешен', { error });
            this.systemHealth.components.connection = 'CRITICAL';
            this.emit('redis_failover_failed', error);
        });
    }
    /**
     * Настройка обработчиков событий Cache Layer
     */
    setupCacheEventHandlers() {
        this.cacheLayer.on('cache_invalidated', (data) => {
            logger_1.enhancedDbLogger.debug('🗑️ Кэш инвалидирован', data);
        });
        // Мониторинг производительности кэша
        setInterval(() => {
            const cacheStats = this.cacheLayer.getStats();
            if (cacheStats.hitRate < 50) {
                this.systemHealth.components.cache = 'WARNING';
                logger_1.enhancedDbLogger.warn('⚠️ Низкий hit rate кэша', { hitRate: cacheStats.hitRate });
            }
            else if (cacheStats.hitRate < 30) {
                this.systemHealth.components.cache = 'CRITICAL';
                logger_1.enhancedDbLogger.error('❌ Критически низкий hit rate кэша', { hitRate: cacheStats.hitRate });
            }
            else {
                this.systemHealth.components.cache = 'HEALTHY';
            }
        }, 60000); // Каждую минуту
    }
    /**
     * Настройка обработчиков событий Critical Data Manager
     */
    setupCriticalDataEventHandlers() {
        this.criticalDataManager.on('mixing_session_cached', (session) => {
            logger_1.enhancedDbLogger.debug('💾 Mixing session кэширована', {
                sessionId: session.id,
                status: session.status
            });
        });
        this.criticalDataManager.on('address_blacklisted', (data) => {
            logger_1.enhancedDbLogger.warn('🚫 Адрес добавлен в blacklist', {
                address: data.address.substring(0, 10) + '...',
                reason: data.reason
            });
            this.emit('security_alert', { type: 'address_blacklisted', data });
        });
    }
    /**
     * Настройка обработчиков событий Session Manager
     */
    setupSessionEventHandlers() {
        this.sessionManager.on('session_created', (session) => {
            logger_1.enhancedDbLogger.debug('🔑 Новая сессия создана', {
                sessionId: session.id,
                isAuthenticated: session.isAuthenticated
            });
        });
        this.sessionManager.on('rate_limit_exceeded', (data) => {
            logger_1.enhancedDbLogger.warn('🚫 Rate limit превышен', {
                identifier: data.identifier.substring(0, 16) + '...',
                requests: data.requests
            });
            this.emit('security_alert', { type: 'rate_limit_exceeded', data });
        });
        this.sessionManager.on('user_blocked', (data) => {
            logger_1.enhancedDbLogger.warn('🚫 Пользователь заблокирован', {
                identifier: data.identifier.substring(0, 16) + '...',
                riskScore: data.riskScore
            });
            this.emit('security_alert', { type: 'user_blocked', data });
        });
        this.sessionManager.on('lock_acquired', (lock) => {
            logger_1.enhancedDbLogger.debug('🔒 Distributed lock получен', {
                lockKey: lock.key,
                owner: lock.owner.substring(0, 16) + '...'
            });
        });
    }
    /**
     * Запуск мониторинга здоровья системы
     */
    startHealthMonitoring() {
        this.healthCheckTimer = setInterval(async () => {
            if (!this.isShuttingDown) {
                await this.performHealthCheck();
            }
        }, this.config.monitoring.healthCheckInterval);
        logger_1.enhancedDbLogger.info('💓 Redis health monitoring запущен');
    }
    /**
     * Запуск отслеживания производительности
     */
    startPerformanceTracking() {
        this.metricsTimer = setInterval(() => {
            if (!this.isShuttingDown) {
                this.updatePerformanceMetrics();
            }
        }, 30000); // Каждые 30 секунд
        logger_1.enhancedDbLogger.info('📊 Redis performance tracking запущен');
    }
    /**
     * Комплексная проверка здоровья Redis системы
     */
    async performHealthCheck() {
        try {
            logger_1.enhancedDbLogger.debug('🏥 Выполняем проверку здоровья Redis системы');
            // Проверка соединений
            const connectionHealth = this.connectionManager.getHealthStatus();
            const connectionStats = this.connectionManager.getConnectionStats();
            // Проверка кэша
            const cacheStats = this.cacheLayer.getStats();
            // Проверка сессий
            const sessionStats = this.sessionManager.getSessionStats();
            // Определяем общий статус производительности
            const avgResponseTime = connectionHealth.responseTime;
            if (avgResponseTime > 1000) {
                this.systemHealth.components.performance = 'CRITICAL';
            }
            else if (avgResponseTime > 500) {
                this.systemHealth.components.performance = 'WARNING';
            }
            else {
                this.systemHealth.components.performance = 'HEALTHY';
            }
            // Обновляем детали здоровья
            this.systemHealth.details = {
                connectionStats,
                cacheStats,
                sessionStats,
                memoryUsage: connectionHealth.memoryUsage,
                responseTime: avgResponseTime
            };
            this.systemHealth.lastCheck = new Date();
            // Определяем общий статус
            const componentStatuses = Object.values(this.systemHealth.components);
            if (componentStatuses.includes('CRITICAL')) {
                this.systemHealth.overall = 'CRITICAL';
            }
            else if (componentStatuses.includes('WARNING')) {
                this.systemHealth.overall = 'WARNING';
            }
            else {
                this.systemHealth.overall = 'HEALTHY';
            }
            // Эмитим события по состоянию
            if (this.systemHealth.overall === 'CRITICAL') {
                this.emit('system_critical', this.systemHealth);
            }
            else if (this.systemHealth.overall === 'WARNING') {
                this.emit('system_warning', this.systemHealth);
            }
            logger_1.enhancedDbLogger.debug('✅ Redis health check завершен', {
                overall: this.systemHealth.overall,
                components: this.systemHealth.components
            });
            return { ...this.systemHealth };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка health check Redis системы', { error });
            this.systemHealth.overall = 'CRITICAL';
            this.systemHealth.lastCheck = new Date();
            throw error;
        }
    }
    /**
     * Обновление метрик производительности
     */
    updatePerformanceMetrics() {
        try {
            const connectionStats = this.connectionManager.getConnectionStats();
            const cacheStats = this.cacheLayer.getStats();
            this.performanceMetrics = {
                connections: {
                    total: connectionStats.totalConnections,
                    active: connectionStats.activeConnections,
                    failed: connectionStats.failedConnections
                },
                cache: {
                    hitRate: cacheStats.hitRate,
                    missRate: cacheStats.missRate,
                    evictionRate: cacheStats.evictionRate,
                    memoryUsage: cacheStats.memoryUsage
                },
                operations: {
                    commandsPerSecond: cacheStats.operationsPerSecond,
                    averageLatency: connectionStats.averageResponseTime,
                    errorRate: cacheStats.errorRate
                },
                sessions: {
                    active: 0, // TODO: получать из session manager
                    rateLimitViolations: 0,
                    blockedUsers: 0
                }
            };
            logger_1.enhancedDbLogger.debug('📊 Performance metrics обновлены', this.performanceMetrics);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка обновления performance metrics', { error });
        }
    }
    /**
     * Инициализация статуса здоровья
     */
    initializeHealthStatus() {
        this.systemHealth = {
            overall: 'HEALTHY',
            components: {
                connection: 'HEALTHY',
                cache: 'HEALTHY',
                sessions: 'HEALTHY',
                performance: 'HEALTHY'
            },
            lastCheck: new Date(),
            details: {
                connectionStats: {},
                cacheStats: {},
                sessionStats: {},
                memoryUsage: 0,
                responseTime: 0
            }
        };
    }
    /**
     * Инициализация метрик производительности
     */
    initializePerformanceMetrics() {
        this.performanceMetrics = {
            connections: { total: 0, active: 0, failed: 0 },
            cache: { hitRate: 0, missRate: 0, evictionRate: 0, memoryUsage: 0 },
            operations: { commandsPerSecond: 0, averageLatency: 0, errorRate: 0 },
            sessions: { active: 0, rateLimitViolations: 0, blockedUsers: 0 }
        };
    }
    /**
     * ПУБЛИЧНЫЕ МЕТОДЫ ДОСТУПА К КОМПОНЕНТАМ
     */
    /**
     * Получение Connection Manager
     */
    getConnectionManager() {
        this.ensureInitialized();
        return this.connectionManager;
    }
    /**
     * Получение Cache Layer
     */
    getCacheLayer() {
        this.ensureInitialized();
        return this.cacheLayer;
    }
    /**
     * Получение Critical Data Manager
     */
    getCriticalDataManager() {
        this.ensureInitialized();
        return this.criticalDataManager;
    }
    /**
     * Получение Session Manager
     */
    getSessionManager() {
        this.ensureInitialized();
        return this.sessionManager;
    }
    /**
     * Получение статуса здоровья системы
     */
    getSystemHealth() {
        return { ...this.systemHealth };
    }
    /**
     * Получение метрик производительности
     */
    getPerformanceMetrics() {
        return { ...this.performanceMetrics };
    }
    /**
     * Проверка инициализации
     */
    ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('Redis система не инициализирована. Вызовите initialize() сначала.');
        }
    }
    /**
     * Graceful shutdown всей Redis системы
     */
    async shutdown() {
        this.isShuttingDown = true;
        logger_1.enhancedDbLogger.info('🔄 Начинаем graceful shutdown Redis системы...');
        try {
            // Останавливаем таймеры
            if (this.healthCheckTimer)
                clearInterval(this.healthCheckTimer);
            if (this.metricsTimer)
                clearInterval(this.metricsTimer);
            // Завершаем компоненты в правильном порядке
            const shutdownPromises = [];
            if (this.sessionManager) {
                shutdownPromises.push(this.sessionManager.shutdown());
            }
            if (this.criticalDataManager) {
                shutdownPromises.push(this.criticalDataManager.shutdown());
            }
            if (this.cacheLayer) {
                shutdownPromises.push(this.cacheLayer.shutdown());
            }
            // Ждем завершения всех компонентов
            await Promise.all(shutdownPromises);
            // Закрываем соединения последними
            if (this.connectionManager) {
                await this.connectionManager.shutdown();
            }
            this.isInitialized = false;
            logger_1.enhancedDbLogger.info('✅ Redis система успешно завершена');
            this.emit('shutdown_completed');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка при shutdown Redis системы', { error });
            throw error;
        }
    }
}
exports.RedisMasterManager = RedisMasterManager;
exports.default = RedisMasterManager;
//# sourceMappingURL=RedisMasterManager.js.map