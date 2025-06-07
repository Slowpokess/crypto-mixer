"use strict";
/**
 * Мощный Redis Connection Manager для продакшн криптомиксера
 *
 * Обеспечивает:
 * - Connection pooling с автоматическим масштабированием
 * - Cluster support для высокой доступности
 * - Automatic failover и reconnection
 * - Health monitoring и performance metrics
 * - Read/Write splitting для оптимизации
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisConnectionManager = void 0;
const ioredis_1 = __importStar(require("ioredis"));
const logger_1 = require("../logger");
const events_1 = require("events");
/**
 * Продвинутый Redis Connection Manager
 */
class RedisConnectionManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.readConnections = [];
        this.connectionPool = [];
        this.isConnected = false;
        this.isShuttingDown = false;
        this.responseTimes = [];
        // Failover management
        this.currentMasterIndex = 0;
        this.failoverInProgress = false;
        this.failoverAttempts = 0;
        this.config = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            db: parseInt(process.env.REDIS_DB || '0'),
            keyPrefix: process.env.REDIS_KEY_PREFIX || 'mixer:',
            enableCluster: false,
            clusterNodes: [],
            maxConnections: 20,
            minConnections: 5,
            connectionTimeout: 10000,
            commandTimeout: 5000,
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            enableReadWriteSplit: false,
            readOnlyNodes: [],
            readWriteRatio: 0.8,
            enableHealthChecks: true,
            healthCheckInterval: 30000,
            healthCheckTimeout: 5000,
            enableKeepAlive: true,
            enableCompression: false,
            lazyConnect: true,
            enableOfflineQueue: true,
            enableAutomaticFailover: true,
            failoverTimeout: 10000,
            maxFailoverAttempts: 3,
            ...config
        };
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            idleConnections: 0,
            failedConnections: 0,
            commandsExecuted: 0,
            commandsFailed: 0,
            averageResponseTime: 0,
            memoryUsage: 0,
            hitRate: 0,
            uptime: 0
        };
        this.healthStatus = {
            isHealthy: false,
            responseTime: 0,
            memoryUsage: 0,
            connectedClients: 0
        };
        logger_1.enhancedDbLogger.info('🔗 RedisConnectionManager инициализирован', {
            config: {
                host: this.config.host,
                port: this.config.port,
                enableCluster: this.config.enableCluster,
                enableReadWriteSplit: this.config.enableReadWriteSplit,
                maxConnections: this.config.maxConnections
            }
        });
    }
    /**
     * Подключение к Redis с полной инициализацией
     */
    async connect() {
        if (this.isConnected) {
            logger_1.enhancedDbLogger.warn('⚠️ Redis уже подключен');
            return;
        }
        try {
            logger_1.enhancedDbLogger.info('🚀 Подключаемся к Redis...');
            if (this.config.enableCluster) {
                await this.connectToCluster();
            }
            else {
                await this.connectToSingleInstance();
            }
            // Настраиваем Read/Write splitting если включено
            if (this.config.enableReadWriteSplit) {
                await this.setupReadWriteSplitting();
            }
            // Инициализируем connection pool
            await this.initializeConnectionPool();
            // Запускаем health monitoring
            if (this.config.enableHealthChecks) {
                this.startHealthMonitoring();
            }
            this.isConnected = true;
            logger_1.enhancedDbLogger.info('✅ Redis успешно подключен');
            this.emit('connected');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка подключения к Redis', { error });
            throw error;
        }
    }
    /**
     * Подключение к Redis Cluster
     */
    async connectToCluster() {
        const clusterOptions = {
            retryDelayOnFailover: this.config.retryDelayOnFailover,
            enableOfflineQueue: this.config.enableOfflineQueue,
            lazyConnect: this.config.lazyConnect,
            keyPrefix: this.config.keyPrefix,
            redisOptions: {
                password: this.config.password,
                connectTimeout: this.config.connectionTimeout,
                commandTimeout: this.config.commandTimeout,
                maxRetriesPerRequest: this.config.maxRetriesPerRequest,
                keepAlive: this.config.enableKeepAlive ? 30000 : 0
            }
        };
        this.masterConnection = new ioredis_1.Cluster(this.config.clusterNodes || [{ host: this.config.host, port: this.config.port }], clusterOptions);
        await this.setupConnectionEventHandlers(this.masterConnection);
        logger_1.enhancedDbLogger.info('✅ Redis Cluster подключен', {
            nodes: this.config.clusterNodes?.length || 1
        });
    }
    /**
     * Подключение к одиночному Redis инстансу
     */
    async connectToSingleInstance() {
        const redisOptions = {
            host: this.config.host,
            port: this.config.port,
            password: this.config.password,
            db: this.config.db,
            keyPrefix: this.config.keyPrefix,
            connectTimeout: this.config.connectionTimeout,
            commandTimeout: this.config.commandTimeout,
            maxRetriesPerRequest: this.config.maxRetriesPerRequest,
            lazyConnect: this.config.lazyConnect,
            enableOfflineQueue: this.config.enableOfflineQueue,
            keepAlive: this.config.enableKeepAlive ? 30000 : 0
        };
        this.masterConnection = new ioredis_1.default(redisOptions);
        await this.setupConnectionEventHandlers(this.masterConnection);
        logger_1.enhancedDbLogger.info('✅ Redis Single Instance подключен');
    }
    /**
     * Настройка Read/Write splitting
     */
    async setupReadWriteSplitting() {
        if (!this.config.readOnlyNodes || this.config.readOnlyNodes.length === 0) {
            logger_1.enhancedDbLogger.warn('⚠️ ReadWrite splitting включен, но read-only nodes не настроены');
            return;
        }
        logger_1.enhancedDbLogger.info('🔀 Настраиваем Read/Write splitting...');
        // Создаем write connection (обычно master)
        this.writeConnection = this.masterConnection;
        // Создаем read connections
        for (const node of this.config.readOnlyNodes) {
            const readConnection = new ioredis_1.default({
                host: node.host,
                port: node.port,
                password: this.config.password,
                db: this.config.db,
                keyPrefix: this.config.keyPrefix,
                connectTimeout: this.config.connectionTimeout,
                commandTimeout: this.config.commandTimeout,
                lazyConnect: this.config.lazyConnect,
                readOnly: true // Важно: только для чтения
            });
            await this.setupConnectionEventHandlers(readConnection);
            this.readConnections.push(readConnection);
        }
        logger_1.enhancedDbLogger.info('✅ Read/Write splitting настроен', {
            readNodes: this.readConnections.length,
            writeNodes: 1
        });
    }
    /**
     * Инициализация connection pool
     */
    async initializeConnectionPool() {
        logger_1.enhancedDbLogger.info('🏊‍♂️ Инициализируем connection pool...');
        const poolSize = Math.min(this.config.maxConnections, 10); // Ограничиваем для начала
        for (let i = 0; i < poolSize; i++) {
            const connection = new ioredis_1.default({
                host: this.config.host,
                port: this.config.port,
                password: this.config.password,
                db: this.config.db,
                keyPrefix: this.config.keyPrefix,
                connectTimeout: this.config.connectionTimeout,
                lazyConnect: this.config.lazyConnect
            });
            await this.setupConnectionEventHandlers(connection);
            this.connectionPool.push(connection);
        }
        this.stats.totalConnections = this.connectionPool.length;
        this.stats.idleConnections = this.connectionPool.length;
        logger_1.enhancedDbLogger.info('✅ Connection pool инициализирован', {
            poolSize: this.connectionPool.length
        });
    }
    /**
     * Настройка обработчиков событий соединения
     */
    async setupConnectionEventHandlers(connection) {
        connection.on('connect', () => {
            logger_1.enhancedDbLogger.info('🔗 Redis connection established');
            this.stats.activeConnections++;
        });
        connection.on('ready', () => {
            logger_1.enhancedDbLogger.info('✅ Redis connection ready');
            this.healthStatus.isHealthy = true;
        });
        connection.on('error', (error) => {
            logger_1.enhancedDbLogger.error('❌ Redis connection error', { error });
            this.stats.failedConnections++;
            this.handleConnectionError(error);
        });
        connection.on('close', () => {
            logger_1.enhancedDbLogger.warn('⚠️ Redis connection closed');
            this.stats.activeConnections = Math.max(0, this.stats.activeConnections - 1);
        });
        connection.on('reconnecting', () => {
            logger_1.enhancedDbLogger.info('🔄 Redis reconnecting...');
        });
        connection.on('end', () => {
            logger_1.enhancedDbLogger.info('🔚 Redis connection ended');
        });
        // Для cluster-специфичных событий
        if (connection instanceof ioredis_1.Cluster) {
            connection.on('node error', (error, node) => {
                logger_1.enhancedDbLogger.error('❌ Cluster node error', { error, node });
            });
        }
    }
    /**
     * Получение оптимального соединения для операции
     */
    getConnection(isReadOperation = false) {
        if (!this.isConnected || !this.masterConnection) {
            throw new Error('Redis не подключен');
        }
        // Если Read/Write splitting выключен, используем master
        if (!this.config.enableReadWriteSplit) {
            return this.masterConnection;
        }
        // Для write операций всегда используем write connection
        if (!isReadOperation) {
            return this.writeConnection || this.masterConnection;
        }
        // Для read операций выбираем между read и write connections
        if (this.readConnections.length > 0 && Math.random() < this.config.readWriteRatio) {
            // Используем round-robin для read connections
            const randomIndex = Math.floor(Math.random() * this.readConnections.length);
            return this.readConnections[randomIndex];
        }
        return this.masterConnection;
    }
    /**
     * Выполнение команды с мониторингом производительности
     */
    async executeCommand(command, args, isReadOperation = false) {
        const startTime = Date.now();
        try {
            const connection = this.getConnection(isReadOperation);
            // Выполняем команду
            const result = await connection[command](...args);
            const responseTime = Date.now() - startTime;
            this.recordResponseTime(responseTime);
            this.stats.commandsExecuted++;
            return result;
        }
        catch (error) {
            this.stats.commandsFailed++;
            logger_1.enhancedDbLogger.error('❌ Ошибка выполнения Redis команды', {
                command,
                args: args.slice(0, 3), // Логируем только первые 3 аргумента
                error
            });
            throw error;
        }
    }
    /**
     * Запуск мониторинга здоровья
     */
    startHealthMonitoring() {
        this.healthCheckTimer = setInterval(async () => {
            if (!this.isShuttingDown) {
                await this.performHealthCheck();
            }
        }, this.config.healthCheckInterval);
        logger_1.enhancedDbLogger.info('💓 Redis health monitoring запущен');
    }
    /**
     * Проверка здоровья Redis
     */
    async performHealthCheck() {
        if (!this.masterConnection)
            return;
        const startTime = Date.now();
        try {
            // Выполняем простую команду PING
            await Promise.race([
                this.masterConnection.ping(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeout))
            ]);
            const responseTime = Date.now() - startTime;
            // Получаем информацию о сервере
            const info = await this.masterConnection.info('memory');
            const memoryUsage = this.parseMemoryUsage(info);
            const clientsInfo = await this.masterConnection.info('clients');
            const connectedClients = this.parseConnectedClients(clientsInfo);
            this.healthStatus = {
                isHealthy: true,
                responseTime,
                memoryUsage,
                connectedClients,
                lastError: undefined
            };
            // Для cluster получаем дополнительную информацию
            if (this.masterConnection instanceof ioredis_1.Cluster) {
                try {
                    const clusterInfo = await this.masterConnection.cluster('info');
                    this.healthStatus.clusterStatus = this.parseClusterStatus(clusterInfo);
                }
                catch (error) {
                    // Игнорируем ошибки cluster info
                }
            }
        }
        catch (error) {
            this.healthStatus = {
                isHealthy: false,
                responseTime: Date.now() - startTime,
                memoryUsage: 0,
                connectedClients: 0,
                lastError: error.message
            };
            logger_1.enhancedDbLogger.error('❌ Redis health check failed', { error });
            // Пытаемся восстановить соединение если включен автоматический failover
            if (this.config.enableAutomaticFailover && !this.failoverInProgress) {
                await this.attemptFailover();
            }
        }
    }
    /**
     * Попытка failover при проблемах с соединением
     */
    async attemptFailover() {
        if (this.failoverInProgress || this.failoverAttempts >= this.config.maxFailoverAttempts) {
            return;
        }
        this.failoverInProgress = true;
        this.failoverAttempts++;
        logger_1.enhancedDbLogger.warn('🔄 Начинаем Redis failover', {
            attempt: this.failoverAttempts,
            maxAttempts: this.config.maxFailoverAttempts
        });
        try {
            // Переподключаемся к Redis
            await this.reconnect();
            this.failoverInProgress = false;
            this.failoverAttempts = 0;
            logger_1.enhancedDbLogger.info('✅ Redis failover успешен');
            this.emit('failover_success');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Redis failover failed', { error });
            setTimeout(() => {
                this.failoverInProgress = false;
            }, this.config.failoverTimeout);
            this.emit('failover_failed', error);
        }
    }
    /**
     * Переподключение к Redis
     */
    async reconnect() {
        logger_1.enhancedDbLogger.info('🔄 Переподключаемся к Redis...');
        try {
            // Закрываем текущие соединения
            if (this.masterConnection) {
                await this.masterConnection.disconnect();
            }
            // Переподключаемся
            await this.connect();
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка переподключения к Redis', { error });
            throw error;
        }
    }
    /**
     * Запись времени ответа для статистики
     */
    recordResponseTime(time) {
        this.responseTimes.push(time);
        // Оставляем только последние 100 измерений
        if (this.responseTimes.length > 100) {
            this.responseTimes.shift();
        }
        // Пересчитываем среднее время ответа
        this.stats.averageResponseTime =
            this.responseTimes.reduce((sum, t) => sum + t, 0) / this.responseTimes.length;
    }
    /**
     * Обработка ошибок соединения
     */
    handleConnectionError(error) {
        this.healthStatus.isHealthy = false;
        this.healthStatus.lastError = error.message;
        this.emit('connection_error', error);
        // Если включен автоматический failover, пытаемся восстановиться
        if (this.config.enableAutomaticFailover) {
            setImmediate(() => this.attemptFailover());
        }
    }
    /**
     * Парсинг использования памяти из Redis INFO
     */
    parseMemoryUsage(info) {
        const match = info.match(/used_memory:(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }
    /**
     * Парсинг количества подключенных клиентов
     */
    parseConnectedClients(info) {
        const match = info.match(/connected_clients:(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }
    /**
     * Парсинг статуса кластера
     */
    parseClusterStatus(info) {
        const match = info.match(/cluster_state:(\w+)/);
        return match ? match[1] : 'unknown';
    }
    /**
     * Получение статистики соединений
     */
    getConnectionStats() {
        this.stats.idleConnections = this.connectionPool.length - this.stats.activeConnections;
        this.stats.uptime = process.uptime();
        return { ...this.stats };
    }
    /**
     * Получение статуса здоровья
     */
    getHealthStatus() {
        return { ...this.healthStatus };
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.isShuttingDown = true;
        logger_1.enhancedDbLogger.info('🔄 Начинаем graceful shutdown Redis connections...');
        try {
            // Останавливаем health monitoring
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
            }
            // Закрываем все соединения
            const disconnectPromises = [];
            if (this.masterConnection) {
                disconnectPromises.push(this.masterConnection.disconnect());
            }
            if (this.writeConnection && this.writeConnection !== this.masterConnection) {
                disconnectPromises.push(this.writeConnection.disconnect());
            }
            for (const readConnection of this.readConnections) {
                disconnectPromises.push(readConnection.disconnect());
            }
            for (const poolConnection of this.connectionPool) {
                disconnectPromises.push(poolConnection.disconnect());
            }
            await Promise.all(disconnectPromises);
            this.isConnected = false;
            logger_1.enhancedDbLogger.info('✅ Redis connections успешно закрыты');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка при закрытии Redis connections', { error });
            throw error;
        }
    }
}
exports.RedisConnectionManager = RedisConnectionManager;
exports.default = RedisConnectionManager;
//# sourceMappingURL=RedisConnectionManager.js.map