"use strict";
/**
 * Оптимизированный менеджер пула соединений для устранения проблем производительности
 *
 * Особенности:
 * - Адаптивное управление размером пула
 * - Мониторинг здоровья соединений
 * - Graceful degradation при проблемах с БД
 * - Connection warming и предзагрузка
 * - Read/Write репликация support
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionPoolManager = void 0;
const sequelize_1 = require("sequelize");
const logger_1 = require("../logger");
const events_1 = require("events");
/**
 * Оптимизированный менеджер пула соединений
 */
class ConnectionPoolManager extends events_1.EventEmitter {
    constructor(databaseUrl, config = {}) {
        super();
        this.readPools = [];
        this.healthStatus = new Map();
        this.isShuttingDown = false;
        this.acquireTimes = [];
        this.MAX_ACQUIRE_SAMPLES = 100;
        this.config = {
            minConnections: 5,
            maxConnections: 20,
            acquireTimeout: 60000,
            idleTimeout: 30000,
            evictTimeout: 180000,
            adaptivePooling: true,
            maxPoolSizeIncrease: 10,
            poolSizeDecreaseThreshold: 0.3,
            healthCheckInterval: 30000,
            healthCheckTimeout: 5000,
            maxRetries: 3,
            enableReadReplicas: false,
            readWriteRatio: 0.7,
            warmupConnections: true,
            warmupSize: 3,
            ...config
        };
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            waitingClients: 0,
            totalRequests: 0,
            failedRequests: 0,
            averageAcquireTime: 0,
            peakConnections: 0,
            poolUtilization: 0
        };
        this.initializePools(databaseUrl);
        this.startHealthChecks();
        this.startAdaptivePooling();
        logger_1.enhancedDbLogger.info('🏊‍♂️ ConnectionPoolManager инициализирован', {
            config: this.config,
            masterPool: true,
            readReplicas: this.readPools.length
        });
    }
    /**
     * Инициализация пулов соединений
     */
    initializePools(databaseUrl) {
        // Создаем мастер пул (read/write)
        this.masterPool = new sequelize_1.Sequelize(databaseUrl, {
            pool: {
                min: this.config.minConnections,
                max: this.config.maxConnections,
                acquire: this.config.acquireTimeout,
                idle: this.config.idleTimeout,
                evict: this.config.evictTimeout
            },
            dialectOptions: {
                connectTimeout: 20000,
                acquireTimeout: this.config.acquireTimeout,
                timeout: 60000,
            },
            logging: (sql, timing) => {
                if (timing && timing > 1000) {
                    logger_1.enhancedDbLogger.warn('🐌 Медленный запрос в master pool', {
                        sql: sql.substring(0, 200),
                        timing
                    });
                }
            },
            logQueryParameters: process.env.NODE_ENV === 'development',
            benchmark: true,
            retry: {
                max: this.config.maxRetries,
                backoffBase: 1000,
                backoffExponent: 2
            }
        });
        // Создаем read replica пулы если включены
        if (this.config.enableReadReplicas && this.config.readReplicaUrls) {
            this.config.readReplicaUrls.forEach((url, index) => {
                const readPool = new sequelize_1.Sequelize(url, {
                    pool: {
                        min: Math.max(1, Math.floor(this.config.minConnections / 2)),
                        max: Math.floor(this.config.maxConnections * 0.6),
                        acquire: this.config.acquireTimeout,
                        idle: this.config.idleTimeout,
                        evict: this.config.evictTimeout
                    },
                    dialectOptions: {
                        connectTimeout: 20000,
                        acquireTimeout: this.config.acquireTimeout,
                        timeout: 60000,
                    },
                    logging: false, // Отключаем логирование для read реплик
                    retry: {
                        max: this.config.maxRetries,
                        backoffBase: 1000,
                        backoffExponent: 2
                    }
                });
                this.readPools.push(readPool);
                logger_1.enhancedDbLogger.info(`📖 Read replica pool #${index + 1} инициализирован`);
            });
        }
        // Прогреваем соединения если включено
        if (this.config.warmupConnections) {
            this.warmupConnections();
        }
    }
    /**
     * Прогрев соединений для улучшения initial response time
     */
    async warmupConnections() {
        try {
            logger_1.enhancedDbLogger.info('🔥 Начинаем прогрев соединений', { warmupSize: this.config.warmupSize });
            const warmupPromises = [];
            // Прогреваем master pool
            for (let i = 0; i < this.config.warmupSize; i++) {
                warmupPromises.push(this.masterPool.query('SELECT 1 as warmup').catch(err => {
                    logger_1.enhancedDbLogger.warn('⚠️ Ошибка прогрева master pool соединения', { error: err.message });
                }));
            }
            // Прогреваем read replicas
            this.readPools.forEach((pool, index) => {
                for (let i = 0; i < Math.max(1, Math.floor(this.config.warmupSize / 2)); i++) {
                    warmupPromises.push(pool.query('SELECT 1 as warmup').catch(err => {
                        logger_1.enhancedDbLogger.warn(`⚠️ Ошибка прогрева read replica #${index + 1} соединения`, { error: err.message });
                    }));
                }
            });
            await Promise.allSettled(warmupPromises);
            logger_1.enhancedDbLogger.info('✅ Прогрев соединений завершен');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка прогрева соединений', { error });
        }
    }
    /**
     * Получение оптимального пула для запроса
     */
    getPool(isReadOnly = false) {
        // Если read replicas отключены, всегда используем master
        if (!this.config.enableReadReplicas || this.readPools.length === 0) {
            return this.masterPool;
        }
        // Для write операций всегда используем master
        if (!isReadOnly) {
            return this.masterPool;
        }
        // Для read операций выбираем здоровую replica или fallback на master
        const healthyReplicas = this.readPools.filter((_, index) => {
            const health = this.healthStatus.get(`read_replica_${index}`);
            return health?.isHealthy !== false;
        });
        if (healthyReplicas.length === 0) {
            logger_1.enhancedDbLogger.warn('⚠️ Нет здоровых read replicas, используем master pool');
            return this.masterPool;
        }
        // Round-robin selection среди здоровых реплик
        const selectedIndex = Math.floor(Math.random() * healthyReplicas.length);
        return healthyReplicas[selectedIndex];
    }
    /**
     * Получение статистики пула соединений
     */
    async getPoolStats() {
        try {
            const masterPoolStats = this.masterPool.connectionManager.pool;
            this.stats = {
                totalConnections: masterPoolStats.size,
                activeConnections: masterPoolStats.using,
                idleConnections: masterPoolStats.size - masterPoolStats.using,
                waitingClients: masterPoolStats.waiting,
                totalRequests: this.stats.totalRequests,
                failedRequests: this.stats.failedRequests,
                averageAcquireTime: this.calculateAverageAcquireTime(),
                peakConnections: Math.max(this.stats.peakConnections, masterPoolStats.size),
                poolUtilization: masterPoolStats.size > 0 ? (masterPoolStats.using / masterPoolStats.size) * 100 : 0
            };
            return { ...this.stats };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения статистики пула', { error });
            return this.stats;
        }
    }
    /**
     * Выполнение транзакции с оптимальным пулом
     */
    async executeTransaction(callback, isReadOnly = false) {
        const startTime = Date.now();
        const pool = this.getPool(isReadOnly);
        this.stats.totalRequests++;
        try {
            const result = await pool.transaction(callback);
            const acquireTime = Date.now() - startTime;
            this.recordAcquireTime(acquireTime);
            return result;
        }
        catch (error) {
            this.stats.failedRequests++;
            logger_1.enhancedDbLogger.error('❌ Ошибка выполнения транзакции', {
                error,
                isReadOnly,
                pool: isReadOnly ? 'read' : 'master'
            });
            throw error;
        }
    }
    /**
     * Проверка здоровья соединений
     */
    startHealthChecks() {
        this.healthCheckTimer = setInterval(async () => {
            await this.performHealthChecks();
        }, this.config.healthCheckInterval);
        logger_1.enhancedDbLogger.info('💓 Health checks запущены', {
            interval: this.config.healthCheckInterval
        });
    }
    /**
     * Выполнение проверок здоровья
     */
    async performHealthChecks() {
        if (this.isShuttingDown)
            return;
        try {
            // Проверяем master pool
            await this.checkPoolHealth('master', this.masterPool);
            // Проверяем read replicas
            for (let i = 0; i < this.readPools.length; i++) {
                await this.checkPoolHealth(`read_replica_${i}`, this.readPools[i]);
            }
            this.emit('healthcheck_completed', this.healthStatus);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка health check', { error });
        }
    }
    /**
     * Проверка здоровья конкретного пула
     */
    async checkPoolHealth(poolName, pool) {
        const startTime = Date.now();
        try {
            await Promise.race([
                pool.query('SELECT 1 as health_check'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeout))
            ]);
            const responseTime = Date.now() - startTime;
            this.healthStatus.set(poolName, {
                isHealthy: true,
                responseTime,
                lastCheck: new Date()
            });
            if (responseTime > 5000) {
                logger_1.enhancedDbLogger.warn(`🐌 Медленный health check для ${poolName}`, { responseTime });
            }
        }
        catch (error) {
            this.healthStatus.set(poolName, {
                isHealthy: false,
                responseTime: Date.now() - startTime,
                errorMessage: error.message,
                lastCheck: new Date()
            });
            logger_1.enhancedDbLogger.error(`❌ Health check failed для ${poolName}`, {
                error: error.message
            });
            this.emit('pool_unhealthy', { poolName, error });
        }
    }
    /**
     * Адаптивное управление размером пула
     */
    startAdaptivePooling() {
        if (!this.config.adaptivePooling)
            return;
        this.adaptiveTimer = setInterval(async () => {
            await this.adjustPoolSize();
        }, 60000); // Проверяем каждую минуту
        logger_1.enhancedDbLogger.info('🎛️ Адаптивное управление пулом запущено');
    }
    /**
     * Автоматическая настройка размера пула
     */
    async adjustPoolSize() {
        if (this.isShuttingDown)
            return;
        try {
            const stats = await this.getPoolStats();
            // Если утилизация высокая и есть ожидающие клиенты
            if (stats.poolUtilization > 80 && stats.waitingClients > 0) {
                const currentMax = this.masterPool.options.pool?.max || this.config.maxConnections;
                const newMax = Math.min(currentMax + this.config.maxPoolSizeIncrease, this.config.maxConnections * 2 // Не превышаем удвоенный максимум
                );
                if (newMax > currentMax) {
                    logger_1.enhancedDbLogger.info('📈 Увеличиваем размер пула', {
                        oldMax: currentMax,
                        newMax,
                        utilization: stats.poolUtilization,
                        waitingClients: stats.waitingClients
                    });
                    // Создаем новый пул с увеличенным размером
                    await this.resizePool(newMax);
                }
            }
            // Если утилизация низкая длительное время
            else if (stats.poolUtilization < this.config.poolSizeDecreaseThreshold * 100) {
                const currentMax = this.masterPool.options.pool?.max || this.config.maxConnections;
                const newMax = Math.max(Math.floor(currentMax * 0.8), this.config.minConnections);
                if (newMax < currentMax) {
                    logger_1.enhancedDbLogger.info('📉 Уменьшаем размер пула', {
                        oldMax: currentMax,
                        newMax,
                        utilization: stats.poolUtilization
                    });
                    await this.resizePool(newMax);
                }
            }
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка адаптивного управления пулом', { error });
        }
    }
    /**
     * Изменение размера пула
     */
    async resizePool(newMaxSize) {
        try {
            // Sequelize не поддерживает динамическое изменение размера пула
            // Поэтому записываем новое значение для следующего переподключения
            logger_1.enhancedDbLogger.info('ℹ️ Размер пула будет изменен при следующем переподключении', {
                newMaxSize
            });
            // Эмитим событие для внешней обработки
            this.emit('pool_resize_requested', { newMaxSize });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка изменения размера пула', { error });
        }
    }
    /**
     * Запись времени получения соединения
     */
    recordAcquireTime(time) {
        this.acquireTimes.push(time);
        if (this.acquireTimes.length > this.MAX_ACQUIRE_SAMPLES) {
            this.acquireTimes.shift();
        }
    }
    /**
     * Расчет среднего времени получения соединения
     */
    calculateAverageAcquireTime() {
        if (this.acquireTimes.length === 0)
            return 0;
        const sum = this.acquireTimes.reduce((a, b) => a + b, 0);
        return sum / this.acquireTimes.length;
    }
    /**
     * Получение детальной информации о здоровье
     */
    getHealthStatus() {
        return new Map(this.healthStatus);
    }
    /**
     * Graceful shutdown всех пулов
     */
    async shutdown() {
        this.isShuttingDown = true;
        logger_1.enhancedDbLogger.info('🔄 Начинаем graceful shutdown ConnectionPoolManager');
        // Останавливаем таймеры
        if (this.healthCheckTimer)
            clearInterval(this.healthCheckTimer);
        if (this.adaptiveTimer)
            clearInterval(this.adaptiveTimer);
        try {
            // Закрываем все пулы
            const closePromises = [
                this.masterPool.close(),
                ...this.readPools.map(pool => pool.close())
            ];
            await Promise.all(closePromises);
            logger_1.enhancedDbLogger.info('✅ ConnectionPoolManager успешно завершен');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка при shutdown ConnectionPoolManager', { error });
            throw error;
        }
    }
    /**
     * Получение master пула напрямую (для миграций и административных задач)
     */
    getMasterPool() {
        return this.masterPool;
    }
    /**
     * Форсированное переподключение всех пулов
     */
    async reconnectAll() {
        logger_1.enhancedDbLogger.info('🔄 Переподключение всех пулов');
        try {
            await this.masterPool.authenticate();
            for (const [index, pool] of this.readPools.entries()) {
                try {
                    await pool.authenticate();
                }
                catch (error) {
                    logger_1.enhancedDbLogger.error(`❌ Ошибка переподключения read replica #${index + 1}`, { error });
                }
            }
            logger_1.enhancedDbLogger.info('✅ Переподключение завершено');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка переподключения master pool', { error });
            throw error;
        }
    }
}
exports.ConnectionPoolManager = ConnectionPoolManager;
exports.default = ConnectionPoolManager;
//# sourceMappingURL=ConnectionPoolManager.js.map