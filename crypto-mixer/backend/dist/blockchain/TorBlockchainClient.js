"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.torBlockchainClient = exports.TorBlockchainClient = void 0;
const socks_proxy_agent_1 = require("socks-proxy-agent");
const events_1 = require("events");
const TorManager_1 = require("../utils/TorManager");
const logger_1 = __importDefault(require("../utils/logger"));
// Импорт расширения типов для axios metadata
require("../types/axios-metadata");
class TorBlockchainClient extends events_1.EventEmitter {
    constructor() {
        super();
        this.currencies = new Map();
        this.axiosInstances = new Map();
        this.rotationTimers = new Map();
        this.endpointStats = new Map();
        this.isInitialized = false;
        this.initializeCurrencyConfigs();
        logger_1.default.info('🧅 TorBlockchainClient инициализирован');
    }
    /**
     * Инициализация конфигураций для всех поддерживаемых криптовалют
     */
    initializeCurrencyConfigs() {
        // Bitcoin конфигурация
        this.currencies.set('BTC', {
            symbol: 'BTC',
            name: 'Bitcoin',
            socksPort: 9051,
            timeout: 30000,
            maxRetries: 3,
            circuitRotationInterval: 300000, // 5 минут
            endpoints: [
                // Tor onion services для Bitcoin
                {
                    url: 'http://bitcoinonion1234567890abcdef.onion:8332',
                    type: 'rpc',
                    priority: 1,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'http://bitcoinonion0987654321fedcba.onion:8332',
                    type: 'rpc',
                    priority: 2,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                // Публичные узлы через Tor
                {
                    url: 'https://bitcoin.blockstream.info/api',
                    type: 'rest',
                    priority: 3,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://blockchair.com/bitcoin/raw/node',
                    type: 'rest',
                    priority: 4,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
            ],
        });
        // Ethereum конфигурация
        this.currencies.set('ETH', {
            symbol: 'ETH',
            name: 'Ethereum',
            socksPort: 9054, // Отдельный порт для ETH
            timeout: 25000,
            maxRetries: 3,
            circuitRotationInterval: 240000, // 4 минуты
            endpoints: [
                {
                    url: 'http://ethereumonion1234567890abcdef.onion:8545',
                    type: 'rpc',
                    priority: 1,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://mainnet.infura.io/v3/' + process.env.INFURA_API_KEY,
                    type: 'rpc',
                    priority: 2,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://eth-mainnet.alchemyapi.io/v2/' + process.env.ALCHEMY_API_KEY,
                    type: 'rpc',
                    priority: 3,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://api.etherscan.io/api',
                    type: 'rest',
                    priority: 4,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
            ],
        });
        // Solana конфигурация
        this.currencies.set('SOL', {
            symbol: 'SOL',
            name: 'Solana',
            socksPort: 9055, // Отдельный порт для SOL
            timeout: 20000,
            maxRetries: 3,
            circuitRotationInterval: 180000, // 3 минуты
            endpoints: [
                {
                    url: 'http://solanaonion1234567890abcdef.onion:8899',
                    type: 'rpc',
                    priority: 1,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://api.mainnet-beta.solana.com',
                    type: 'rpc',
                    priority: 2,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://solana-api.projectserum.com',
                    type: 'rpc',
                    priority: 3,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
            ],
        });
        // Litecoin конфигурация
        this.currencies.set('LTC', {
            symbol: 'LTC',
            name: 'Litecoin',
            socksPort: 9056,
            timeout: 25000,
            maxRetries: 3,
            circuitRotationInterval: 300000,
            endpoints: [
                {
                    url: 'http://litecoinionion1234567890abcdef.onion:9332',
                    type: 'rpc',
                    priority: 1,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://litecoinspace.org/api',
                    type: 'rest',
                    priority: 2,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
            ],
        });
        // Monero конфигурация (особенно важна анонимность)
        this.currencies.set('XMR', {
            symbol: 'XMR',
            name: 'Monero',
            socksPort: 9057,
            timeout: 30000,
            maxRetries: 3,
            circuitRotationInterval: 120000, // 2 минуты - чаще ротируем для XMR
            endpoints: [
                {
                    url: 'http://moneroonion1234567890abcdef.onion:18081',
                    type: 'rpc',
                    priority: 1,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'http://moneroonion0987654321fedcba.onion:18081',
                    type: 'rpc',
                    priority: 2,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'http://node.moneroworld.com:18089/json_rpc',
                    type: 'rpc',
                    priority: 3,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
            ],
        });
        // Zcash конфигурация
        this.currencies.set('ZEC', {
            symbol: 'ZEC',
            name: 'Zcash',
            socksPort: 9058,
            timeout: 25000,
            maxRetries: 3,
            circuitRotationInterval: 240000,
            endpoints: [
                {
                    url: 'http://zcashonion1234567890abcdef.onion:8232',
                    type: 'rpc',
                    priority: 1,
                    isOnion: true,
                    errorCount: 0,
                    responseTime: 0
                },
                {
                    url: 'https://api.zcha.in',
                    type: 'rest',
                    priority: 2,
                    isOnion: false,
                    errorCount: 0,
                    responseTime: 0
                },
            ],
        });
    }
    /**
     * Инициализация всех Tor соединений
     */
    async initialize() {
        try {
            logger_1.default.info('🧅 Инициализация TorBlockchainClient...');
            // Создаем axios instances для каждой валюты
            for (const [symbol, config] of this.currencies) {
                await this.createAxiosInstanceForCurrency(symbol, config);
                this.startCircuitRotationForCurrency(symbol, config);
            }
            this.isInitialized = true;
            logger_1.default.info('✅ TorBlockchainClient инициализирован для всех валют');
            this.emit('initialized');
        }
        catch (error) {
            logger_1.default.error('❌ Ошибка инициализации TorBlockchainClient:', error);
            throw error;
        }
    }
    /**
     * Создание axios instance для конкретной валюты
     */
    async createAxiosInstanceForCurrency(symbol, config) {
        try {
            // Создаем изолированный SOCKS агент для этой валюты
            const socksAgent = new socks_proxy_agent_1.SocksProxyAgent(`socks5://127.0.0.1:${config.socksPort}`);
            const axiosInstance = TorManager_1.torManager.getAxiosInstance('blockchain');
            axiosInstance.defaults.httpAgent = socksAgent;
            axiosInstance.defaults.httpsAgent = socksAgent;
            axiosInstance.defaults.timeout = config.timeout;
            // Добавляем специальные заголовки для каждой валюты
            axiosInstance.defaults.headers['User-Agent'] = this.generateCurrencySpecificUserAgent(symbol);
            axiosInstance.defaults.headers['Accept'] = 'application/json';
            axiosInstance.defaults.headers['Content-Type'] = 'application/json';
            // Настраиваем interceptors для мониторинга
            this.setupCurrencyInterceptors(axiosInstance, symbol);
            this.axiosInstances.set(symbol, axiosInstance);
            logger_1.default.info(`✅ Axios instance создан для ${symbol} на порту ${config.socksPort}`);
        }
        catch (error) {
            logger_1.default.error(`❌ Ошибка создания axios instance для ${symbol}:`, error);
            throw error;
        }
    }
    /**
     * Настройка interceptors для мониторинга конкретной валюты
     */
    setupCurrencyInterceptors(axiosInstance, symbol) {
        axiosInstance.interceptors.request.use((config) => {
            const startTime = Date.now();
            config.metadata = { startTime, symbol };
            logger_1.default.debug(`🧅 ${symbol} запрос:`, {
                method: config.method,
                url: config.url
            });
            return config;
        }, (error) => {
            logger_1.default.error(`❌ ${symbol} ошибка запроса:`, error);
            return Promise.reject(error);
        });
        axiosInstance.interceptors.response.use((response) => {
            const endTime = Date.now();
            const responseTime = endTime - (response.config.metadata?.startTime || endTime);
            // Обновляем статистику endpoint'а
            this.updateEndpointStats(symbol, response.config.url || '', responseTime, true);
            logger_1.default.debug(`✅ ${symbol} ответ:`, {
                status: response.status,
                responseTime: `${responseTime}ms`,
                url: response.config.url
            });
            return response;
        }, async (error) => {
            const endTime = Date.now();
            const responseTime = error.config?.metadata ?
                endTime - error.config.metadata.startTime : 0;
            // Обновляем статистику с ошибкой
            this.updateEndpointStats(symbol, error.config?.url, responseTime, false);
            // Если это критическая ошибка, ротируем цепочку
            if (this.isCriticalError(error)) {
                logger_1.default.warn(`🔄 ${symbol} критическая ошибка, ротируем цепочку...`);
                await this.rotateCircuitForCurrency(symbol);
            }
            return Promise.reject(error);
        });
    }
    /**
     * Запуск автоматической ротации цепочек для валюты
     */
    startCircuitRotationForCurrency(symbol, config) {
        const timer = setInterval(async () => {
            await this.rotateCircuitForCurrency(symbol);
        }, config.circuitRotationInterval);
        this.rotationTimers.set(symbol, timer);
        logger_1.default.info(`🔄 Автоматическая ротация настроена для ${symbol} (${config.circuitRotationInterval}ms)`);
    }
    /**
     * Ротация цепочки для конкретной валюты
     */
    async rotateCircuitForCurrency(symbol) {
        try {
            logger_1.default.info(`🔄 Ротируем цепочку для ${symbol}...`);
            // Отправляем NEWNYM для изоляции этой валюты
            await TorManager_1.torManager.rotateCircuit();
            // Ждем немного для установки новой цепочки
            await new Promise(resolve => setTimeout(resolve, 2000));
            logger_1.default.info(`✅ Цепочка для ${symbol} ротирована`);
            this.emit('circuitRotated', { symbol });
        }
        catch (error) {
            logger_1.default.error(`❌ Ошибка ротации цепочки для ${symbol}:`, error);
        }
    }
    /**
     * Обновление статистики endpoint'а
     */
    updateEndpointStats(symbol, url, responseTime, success) {
        const key = `${symbol}:${url}`;
        const stats = this.endpointStats.get(key) || {
            symbol,
            url,
            requestCount: 0,
            errorCount: 0,
            totalResponseTime: 0,
            averageResponseTime: 0,
            lastUsed: new Date(),
            successRate: 100,
        };
        stats.requestCount++;
        stats.totalResponseTime += responseTime;
        stats.averageResponseTime = stats.totalResponseTime / stats.requestCount;
        stats.lastUsed = new Date();
        if (!success) {
            stats.errorCount++;
        }
        stats.successRate = ((stats.requestCount - stats.errorCount) / stats.requestCount) * 100;
        this.endpointStats.set(key, stats);
        // Обновляем статистику в конфигурации валюты
        const currencyConfig = this.currencies.get(symbol);
        if (currencyConfig) {
            const endpoint = currencyConfig.endpoints.find(ep => ep.url === url);
            if (endpoint) {
                endpoint.responseTime = stats.averageResponseTime;
                endpoint.lastUsed = new Date();
                if (!success) {
                    endpoint.errorCount++;
                }
            }
        }
    }
    /**
     * Проверка критических ошибок
     */
    isCriticalError(error) {
        const criticalCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'];
        return criticalCodes.includes(error.code) || error.response?.status >= 500;
    }
    /**
     * Генерация User-Agent специфичного для валюты
     */
    generateCurrencySpecificUserAgent(symbol) {
        const baseAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        ];
        const agent = baseAgents[Math.floor(Math.random() * baseAgents.length)];
        const version = Math.floor(Math.random() * 10) + 90; // версии 90-99
        return `${agent} (KHTML, like Gecko) Chrome/${version}.0.0.0 Safari/537.36 ${symbol}Client/1.0`;
    }
    /**
     * Получение лучшего endpoint'а для валюты
     */
    getBestEndpoint(symbol, type) {
        const config = this.currencies.get(symbol);
        if (!config) {
            return null;
        }
        let endpoints = config.endpoints;
        if (type) {
            endpoints = endpoints.filter(ep => ep.type === type);
        }
        // Сортируем по приоритету и success rate
        endpoints.sort((a, b) => {
            const aStats = this.endpointStats.get(`${symbol}:${a.url}`);
            const bStats = this.endpointStats.get(`${symbol}:${b.url}`);
            const aScore = (aStats?.successRate || 100) * (1 / (a.priority || 1));
            const bScore = (bStats?.successRate || 100) * (1 / (b.priority || 1));
            return bScore - aScore;
        });
        return endpoints[0] || null;
    }
    /**
     * Выполнение запроса для конкретной валюты
     */
    async makeRequest(symbol, endpoint, data, options = {}) {
        if (!this.isInitialized) {
            throw new Error('TorBlockchainClient не инициализирован');
        }
        const axiosInstance = this.axiosInstances.get(symbol);
        if (!axiosInstance) {
            throw new Error(`Axios instance не найден для ${symbol}`);
        }
        const config = this.currencies.get(symbol);
        let lastError = null;
        // Пытаемся выполнить запрос с retry logic
        for (let attempt = 1; attempt <= (config?.maxRetries || 3); attempt++) {
            try {
                logger_1.default.debug(`🧅 ${symbol} запрос (попытка ${attempt}):`, { endpoint, data });
                const response = await axiosInstance({
                    url: endpoint,
                    method: data ? 'POST' : 'GET',
                    data,
                    ...options,
                });
                logger_1.default.debug(`✅ ${symbol} запрос успешен:`, {
                    endpoint,
                    status: response.status,
                    attempt
                });
                return response.data;
            }
            catch (error) {
                lastError = error;
                logger_1.default.warn(`⚠️ ${symbol} запрос неудачен (попытка ${attempt}):`, {
                    endpoint,
                    error: error?.message || 'Unknown error',
                    attempt
                });
                // Если это не последняя попытка, ждем и ротируем цепочку
                if (attempt < (config?.maxRetries || 3)) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                    await this.rotateCircuitForCurrency(symbol);
                }
            }
        }
        throw lastError || new Error('All attempts failed');
    }
    /**
     * Получение статистики по всем валютам
     */
    getStats() {
        const stats = {};
        for (const [symbol, config] of this.currencies) {
            const currencyStats = {
                symbol,
                name: config.name,
                socksPort: config.socksPort,
                endpoints: config.endpoints.map(ep => ({
                    url: ep.url,
                    type: ep.type,
                    isOnion: ep.isOnion,
                    errorCount: ep.errorCount,
                    responseTime: ep.responseTime,
                    lastUsed: ep.lastUsed,
                })),
                endpointStats: Array.from(this.endpointStats.entries())
                    .filter(([key]) => key.startsWith(symbol))
                    .map(([key, stat]) => stat),
            };
            stats[symbol] = currencyStats;
        }
        return stats;
    }
    /**
     * Проверка здоровья всех соединений
     */
    async healthCheck() {
        const results = {};
        for (const [symbol] of this.currencies) {
            try {
                const endpoint = this.getBestEndpoint(symbol);
                if (endpoint) {
                    const startTime = Date.now();
                    await this.makeRequest(symbol, endpoint.url, null, { timeout: 5000 });
                    const responseTime = Date.now() - startTime;
                    results[symbol] = {
                        status: 'healthy',
                        responseTime,
                        endpoint: endpoint.url,
                    };
                }
                else {
                    results[symbol] = {
                        status: 'no_endpoints',
                        error: 'Нет доступных endpoints',
                    };
                }
            }
            catch (error) {
                results[symbol] = {
                    status: 'unhealthy',
                    error: error?.message || 'Unknown error',
                };
            }
        }
        return results;
    }
    /**
     * Остановка всех соединений
     */
    async shutdown() {
        logger_1.default.info('🛑 Останавливаем TorBlockchainClient...');
        // Останавливаем все таймеры ротации
        for (const [symbol, timer] of this.rotationTimers) {
            clearInterval(timer);
            logger_1.default.info(`🛑 Остановлена ротация для ${symbol}`);
        }
        this.rotationTimers.clear();
        this.axiosInstances.clear();
        this.isInitialized = false;
        this.emit('shutdown');
        logger_1.default.info('✅ TorBlockchainClient остановлен');
    }
}
exports.TorBlockchainClient = TorBlockchainClient;
// Создаем глобальный экземпляр
exports.torBlockchainClient = new TorBlockchainClient();
// Инициализируем при загрузке модуля
if (process.env.NODE_ENV !== 'test') {
    exports.torBlockchainClient.initialize().catch(error => {
        logger_1.default.error('❌ Ошибка инициализации TorBlockchainClient:', error);
    });
}
//# sourceMappingURL=TorBlockchainClient.js.map