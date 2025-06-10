"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionFailoverManager = exports.ConnectionFailoverManager = void 0;
const events_1 = require("events");
const TorManager_1 = require("./TorManager");
const TorMonitoringService_1 = require("./TorMonitoringService");
const logger_1 = require("./logger");
const axios_1 = __importDefault(require("axios"));
class ConnectionFailoverManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.strategies = new Map();
        this.attempts = [];
        this.currentConnections = new Map();
        this.healthCheckTimer = null;
        this.maxAttemptsHistory = 1000; // Максимум записей в истории
        // Предустановленные стратегии для разных типов запросов
        this.DEFAULT_STRATEGIES = {
            web: {
                primary: 'tor',
                fallback: 'direct',
                timeout: 30000,
                retries: 3,
                healthCheckInterval: 60000, // 1 минута
                autoRecovery: true,
            },
            api: {
                primary: 'tor',
                fallback: 'direct',
                timeout: 15000,
                retries: 2,
                healthCheckInterval: 30000, // 30 секунд
                autoRecovery: true,
            },
            blockchain: {
                primary: 'tor',
                fallback: 'direct',
                timeout: 45000,
                retries: 3,
                healthCheckInterval: 120000, // 2 минуты
                autoRecovery: true,
            },
            admin: {
                primary: 'tor',
                fallback: 'none', // Админ панель только через Tor
                timeout: 20000,
                retries: 5,
                healthCheckInterval: 30000,
                autoRecovery: true,
            },
            monitoring: {
                primary: 'direct', // Мониторинг может идти напрямую
                fallback: 'tor',
                timeout: 10000,
                retries: 2,
                healthCheckInterval: 15000,
                autoRecovery: false,
            },
        };
        this.stats = {
            totalAttempts: 0,
            torAttempts: 0,
            directAttempts: 0,
            torSuccessRate: 100,
            directSuccessRate: 100,
            averageResponseTime: { tor: 0, direct: 0 },
            currentStrategy: 'tor',
            lastFailover: null,
            failoverCount: 0,
            recoveryCount: 0,
        };
        this.initializeStrategies();
        this.setupEventListeners();
        this.startHealthChecking();
        logger_1.logger.info('🔄 ConnectionFailoverManager инициализирован');
    }
    /**
     * Инициализация стратегий соединений
     */
    initializeStrategies() {
        for (const [type, strategy] of Object.entries(this.DEFAULT_STRATEGIES)) {
            this.strategies.set(type, strategy);
            this.currentConnections.set(type, strategy.primary);
        }
        logger_1.logger.info('✅ Стратегии соединений инициализированы:', Object.keys(this.DEFAULT_STRATEGIES));
    }
    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        // Слушаем события от Tor мониторинга
        TorMonitoringService_1.torMonitoringService.on('serviceFailed', (event) => {
            this.handleTorServiceFailure(event);
        });
        TorMonitoringService_1.torMonitoringService.on('serviceRecovered', (event) => {
            this.handleTorServiceRecovery(event);
        });
        TorMonitoringService_1.torMonitoringService.on('alert', (alert) => {
            if (alert.level === 'critical') {
                this.handleCriticalTorAlert(alert);
            }
        });
        // Слушаем события от TorManager
        TorManager_1.torManager.on('disconnected', () => {
            this.handleTorDisconnection();
        });
        TorManager_1.torManager.on('connected', () => {
            this.handleTorReconnection();
        });
    }
    /**
     * Запуск периодической проверки здоровья соединений
     */
    startHealthChecking() {
        this.healthCheckTimer = setInterval(async () => {
            await this.performHealthCheck();
        }, 30000); // Каждые 30 секунд
        logger_1.logger.info('🔍 Запущена периодическая проверка здоровья соединений');
    }
    /**
     * Получение оптимального axios instance с автоматическим переключением
     */
    async getAxiosInstance(requestType = 'web', endpoint) {
        const strategy = this.strategies.get(requestType) || this.strategies.get('web');
        const currentConnection = this.currentConnections.get(requestType) || strategy.primary;
        // Пытаемся использовать текущую стратегию
        try {
            const instance = await this.createAxiosInstance(currentConnection, requestType);
            // Проверяем работоспособность соединения
            if (endpoint) {
                await this.testConnection(instance, endpoint, currentConnection);
            }
            return { instance, connectionType: currentConnection };
        }
        catch (error) {
            logger_1.logger.warn(`⚠️ ${requestType} соединение через ${currentConnection} неудачно:`, error.message);
            // Пытаемся переключиться на fallback
            return await this.attemptFailover(requestType, endpoint, error);
        }
    }
    /**
     * Создание axios instance для определенного типа соединения
     */
    async createAxiosInstance(connectionType, requestType) {
        const strategy = this.strategies.get(requestType);
        if (connectionType === 'tor') {
            // Проверяем доступность Tor
            const torStats = TorManager_1.torManager.getStats();
            if (!torStats.isInitialized || !torStats.connectionInfo.isConnected) {
                throw new Error('Tor недоступен');
            }
            return TorManager_1.torManager.getAxiosInstance(requestType);
        }
        else {
            // Создаем обычный axios instance
            return axios_1.default.create({
                timeout: strategy.timeout,
                headers: {
                    'User-Agent': this.generateUserAgent(),
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
        }
    }
    /**
     * Попытка переключения на резервную схему
     */
    async attemptFailover(requestType, endpoint, originalError) {
        const strategy = this.strategies.get(requestType);
        const currentConnection = this.currentConnections.get(requestType);
        if (strategy.fallback === 'none') {
            throw new Error(`Fallback недоступен для ${requestType}: ${originalError?.message}`);
        }
        const fallbackConnection = strategy.fallback;
        logger_1.logger.warn(`🔄 Переключаемся с ${currentConnection} на ${fallbackConnection} для ${requestType}`);
        try {
            const instance = await this.createAxiosInstance(fallbackConnection, requestType);
            // Тестируем fallback соединение
            if (endpoint) {
                await this.testConnection(instance, endpoint, fallbackConnection);
            }
            // Обновляем текущую стратегию
            this.currentConnections.set(requestType, fallbackConnection);
            this.stats.failoverCount++;
            this.stats.lastFailover = new Date();
            this.stats.currentStrategy = fallbackConnection;
            logger_1.logger.info(`✅ Успешно переключились на ${fallbackConnection} для ${requestType}`);
            this.emit('failover', {
                requestType,
                from: currentConnection,
                to: fallbackConnection,
                reason: originalError?.message,
            });
            return { instance, connectionType: fallbackConnection };
        }
        catch (fallbackError) {
            logger_1.logger.error(`❌ Fallback соединение также неудачно для ${requestType}:`, fallbackError.message);
            this.emit('failoverFailed', {
                requestType,
                primaryError: originalError?.message,
                fallbackError: fallbackError.message,
            });
            throw new Error(`Все соединения неудачны для ${requestType}: ${fallbackError.message}`);
        }
    }
    /**
     * Тестирование соединения
     */
    async testConnection(instance, endpoint, connectionType) {
        const startTime = Date.now();
        try {
            // Простой GET запрос для проверки
            await instance.get(endpoint, {
                timeout: 5000,
                validateStatus: (status) => status < 500, // Принимаем 4xx как успех
            });
            const responseTime = Date.now() - startTime;
            this.recordAttempt(endpoint, connectionType, true, responseTime);
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.recordAttempt(endpoint, connectionType, false, responseTime, error.message);
            throw error;
        }
    }
    /**
     * Запись попытки соединения в статистику
     */
    recordAttempt(endpoint, strategy, success, responseTime, error) {
        const attempt = {
            timestamp: new Date(),
            strategy,
            success,
            responseTime,
            error,
            endpoint,
        };
        this.attempts.push(attempt);
        // Ограничиваем размер истории
        if (this.attempts.length > this.maxAttemptsHistory) {
            this.attempts.shift();
        }
        // Обновляем статистику
        this.updateStats();
    }
    /**
     * Обновление статистики
     */
    updateStats() {
        this.stats.totalAttempts = this.attempts.length;
        const torAttempts = this.attempts.filter(a => a.strategy === 'tor');
        const directAttempts = this.attempts.filter(a => a.strategy === 'direct');
        this.stats.torAttempts = torAttempts.length;
        this.stats.directAttempts = directAttempts.length;
        // Вычисляем успешность
        const torSuccessful = torAttempts.filter(a => a.success).length;
        const directSuccessful = directAttempts.filter(a => a.success).length;
        this.stats.torSuccessRate = torAttempts.length > 0 ?
            (torSuccessful / torAttempts.length) * 100 : 100;
        this.stats.directSuccessRate = directAttempts.length > 0 ?
            (directSuccessful / directAttempts.length) * 100 : 100;
        // Вычисляем среднее время отклика
        const torResponseTimes = torAttempts.map(a => a.responseTime);
        const directResponseTimes = directAttempts.map(a => a.responseTime);
        this.stats.averageResponseTime.tor = torResponseTimes.length > 0 ?
            torResponseTimes.reduce((sum, time) => sum + time, 0) / torResponseTimes.length : 0;
        this.stats.averageResponseTime.direct = directResponseTimes.length > 0 ?
            directResponseTimes.reduce((sum, time) => sum + time, 0) / directResponseTimes.length : 0;
    }
    /**
     * Обработка сбоя Tor сервиса
     */
    handleTorServiceFailure(event) {
        logger_1.logger.warn('🚨 Обнаружен сбой Tor сервиса:', event.serviceName);
        // Переключаем критически важные соединения на direct
        const criticalTypes = ['web', 'api', 'blockchain'];
        for (const type of criticalTypes) {
            const strategy = this.strategies.get(type);
            const currentConnection = this.currentConnections.get(type);
            if (strategy && currentConnection === 'tor' && strategy.fallback !== 'none') {
                this.currentConnections.set(type, strategy.fallback);
                logger_1.logger.info(`🔄 Переключили ${type} с tor на ${strategy.fallback}`);
                this.emit('automaticFailover', {
                    requestType: type,
                    reason: `Tor service failure: ${event.serviceName}`,
                });
            }
        }
    }
    /**
     * Обработка восстановления Tor сервиса
     */
    handleTorServiceRecovery(event) {
        logger_1.logger.info('✅ Tor сервис восстановлен:', event.serviceName);
        // Возвращаемся к Tor для соединений с autoRecovery
        for (const [type, strategy] of this.strategies) {
            if (strategy.autoRecovery && strategy.primary === 'tor') {
                const currentConnection = this.currentConnections.get(type);
                if (currentConnection !== 'tor') {
                    this.currentConnections.set(type, 'tor');
                    this.stats.recoveryCount++;
                    logger_1.logger.info(`🔄 Восстановили ${type} соединение на tor`);
                    this.emit('automaticRecovery', {
                        requestType: type,
                        reason: `Tor service recovered: ${event.serviceName}`,
                    });
                }
            }
        }
    }
    /**
     * Обработка критических алертов Tor
     */
    handleCriticalTorAlert(alert) {
        logger_1.logger.error('🚨 Критический алерт Tor:', alert.message);
        // Экстренное переключение всех соединений на direct
        if (alert.service === 'multiple_failures' || alert.service === 'essential_failures') {
            this.emergencyFailoverAll();
        }
    }
    /**
     * Экстренное переключение всех соединений
     */
    emergencyFailoverAll() {
        logger_1.logger.warn('🚨 ЭКСТРЕННОЕ ПЕРЕКЛЮЧЕНИЕ всех соединений на direct');
        for (const [type, strategy] of this.strategies) {
            if (strategy.fallback !== 'none') {
                this.currentConnections.set(type, 'direct');
            }
        }
        this.emit('emergencyFailover', {
            reason: 'Critical Tor infrastructure failure',
            timestamp: new Date(),
        });
    }
    /**
     * Обработка отключения Tor
     */
    handleTorDisconnection() {
        logger_1.logger.warn('🔌 Tor соединение потеряно');
        // Переключаем все на direct где возможно
        for (const [type, strategy] of this.strategies) {
            if (strategy.fallback === 'direct') {
                this.currentConnections.set(type, 'direct');
            }
        }
    }
    /**
     * Обработка переподключения Tor
     */
    handleTorReconnection() {
        logger_1.logger.info('🔌 Tor соединение восстановлено');
        // Возвращаемся к Tor где включено autoRecovery
        for (const [type, strategy] of this.strategies) {
            if (strategy.autoRecovery && strategy.primary === 'tor') {
                this.currentConnections.set(type, 'tor');
            }
        }
    }
    /**
     * Периодическая проверка здоровья соединений
     */
    async performHealthCheck() {
        try {
            logger_1.logger.debug('🔍 Выполняем проверку здоровья соединений...');
            // Тестируем текущие соединения
            for (const [type, connectionType] of this.currentConnections) {
                try {
                    const instance = await this.createAxiosInstance(connectionType, type);
                    // Простой тест - запрос к google.com или другому надежному хосту
                    const testUrl = connectionType === 'tor' ?
                        'https://check.torproject.org/api/ip' :
                        'https://httpbin.org/ip';
                    await this.testConnection(instance, testUrl, connectionType);
                }
                catch (error) {
                    logger_1.logger.warn(`⚠️ Health check неудачен для ${type}:${connectionType}:`, error.message);
                    // Если текущее соединение не работает, пытаемся переключиться
                    const strategy = this.strategies.get(type);
                    if (strategy && strategy.fallback !== 'none' && connectionType !== strategy.fallback) {
                        this.currentConnections.set(type, strategy.fallback);
                        logger_1.logger.info(`🔄 Health check переключил ${type} на ${strategy.fallback}`);
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка health check:', error);
        }
    }
    /**
     * Генерация случайного User-Agent
     */
    generateUserAgent() {
        const agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        ];
        return agents[Math.floor(Math.random() * agents.length)];
    }
    /**
     * Принудительное переключение типа соединения
     */
    forceConnectionType(requestType, connectionType) {
        const strategy = this.strategies.get(requestType);
        if (!strategy) {
            throw new Error(`Неизвестный тип запроса: ${requestType}`);
        }
        if (connectionType === 'direct' && strategy.fallback === 'none') {
            throw new Error(`Direct соединения запрещены для ${requestType}`);
        }
        this.currentConnections.set(requestType, connectionType);
        logger_1.logger.info(`🔧 Принудительно установлено ${connectionType} для ${requestType}`);
        this.emit('manualOverride', { requestType, connectionType });
    }
    /**
     * Получение текущих стратегий
     */
    getCurrentConnections() {
        return new Map(this.currentConnections);
    }
    /**
     * Получение статистики
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Получение истории попыток
     */
    getAttemptHistory(limit = 100) {
        return this.attempts.slice(-limit);
    }
    /**
     * Остановка менеджера
     */
    shutdown() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        logger_1.logger.info('🛑 ConnectionFailoverManager остановлен');
        this.emit('shutdown');
    }
}
exports.ConnectionFailoverManager = ConnectionFailoverManager;
// Создаем глобальный экземпляр
exports.connectionFailoverManager = new ConnectionFailoverManager();
//# sourceMappingURL=ConnectionFailoverManager.js.map