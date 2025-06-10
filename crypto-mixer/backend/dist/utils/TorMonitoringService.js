"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.torMonitoringService = exports.TorMonitoringService = void 0;
const events_1 = require("events");
const TorManager_1 = require("./TorManager");
const TorBlockchainClient_1 = require("../blockchain/TorBlockchainClient");
const logger_1 = require("./logger");
const net_1 = __importDefault(require("net"));
class TorMonitoringService extends events_1.EventEmitter {
    constructor() {
        super();
        this.services = new Map();
        this.monitoringInterval = null;
        this.deepCheckInterval = null;
        this.isRunning = false;
        this.checkIntervalMs = 30000; // 30 секунд
        this.deepCheckIntervalMs = 300000; // 5 минут
        this.startTime = new Date();
        // Список onion адресов для проверки
        this.ONION_SERVICES = [
            {
                name: 'mixer_web',
                type: 'hidden_service',
                expectedPorts: [80, 443],
                path: '/var/lib/tor/mixer_web/hostname',
            },
            {
                name: 'mixer_api',
                type: 'hidden_service',
                expectedPorts: [80, 443],
                path: '/var/lib/tor/mixer_api/hostname',
            },
            {
                name: 'mixer_admin',
                type: 'hidden_service',
                expectedPorts: [80, 443],
                path: '/var/lib/tor/mixer_admin/hostname',
            },
            {
                name: 'mixer_monitoring',
                type: 'hidden_service',
                expectedPorts: [80],
                path: '/var/lib/tor/mixer_monitoring/hostname',
            },
        ];
        // SOCKS порты для проверки
        this.SOCKS_PORTS = [9050, 9051, 9052, 9054, 9055, 9056, 9057, 9058];
        this.stats = {
            services: [],
            overallHealth: 'unknown',
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageResponseTime: 0,
            circuitRotations: 0,
            lastCircuitRotation: new Date(),
            hiddenServiceUptime: 0,
        };
        this.initializeServices();
        logger_1.logger.info('🧅 TorMonitoringService инициализирован');
    }
    /**
     * Инициализация списка сервисов для мониторинга
     */
    initializeServices() {
        // Инициализируем hidden services
        for (const service of this.ONION_SERVICES) {
            this.services.set(service.name, {
                name: service.name,
                type: service.type,
                status: 'unknown',
                port: service.expectedPorts[0],
                lastCheck: new Date(),
                responseTime: 0,
                errorCount: 0,
                uptime: 0,
                details: {
                    expectedPorts: service.expectedPorts,
                    hostnameFile: service.path,
                },
            });
        }
        // Инициализируем SOCKS порты
        for (const port of this.SOCKS_PORTS) {
            this.services.set(`socks_${port}`, {
                name: `socks_${port}`,
                type: 'socks_proxy',
                status: 'unknown',
                port,
                lastCheck: new Date(),
                responseTime: 0,
                errorCount: 0,
                uptime: 0,
                details: {},
            });
        }
        // Инициализируем control port
        this.services.set('control_port', {
            name: 'control_port',
            type: 'control_port',
            status: 'unknown',
            port: 9053,
            lastCheck: new Date(),
            responseTime: 0,
            errorCount: 0,
            uptime: 0,
            details: {},
        });
        // Инициализируем blockchain client
        this.services.set('blockchain_client', {
            name: 'blockchain_client',
            type: 'blockchain_client',
            status: 'unknown',
            port: 0,
            lastCheck: new Date(),
            responseTime: 0,
            errorCount: 0,
            uptime: 0,
            details: {},
        });
    }
    /**
     * Запуск мониторинга
     */
    start() {
        if (this.isRunning) {
            logger_1.logger.warn('⚠️ TorMonitoringService уже запущен');
            return;
        }
        this.isRunning = true;
        this.startTime = new Date();
        // Запускаем базовый мониторинг
        this.monitoringInterval = setInterval(async () => {
            await this.performBasicHealthCheck();
        }, this.checkIntervalMs);
        // Запускаем глубокую проверку
        this.deepCheckInterval = setInterval(async () => {
            await this.performDeepHealthCheck();
        }, this.deepCheckIntervalMs);
        // Сразу выполняем первую проверку
        this.performBasicHealthCheck();
        logger_1.logger.info('🧅 TorMonitoringService запущен');
        this.emit('started');
    }
    /**
     * Базовая проверка здоровья всех сервисов
     */
    async performBasicHealthCheck() {
        try {
            logger_1.logger.debug('🔍 Выполняем базовую проверку Tor сервисов...');
            const checkPromises = [];
            // Проверяем SOCKS порты
            for (const port of this.SOCKS_PORTS) {
                checkPromises.push(this.checkSocksPort(port));
            }
            // Проверяем control port
            checkPromises.push(this.checkControlPort());
            // Проверяем hidden services
            for (const service of this.ONION_SERVICES) {
                checkPromises.push(this.checkHiddenService(service.name));
            }
            // Проверяем blockchain client
            checkPromises.push(this.checkBlockchainClient());
            await Promise.allSettled(checkPromises);
            // Обновляем общую статистику
            this.updateOverallStats();
            // Отправляем уведомления если нужно
            this.checkForAlerts();
            this.emit('healthCheckCompleted', this.getStats());
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка базовой проверки Tor:', error);
        }
    }
    /**
     * Глубокая проверка с тестированием соединений
     */
    async performDeepHealthCheck() {
        try {
            logger_1.logger.info('🔍 Выполняем глубокую проверку Tor сервисов...');
            // Тестируем реальные соединения через onion адреса
            await this.testOnionConnections();
            // Проверяем качество цепочек
            await this.analyzeCircuitQuality();
            // Тестируем blockchain соединения
            await this.testBlockchainConnections();
            // Проверяем производительность
            await this.performanceAnalysis();
            this.emit('deepCheckCompleted', this.getStats());
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка глубокой проверки Tor:', error);
        }
    }
    /**
     * Проверка SOCKS порта
     */
    async checkSocksPort(port) {
        const serviceName = `socks_${port}`;
        const service = this.services.get(serviceName);
        if (!service)
            return;
        const startTime = Date.now();
        try {
            await new Promise((resolve, reject) => {
                const socket = new net_1.default.Socket();
                const timeout = setTimeout(() => {
                    socket.destroy();
                    reject(new Error('Timeout'));
                }, 5000);
                socket.connect(port, '127.0.0.1', () => {
                    clearTimeout(timeout);
                    socket.destroy();
                    resolve();
                });
                socket.on('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
            const responseTime = Date.now() - startTime;
            this.updateServiceStatus(serviceName, 'healthy', responseTime);
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateServiceStatus(serviceName, 'critical', responseTime, error.message);
        }
    }
    /**
     * Проверка control порта
     */
    async checkControlPort() {
        const serviceName = 'control_port';
        const startTime = Date.now();
        try {
            // Пытаемся подключиться к control порту и выполнить команду
            const result = await TorManager_1.torManager.testConnection();
            const responseTime = Date.now() - startTime;
            this.updateServiceStatus(serviceName, 'healthy', responseTime, result);
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateServiceStatus(serviceName, 'critical', responseTime, error.message);
        }
    }
    /**
     * Проверка hidden service
     */
    async checkHiddenService(serviceName) {
        const service = this.services.get(serviceName);
        if (!service)
            return;
        const startTime = Date.now();
        try {
            // Пытаемся прочитать onion адрес
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            let onionAddress;
            try {
                onionAddress = await fs.readFile(service.details.hostnameFile, 'utf-8');
                onionAddress = onionAddress.trim();
                service.onionAddress = onionAddress;
            }
            catch (error) {
                throw new Error(`Не удалось прочитать hostname: ${error.message}`);
            }
            // Проверяем доступность через внешние средства (если возможно)
            const responseTime = Date.now() - startTime;
            this.updateServiceStatus(serviceName, 'healthy', responseTime, { onionAddress });
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateServiceStatus(serviceName, 'warning', responseTime, error.message);
        }
    }
    /**
     * Проверка blockchain client
     */
    async checkBlockchainClient() {
        const serviceName = 'blockchain_client';
        const startTime = Date.now();
        try {
            const healthCheck = await TorBlockchainClient_1.torBlockchainClient.healthCheck();
            const responseTime = Date.now() - startTime;
            // Проверяем сколько валют работают нормально
            const currencies = Object.keys(healthCheck);
            const healthyCurrencies = currencies.filter(currency => healthCheck[currency].status === 'healthy');
            let status;
            if (healthyCurrencies.length === currencies.length) {
                status = 'healthy';
            }
            else if (healthyCurrencies.length > currencies.length / 2) {
                status = 'warning';
            }
            else {
                status = 'critical';
            }
            this.updateServiceStatus(serviceName, status, responseTime, {
                totalCurrencies: currencies.length,
                healthyCurrencies: healthyCurrencies.length,
                details: healthCheck,
            });
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            this.updateServiceStatus(serviceName, 'critical', responseTime, error.message);
        }
    }
    /**
     * Тестирование соединений через onion адреса
     */
    async testOnionConnections() {
        logger_1.logger.debug('🧅 Тестируем onion соединения...');
        for (const [serviceName, service] of this.services) {
            if (service.type === 'hidden_service' && service.onionAddress) {
                try {
                    // Создаем Tor axios instance
                    const torAxios = TorManager_1.torManager.getAxiosInstance('web');
                    // Тестируем базовую доступность
                    const testUrl = `http://${service.onionAddress}`;
                    const startTime = Date.now();
                    await torAxios.get(testUrl, {
                        timeout: 10000,
                        validateStatus: () => true, // Принимаем любой статус
                    });
                    const responseTime = Date.now() - startTime;
                    logger_1.logger.debug(`✅ ${serviceName} onion доступен: ${responseTime}ms`);
                    // Обновляем детали сервиса
                    service.details.onionConnectivity = 'accessible';
                    service.details.lastOnionTest = new Date();
                    service.details.onionResponseTime = responseTime;
                }
                catch (error) {
                    logger_1.logger.warn(`⚠️ ${serviceName} onion недоступен:`, error.message);
                    service.details.onionConnectivity = 'inaccessible';
                    service.details.lastOnionError = error.message;
                }
            }
        }
    }
    /**
     * Анализ качества цепочек
     */
    async analyzeCircuitQuality() {
        try {
            logger_1.logger.debug('🔄 Анализируем качество Tor цепочек...');
            const torStats = TorManager_1.torManager.getStats();
            // Обновляем статистику цепочек
            this.stats.circuitRotations = torStats.connectionInfo.circuitCount || 0;
            this.stats.lastCircuitRotation = torStats.connectionInfo.lastCircuitRotation;
            // Если цепочек мало, предупреждаем
            if (torStats.connectionInfo.circuitCount < 3) {
                this.emit('alert', {
                    level: 'warning',
                    message: `Мало активных цепочек: ${torStats.connectionInfo.circuitCount}`,
                    service: 'circuit_quality',
                });
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка анализа цепочек:', error);
        }
    }
    /**
     * Тестирование blockchain соединений
     */
    async testBlockchainConnections() {
        try {
            logger_1.logger.debug('⛓️ Тестируем blockchain соединения...');
            const blockchainStats = TorBlockchainClient_1.torBlockchainClient.getStats();
            for (const [symbol, currencyStats] of Object.entries(blockchainStats)) {
                // Проверяем статистику ошибок
                const totalRequests = currencyStats.endpointStats.reduce((sum, stat) => sum + stat.requestCount, 0);
                const totalErrors = currencyStats.endpointStats.reduce((sum, stat) => sum + stat.errorCount, 0);
                const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
                if (errorRate > 20) { // Более 20% ошибок
                    this.emit('alert', {
                        level: 'warning',
                        message: `Высокий уровень ошибок для ${symbol}: ${errorRate.toFixed(1)}%`,
                        service: 'blockchain_client',
                        currency: symbol,
                    });
                }
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка тестирования blockchain:', error);
        }
    }
    /**
     * Анализ производительности
     */
    async performanceAnalysis() {
        logger_1.logger.debug('📊 Анализируем производительность Tor...');
        const services = Array.from(this.services.values());
        const healthyServices = services.filter(s => s.status === 'healthy');
        const criticalServices = services.filter(s => s.status === 'critical');
        // Средняя время отклика
        const avgResponseTime = services.reduce((sum, service) => sum + service.responseTime, 0) / services.length;
        this.stats.averageResponseTime = avgResponseTime;
        // Время работы
        const uptimeMs = Date.now() - this.startTime.getTime();
        this.stats.hiddenServiceUptime = uptimeMs / 1000; // в секундах
        // Если производительность плохая
        if (avgResponseTime > 10000) { // Более 10 секунд
            this.emit('alert', {
                level: 'warning',
                message: `Медленная производительность: ${avgResponseTime}ms`,
                service: 'performance',
            });
        }
        // Если много критических сервисов
        if (criticalServices.length > services.length / 3) {
            this.emit('alert', {
                level: 'critical',
                message: `Много неработающих сервисов: ${criticalServices.length}/${services.length}`,
                service: 'overall_health',
            });
        }
    }
    /**
     * Обновление статуса сервиса
     */
    updateServiceStatus(serviceName, status, responseTime, details) {
        const service = this.services.get(serviceName);
        if (!service)
            return;
        const wasHealthy = service.status === 'healthy';
        service.status = status;
        service.lastCheck = new Date();
        service.responseTime = responseTime;
        service.details = { ...service.details, ...details };
        if (status === 'critical') {
            service.errorCount++;
        }
        // Если сервис восстановился
        if (!wasHealthy && status === 'healthy') {
            this.emit('serviceRecovered', { serviceName, service });
            logger_1.logger.info(`✅ Сервис ${serviceName} восстановлен`);
        }
        // Если сервис упал
        if (wasHealthy && status === 'critical') {
            this.emit('serviceFailed', { serviceName, service });
            logger_1.logger.warn(`❌ Сервис ${serviceName} недоступен`);
        }
    }
    /**
     * Обновление общей статистики
     */
    updateOverallStats() {
        const services = Array.from(this.services.values());
        const healthyCount = services.filter(s => s.status === 'healthy').length;
        const warningCount = services.filter(s => s.status === 'warning').length;
        const criticalCount = services.filter(s => s.status === 'critical').length;
        // Определяем общее состояние здоровья
        if (criticalCount > services.length / 2) {
            this.stats.overallHealth = 'critical';
        }
        else if (warningCount + criticalCount > services.length / 3) {
            this.stats.overallHealth = 'degraded';
        }
        else {
            this.stats.overallHealth = 'healthy';
        }
        this.stats.services = services;
    }
    /**
     * Проверка условий для алертов
     */
    checkForAlerts() {
        const services = Array.from(this.services.values());
        const criticalServices = services.filter(s => s.status === 'critical');
        // Критический алерт если много сервисов недоступно
        if (criticalServices.length >= 3) {
            this.emit('alert', {
                level: 'critical',
                message: `Множественные сбои сервисов: ${criticalServices.map(s => s.name).join(', ')}`,
                service: 'multiple_failures',
                affectedServices: criticalServices.map(s => s.name),
            });
        }
        // Проверяем критически важные сервисы
        const essentialServices = ['mixer_web', 'socks_9050', 'control_port'];
        const failedEssential = essentialServices.filter(name => {
            const service = this.services.get(name);
            return service && service.status === 'critical';
        });
        if (failedEssential.length > 0) {
            this.emit('alert', {
                level: 'critical',
                message: `Критические сервисы недоступны: ${failedEssential.join(', ')}`,
                service: 'essential_failures',
                affectedServices: failedEssential,
            });
        }
    }
    /**
     * Получение статистики
     */
    getStats() {
        return { ...this.stats };
    }
    /**
     * Получение детальной информации о сервисе
     */
    getServiceDetails(serviceName) {
        return this.services.get(serviceName) || null;
    }
    /**
     * Принудительная ротация всех цепочек
     */
    async forceCircuitRotation() {
        try {
            logger_1.logger.info('🔄 Принудительная ротация всех цепочек...');
            await TorManager_1.torManager.rotateCircuit();
            await TorBlockchainClient_1.torBlockchainClient.healthCheck();
            this.stats.circuitRotations++;
            this.stats.lastCircuitRotation = new Date();
            this.emit('circuitRotationForced');
            logger_1.logger.info('✅ Принудительная ротация завершена');
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка принудительной ротации:', error);
            throw error;
        }
    }
    /**
     * Остановка мониторинга
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        if (this.deepCheckInterval) {
            clearInterval(this.deepCheckInterval);
            this.deepCheckInterval = null;
        }
        this.isRunning = false;
        logger_1.logger.info('🛑 TorMonitoringService остановлен');
        this.emit('stopped');
    }
}
exports.TorMonitoringService = TorMonitoringService;
// Создаем глобальный экземпляр
exports.torMonitoringService = new TorMonitoringService();
// Запускаем мониторинг при загрузке модуля
if (process.env.NODE_ENV !== 'test') {
    exports.torMonitoringService.start();
    // Обработчики событий для логирования
    exports.torMonitoringService.on('alert', (alert) => {
        if (alert.level === 'critical') {
            logger_1.logger.error('🚨 Критический алерт Tor:', alert);
        }
        else {
            logger_1.logger.warn('⚠️ Предупреждение Tor:', alert);
        }
    });
}
//# sourceMappingURL=TorMonitoringService.js.map