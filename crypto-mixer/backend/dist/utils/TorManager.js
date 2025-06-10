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
exports.torManager = exports.TorManager = void 0;
const socks_proxy_agent_1 = require("socks-proxy-agent");
const https_proxy_agent_1 = require("https-proxy-agent");
const axios_1 = __importDefault(require("axios"));
const net_1 = __importDefault(require("net"));
const events_1 = require("events");
const logger_1 = require("./logger");
class TorManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.socksAgent = null;
        this.httpsAgent = null;
        this.isInitialized = false;
        this.circuitRotationTimer = null;
        this.healthCheckTimer = null;
        this.stats = {
            requestCount: 0,
            errorCount: 0,
            circuitRotations: 0,
            lastError: null,
        };
        // Конфигурация для разных типов соединений
        this.CONNECTION_CONFIGS = {
            // Основной SOCKS порт для веб-трафика
            web: { port: 9050, isolation: 'IsolateDestAddr IsolateDestPort' },
            // Порт для blockchain соединений
            blockchain: { port: 9051, isolation: 'IsolateClientAuth IsolateSOCKSAuth' },
            // Порт для API запросов
            api: { port: 9052, isolation: 'IsolateDestAddr IsolateDestPort IsolateClientProtocol' },
        };
        this.config = {
            socksPort: 9050,
            controlPort: 9053,
            controlPassword: process.env.TOR_CONTROL_PASSWORD || '',
            enabled: process.env.TOR_ENABLED === 'true',
            circuitTimeout: 30000, // 30 секунд
            maxRetries: 3,
            retryDelay: 5000, // 5 секунд
            isolationLevel: 'full',
            ...config,
        };
        this.connectionInfo = {
            isConnected: false,
            circuitCount: 0,
            bandwidth: { read: 0, written: 0 },
            lastCircuitRotation: new Date(),
            errors: [],
        };
        // Создаем базовый axios instance
        this.axiosInstance = axios_1.default.create({
            timeout: this.config.circuitTimeout,
            headers: {
                'User-Agent': this.generateRandomUserAgent(),
            },
        });
        logger_1.logger.info('🧅 TorManager инициализирован', {
            enabled: this.config.enabled,
            socksPort: this.config.socksPort,
            controlPort: this.config.controlPort,
        });
    }
    /**
     * Инициализация Tor соединения
     */
    async initialize() {
        if (!this.config.enabled) {
            logger_1.logger.info('🧅 Tor отключен в конфигурации');
            return;
        }
        try {
            logger_1.logger.info('🧅 Инициализация Tor соединения...');
            // Проверяем доступность Tor
            await this.checkTorAvailability();
            // Создаем SOCKS агентов
            await this.createSocksAgents();
            // Получаем информацию о hidden service
            await this.getHiddenServiceInfo();
            // Запускаем мониторинг
            this.startHealthMonitoring();
            this.startCircuitRotation();
            this.isInitialized = true;
            this.connectionInfo.isConnected = true;
            logger_1.logger.info('✅ TorManager успешно инициализирован');
            this.emit('connected');
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка инициализации TorManager:', error);
            this.connectionInfo.errors.push(error.message);
            this.stats.lastError = error;
            throw error;
        }
    }
    /**
     * Проверка доступности Tor
     */
    async checkTorAvailability() {
        return new Promise((resolve, reject) => {
            const socket = new net_1.default.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                reject(new Error(`Tor SOCKS не доступен на порту ${this.config.socksPort}`));
            }, 5000);
            socket.connect(this.config.socksPort, '127.0.0.1', () => {
                clearTimeout(timeout);
                socket.destroy();
                logger_1.logger.info(`✅ Tor SOCKS доступен на порту ${this.config.socksPort}`);
                resolve();
            });
            socket.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`Tor SOCKS недоступен: ${error.message}`));
            });
        });
    }
    /**
     * Создание SOCKS агентов для разных типов соединений
     */
    async createSocksAgents() {
        try {
            // Основной SOCKS агент
            this.socksAgent = new socks_proxy_agent_1.SocksProxyAgent(`socks5://127.0.0.1:${this.config.socksPort}`);
            // HTTPS агент
            this.httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(`socks5://127.0.0.1:${this.config.socksPort}`);
            // Настраиваем axios instance с Tor агентом
            this.axiosInstance.defaults.httpAgent = this.socksAgent;
            this.axiosInstance.defaults.httpsAgent = this.httpsAgent;
            // Добавляем interceptors для логирования
            this.setupAxiosInterceptors();
            logger_1.logger.info('✅ SOCKS агенты созданы успешно');
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка создания SOCKS агентов:', error);
            throw error;
        }
    }
    /**
     * Настройка Axios interceptors
     */
    setupAxiosInterceptors() {
        // Request interceptor
        this.axiosInstance.interceptors.request.use((config) => {
            this.stats.requestCount++;
            // Добавляем случайные заголовки для маскировки
            config.headers = {
                ...config.headers,
                'Accept-Language': this.generateRandomAcceptLanguage(),
                'DNT': '1',
                'Upgrade-Insecure-Requests': '1',
            };
            logger_1.logger.debug('🧅 Tor запрос:', {
                method: config.method,
                url: config.url,
                headers: config.headers
            });
            return config;
        }, (error) => {
            this.stats.errorCount++;
            logger_1.logger.error('❌ Ошибка Tor запроса:', error);
            return Promise.reject(error);
        });
        // Response interceptor
        this.axiosInstance.interceptors.response.use((response) => {
            logger_1.logger.debug('✅ Tor ответ получен:', {
                status: response.status,
                url: response.config.url
            });
            return response;
        }, async (error) => {
            this.stats.errorCount++;
            this.stats.lastError = error;
            // Если соединение неудачное, пытаемся сменить цепочку
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                logger_1.logger.warn('🔄 Ошибка соединения, ротируем цепочку...');
                await this.rotateCircuit();
            }
            return Promise.reject(error);
        });
    }
    /**
     * Получение информации о hidden service
     */
    async getHiddenServiceInfo() {
        try {
            // Пытаемся прочитать onion адрес из файловой системы
            // В Docker это будет через volume
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            try {
                const onionAddress = await fs.readFile('/shared/onion-address.txt', 'utf-8');
                this.connectionInfo.onionAddress = onionAddress.trim();
                logger_1.logger.info(`🧅 Hidden service адрес: ${this.connectionInfo.onionAddress}`);
            }
            catch (error) {
                logger_1.logger.warn('⚠️ Не удалось получить onion адрес из файла');
            }
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка получения информации о hidden service:', error);
        }
    }
    /**
     * Ротация цепочек Tor
     */
    async rotateCircuit() {
        if (!this.isInitialized) {
            logger_1.logger.warn('⚠️ TorManager не инициализирован');
            return;
        }
        try {
            logger_1.logger.info('🔄 Начинаем ротацию Tor цепочек...');
            // Отправляем сигнал NEWNYM через control port
            await this.sendControlCommand('SIGNAL NEWNYM');
            // Ждем немного для установки новых цепочек
            await new Promise(resolve => setTimeout(resolve, 3000));
            this.connectionInfo.lastCircuitRotation = new Date();
            this.stats.circuitRotations++;
            logger_1.logger.info('✅ Ротация цепочек завершена');
            this.emit('circuitRotated');
        }
        catch (error) {
            logger_1.logger.error('❌ Ошибка ротации цепочек:', error);
            this.connectionInfo.errors.push(`Circuit rotation failed: ${error.message}`);
        }
    }
    /**
     * Отправка команды через Tor control port
     */
    async sendControlCommand(command) {
        return new Promise((resolve, reject) => {
            const socket = new net_1.default.Socket();
            let response = '';
            socket.connect(this.config.controlPort, '127.0.0.1', () => {
                // Аутентификация
                const authCommand = `AUTHENTICATE "${this.config.controlPassword}"\r\n`;
                socket.write(authCommand);
            });
            socket.on('data', (data) => {
                response += data.toString();
                if (response.includes('250 OK\r\n')) {
                    if (!response.includes(command)) {
                        // Отправляем основную команду после аутентификации
                        socket.write(`${command}\r\n`);
                    }
                    else {
                        // Команда выполнена
                        socket.write('QUIT\r\n');
                        socket.end();
                        resolve(response);
                    }
                }
                else if (response.includes('515') || response.includes('550')) {
                    reject(new Error(`Control command failed: ${response}`));
                }
            });
            socket.on('error', (error) => {
                reject(error);
            });
            socket.on('timeout', () => {
                socket.destroy();
                reject(new Error('Control connection timeout'));
            });
            socket.setTimeout(10000);
        });
    }
    /**
     * Запуск мониторинга здоровья Tor
     */
    startHealthMonitoring() {
        this.healthCheckTimer = setInterval(async () => {
            try {
                await this.performHealthCheck();
            }
            catch (error) {
                logger_1.logger.error('❌ Ошибка проверки здоровья Tor:', error);
            }
        }, 30000); // Каждые 30 секунд
    }
    /**
     * Запуск автоматической ротации цепочек
     */
    startCircuitRotation() {
        // Ротируем цепочки каждые 10 минут
        this.circuitRotationTimer = setInterval(async () => {
            await this.rotateCircuit();
        }, 10 * 60 * 1000); // 10 минут
    }
    /**
     * Проверка здоровья Tor соединения
     */
    async performHealthCheck() {
        try {
            // Проверяем доступность SOCKS порта
            await this.checkTorAvailability();
            // Получаем статистику цепочек
            const circuitInfo = await this.sendControlCommand('GETINFO circuit-status');
            const circuits = circuitInfo.split('\n').filter(line => line.includes('BUILT'));
            this.connectionInfo.circuitCount = circuits.length;
            // Получаем статистику трафика
            const trafficInfo = await this.sendControlCommand('GETINFO traffic/read traffic/written');
            const trafficLines = trafficInfo.split('\n');
            for (const line of trafficLines) {
                if (line.includes('traffic/read=')) {
                    this.connectionInfo.bandwidth.read = parseInt(line.split('=')[1]) || 0;
                }
                if (line.includes('traffic/written=')) {
                    this.connectionInfo.bandwidth.written = parseInt(line.split('=')[1]) || 0;
                }
            }
            // Очищаем старые ошибки
            this.connectionInfo.errors = this.connectionInfo.errors.slice(-5);
            this.emit('healthCheck', this.connectionInfo);
        }
        catch (error) {
            this.connectionInfo.isConnected = false;
            this.connectionInfo.errors.push(`Health check failed: ${error.message}`);
            this.emit('healthCheckFailed', error);
        }
    }
    /**
     * Получение специализированного axios instance для определенного типа соединения
     */
    getAxiosInstance(connectionType = 'web') {
        if (!this.config.enabled || !this.isInitialized) {
            // Возвращаем обычный axios instance без Tor
            return axios_1.default.create({
                timeout: this.config.circuitTimeout,
                headers: {
                    'User-Agent': this.generateRandomUserAgent(),
                },
            });
        }
        const config = this.CONNECTION_CONFIGS[connectionType];
        const socksAgent = new socks_proxy_agent_1.SocksProxyAgent(`socks5://127.0.0.1:${config.port}`);
        const httpsAgent = new https_proxy_agent_1.HttpsProxyAgent(`socks5://127.0.0.1:${config.port}`);
        return axios_1.default.create({
            timeout: this.config.circuitTimeout,
            httpAgent: socksAgent,
            httpsAgent: httpsAgent,
            headers: {
                'User-Agent': this.generateRandomUserAgent(),
                'Accept-Language': this.generateRandomAcceptLanguage(),
                'DNT': '1',
            },
        });
    }
    /**
     * Генерация случайного User-Agent
     */
    generateRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }
    /**
     * Генерация случайного Accept-Language заголовка
     */
    generateRandomAcceptLanguage() {
        const languages = [
            'en-US,en;q=0.9',
            'en-GB,en;q=0.9',
            'ru-RU,ru;q=0.9,en;q=0.8',
            'de-DE,de;q=0.9,en;q=0.8',
            'fr-FR,fr;q=0.9,en;q=0.8',
        ];
        return languages[Math.floor(Math.random() * languages.length)];
    }
    /**
     * Получение статистики работы
     */
    getStats() {
        return {
            ...this.stats,
            connectionInfo: this.connectionInfo,
            isEnabled: this.config.enabled,
            isInitialized: this.isInitialized,
        };
    }
    /**
     * Проверка доступности через Tor
     */
    async testConnection(url = 'https://check.torproject.org/api/ip') {
        try {
            const response = await this.axiosInstance.get(url);
            logger_1.logger.info('✅ Tor тест соединения успешен:', response.data);
            return response.data;
        }
        catch (error) {
            logger_1.logger.error('❌ Tor тест соединения неудачен:', error);
            throw error;
        }
    }
    /**
     * Остановка TorManager
     */
    async shutdown() {
        logger_1.logger.info('🛑 Останавливаем TorManager...');
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        if (this.circuitRotationTimer) {
            clearInterval(this.circuitRotationTimer);
        }
        this.isInitialized = false;
        this.connectionInfo.isConnected = false;
        this.emit('disconnected');
        logger_1.logger.info('✅ TorManager остановлен');
    }
}
exports.TorManager = TorManager;
// Создаем глобальный экземпляр TorManager
exports.torManager = new TorManager();
// Инициализируем при запуске модуля
if (process.env.NODE_ENV !== 'test') {
    exports.torManager.initialize().catch(error => {
        logger_1.logger.error('❌ Ошибка инициализации TorManager:', error);
    });
}
//# sourceMappingURL=TorManager.js.map