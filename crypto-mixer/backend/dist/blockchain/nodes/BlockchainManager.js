"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlockchainManager = void 0;
const BitcoinCoreClient_1 = require("./BitcoinCoreClient");
const EthereumGethClient_1 = require("./EthereumGethClient");
const SolanaRpcClient_1 = require("./SolanaRpcClient");
const LitecoinCoreClient_1 = require("./LitecoinCoreClient");
const DashCoreClient_1 = require("./DashCoreClient");
const ZcashClient_1 = require("./ZcashClient");
const logger_1 = __importDefault(require("../../utils/logger"));
/**
 * Единый менеджер для управления всеми блокчейн подключениями
 * Предоставляет унифицированный интерфейс для работы с Bitcoin, Ethereum и Solana
 */
class BlockchainManager {
    constructor(config) {
        this.clients = new Map();
        this.healthCheckIntervals = new Map();
        this.performanceMetrics = new Map();
        this.isInitialized = false;
        this.config = {
            healthCheckInterval: 60000, // 1 минута
            ...config
        };
    }
    /**
     * Инициализация всех блокчейн клиентов
     */
    async initialize() {
        logger_1.default.info('Initializing Blockchain Manager');
        try {
            // Инициализация Bitcoin Core клиента
            if (this.config.bitcoin?.enabled) {
                await this.initializeBitcoinClient();
            }
            // Инициализация Ethereum Geth клиента
            if (this.config.ethereum?.enabled) {
                await this.initializeEthereumClient();
            }
            // Инициализация Solana RPC клиента
            if (this.config.solana?.enabled) {
                await this.initializeSolanaClient();
            }
            // Инициализация Litecoin Core клиента
            if (this.config.litecoin?.enabled) {
                await this.initializeLitecoinClient();
            }
            // Инициализация Dash Core клиента
            if (this.config.dash?.enabled) {
                await this.initializeDashClient();
            }
            // Инициализация Zcash клиента
            if (this.config.zcash?.enabled) {
                await this.initializeZcashClient();
            }
            // Запуск мониторинга всех клиентов
            this.startGlobalHealthMonitoring();
            this.isInitialized = true;
            logger_1.default.info('Blockchain Manager initialized successfully', {
                enabledClients: Array.from(this.clients.keys())
            });
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Blockchain Manager', { error });
            throw error;
        }
    }
    /**
     * Инициализация Bitcoin Core клиента
     */
    async initializeBitcoinClient() {
        try {
            const client = new BitcoinCoreClient_1.BitcoinCoreClient(this.config.bitcoin);
            // Тест подключения
            const isConnected = await client.ping();
            if (!isConnected) {
                throw new Error('Failed to connect to Bitcoin Core');
            }
            this.clients.set('BTC', client);
            logger_1.default.info('Bitcoin Core client initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Bitcoin Core client', { error });
            if (this.config.bitcoin?.enabled) {
                throw error; // Если обязательно включен, выбрасываем ошибку
            }
        }
    }
    /**
     * Инициализация Ethereum Geth клиента
     */
    async initializeEthereumClient() {
        try {
            const client = new EthereumGethClient_1.EthereumGethClient(this.config.ethereum);
            // Тест подключения
            const isConnected = await client.isConnected();
            if (!isConnected) {
                throw new Error('Failed to connect to Ethereum Geth');
            }
            this.clients.set('ETH', client);
            logger_1.default.info('Ethereum Geth client initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Ethereum Geth client', { error });
            if (this.config.ethereum?.enabled) {
                throw error;
            }
        }
    }
    /**
     * Инициализация Solana RPC клиента
     */
    async initializeSolanaClient() {
        try {
            const client = new SolanaRpcClient_1.SolanaRpcClient(this.config.solana);
            // Тест подключения
            const isConnected = await client.isConnected();
            if (!isConnected) {
                throw new Error('Failed to connect to Solana RPC');
            }
            this.clients.set('SOL', client);
            logger_1.default.info('Solana RPC client initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Solana RPC client', { error });
            if (this.config.solana?.enabled) {
                throw error;
            }
        }
    }
    /**
     * Инициализация Litecoin Core клиента
     */
    async initializeLitecoinClient() {
        try {
            const client = new LitecoinCoreClient_1.LitecoinCoreClient(this.config.litecoin);
            // Тест подключения
            const isConnected = await client.ping();
            if (!isConnected) {
                throw new Error('Failed to connect to Litecoin Core');
            }
            this.clients.set('LTC', client);
            logger_1.default.info('Litecoin Core client initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Litecoin Core client', { error });
            if (this.config.litecoin?.enabled) {
                throw error;
            }
        }
    }
    /**
     * Инициализация Dash Core клиента
     */
    async initializeDashClient() {
        try {
            const client = new DashCoreClient_1.DashCoreClient(this.config.dash);
            // Тест подключения
            const isConnected = await client.ping();
            if (!isConnected) {
                throw new Error('Failed to connect to Dash Core');
            }
            this.clients.set('DASH', client);
            logger_1.default.info('Dash Core client initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Dash Core client', { error });
            if (this.config.dash?.enabled) {
                throw error;
            }
        }
    }
    /**
     * Инициализация Zcash клиента
     */
    async initializeZcashClient() {
        try {
            const client = new ZcashClient_1.ZcashClient(this.config.zcash);
            // Тест подключения
            const isConnected = await client.ping();
            if (!isConnected) {
                throw new Error('Failed to connect to Zcash');
            }
            this.clients.set('ZEC', client);
            logger_1.default.info('Zcash client initialized successfully');
        }
        catch (error) {
            logger_1.default.error('Failed to initialize Zcash client', { error });
            if (this.config.zcash?.enabled) {
                throw error;
            }
        }
    }
    /**
     * Запуск глобального мониторинга здоровья
     */
    startGlobalHealthMonitoring() {
        const interval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.config.healthCheckInterval);
        // Сохраняем интервал для каждой валюты
        for (const currency of this.clients.keys()) {
            this.healthCheckIntervals.set(currency, interval);
        }
    }
    /**
     * Выполнение проверок здоровья для всех клиентов
     */
    async performHealthChecks() {
        const promises = Array.from(this.clients.entries()).map(async ([currency, client]) => {
            const startTime = Date.now();
            try {
                let stats;
                switch (currency) {
                    case 'BTC':
                        const btcStats = await client.getPerformanceStats();
                        stats = {
                            currency,
                            isConnected: btcStats.isConnected,
                            lastHealthCheck: btcStats.lastHealthCheck,
                            responseTime: Date.now() - startTime,
                            errorRate: 0,
                            currentBlock: btcStats.currentBlockHeight,
                            networkPeers: btcStats.connectionCount,
                            mempooolSize: btcStats.mempoolSize,
                            additionalInfo: btcStats
                        };
                        break;
                    case 'ETH':
                        const ethStats = await client.getPerformanceStats();
                        stats = {
                            currency,
                            isConnected: ethStats.isConnected,
                            lastHealthCheck: ethStats.lastHealthCheck,
                            responseTime: Date.now() - startTime,
                            errorRate: 0,
                            currentBlock: ethStats.currentBlockNumber,
                            networkPeers: ethStats.peerCount,
                            mempooolSize: ethStats.mempoolStatus.pending,
                            additionalInfo: ethStats
                        };
                        break;
                    case 'SOL':
                        const solStats = await client.getPerformanceStats();
                        stats = {
                            currency,
                            isConnected: solStats.isConnected,
                            lastHealthCheck: solStats.lastHealthCheck,
                            responseTime: Date.now() - startTime,
                            errorRate: 0,
                            currentBlock: solStats.blockHeight,
                            networkPeers: solStats.clusterNodes,
                            additionalInfo: solStats
                        };
                        break;
                    case 'LTC':
                        const ltcStats = await client.getPerformanceStats();
                        stats = {
                            currency,
                            isConnected: ltcStats.isConnected,
                            lastHealthCheck: ltcStats.lastHealthCheck,
                            responseTime: Date.now() - startTime,
                            errorRate: 0,
                            currentBlock: ltcStats.currentBlockHeight,
                            networkPeers: ltcStats.connectionCount,
                            mempooolSize: ltcStats.mempoolSize,
                            additionalInfo: ltcStats
                        };
                        break;
                    case 'DASH':
                        const dashStats = await client.getPerformanceStats();
                        stats = {
                            currency,
                            isConnected: dashStats.isConnected,
                            lastHealthCheck: dashStats.lastHealthCheck,
                            responseTime: Date.now() - startTime,
                            errorRate: 0,
                            currentBlock: dashStats.currentBlockHeight,
                            networkPeers: dashStats.connectionCount,
                            mempooolSize: dashStats.mempoolSize,
                            additionalInfo: {
                                ...dashStats,
                                masternodeCount: dashStats.masternodeCount,
                                instantSendLocks: dashStats.instantSendLocks,
                                chainLocks: dashStats.chainLocks
                            }
                        };
                        break;
                    case 'ZEC':
                        const zecStats = await client.getPerformanceStats();
                        stats = {
                            currency,
                            isConnected: zecStats.isConnected,
                            lastHealthCheck: zecStats.lastHealthCheck,
                            responseTime: Date.now() - startTime,
                            errorRate: 0,
                            currentBlock: zecStats.currentBlockHeight,
                            networkPeers: zecStats.connectionCount,
                            additionalInfo: {
                                ...zecStats,
                                transparentBalance: zecStats.transparentBalance,
                                shieldedBalance: zecStats.shieldedBalance,
                                totalBalance: zecStats.totalBalance,
                                shieldedAddressCount: zecStats.shieldedAddressCount,
                                valuePools: zecStats.valuePools
                            }
                        };
                        break;
                    default:
                        throw new Error(`Unsupported currency: ${currency}`);
                }
                this.performanceMetrics.set(currency, stats);
            }
            catch (error) {
                logger_1.default.warn(`Health check failed for ${currency}`, { error });
                const currentMetrics = this.performanceMetrics.get(currency);
                this.performanceMetrics.set(currency, {
                    currency,
                    isConnected: false,
                    lastHealthCheck: new Date(),
                    responseTime: Date.now() - startTime,
                    errorRate: (currentMetrics?.errorRate || 0) + 1,
                    currentBlock: currentMetrics?.currentBlock || 0,
                    networkPeers: 0,
                    additionalInfo: { error: error }
                });
            }
        });
        await Promise.allSettled(promises);
    }
    // ========== УНИФИЦИРОВАННЫЕ МЕТОДЫ ==========
    /**
     * Получение баланса адреса
     */
    async getBalance(currency, address) {
        const client = this.getClient(currency);
        switch (currency) {
            case 'BTC':
                return await client.getReceivedByAddress(address);
            case 'ETH':
                return await client.getBalanceInEth(address);
            case 'SOL':
                return await client.getBalanceInSol(address);
            case 'LTC':
                return await client.getReceivedByAddress(address);
            case 'DASH':
                return await client.getReceivedByAddress(address);
            case 'ZEC':
                // Для Zcash получаем общий баланс (transparent + shielded)
                const zcashBalance = await client.getTotalBalance();
                return zcashBalance.total;
            default:
                throw new Error(`Unsupported currency: ${currency}`);
        }
    }
    /**
     * Создание нового адреса
     */
    async createAddress(currency) {
        const client = this.getClient(currency);
        switch (currency) {
            case 'BTC':
                return await client.getNewAddress();
            case 'ETH':
                const ethAccount = client.createAccount();
                return ethAccount.address;
            case 'SOL':
                const solAccount = client.generateKeypair();
                return solAccount.publicKey;
            case 'LTC':
                return await client.getNewAddress();
            case 'DASH':
                return await client.getNewAddress();
            case 'ZEC':
                // Для Zcash создаем transparent адрес по умолчанию
                return await client.getNewAddress();
            default:
                throw new Error(`Unsupported currency: ${currency}`);
        }
    }
    /**
     * Получение информации об адресе
     */
    async getAddressInfo(currency, address) {
        const client = this.getClient(currency);
        let balance = 0;
        let isValid = true;
        let isWatchOnly = false;
        try {
            switch (currency) {
                case 'BTC':
                    const btcInfo = await client.getAddressInfo(address);
                    balance = await client.getReceivedByAddress(address);
                    isValid = btcInfo.ismine || btcInfo.iswatchonly;
                    isWatchOnly = btcInfo.iswatchonly;
                    break;
                case 'ETH':
                    balance = await client.getBalanceInEth(address);
                    // Простая валидация Ethereum адреса
                    isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
                    break;
                case 'SOL':
                    balance = await client.getBalanceInSol(address);
                    isValid = client.isValidPublicKey(address);
                    break;
                case 'LTC':
                    try {
                        const ltcInfo = await client.getAddressInfo(address);
                        balance = await client.getReceivedByAddress(address);
                        isValid = ltcInfo.ismine || ltcInfo.iswatchonly;
                        isWatchOnly = ltcInfo.iswatchonly;
                    }
                    catch (error) {
                        // Fallback для валидации адреса
                        const validation = await client.validateAddress(address);
                        isValid = validation.isvalid;
                    }
                    break;
                case 'DASH':
                    try {
                        balance = await client.getReceivedByAddress(address);
                        const validation = await client.validateAddress(address);
                        isValid = validation.isvalid;
                    }
                    catch (error) {
                        isValid = false;
                    }
                    break;
                case 'ZEC':
                    try {
                        const validation = await client.validateAddress(address);
                        isValid = validation.isvalid;
                        if (validation.type === 'transparent') {
                            balance = await client.getBalance();
                        }
                        else if (validation.type === 'sprout' || validation.type === 'sapling') {
                            balance = await client.getShieldedBalance(address);
                        }
                    }
                    catch (error) {
                        isValid = false;
                    }
                    break;
                default:
                    throw new Error(`Unsupported currency: ${currency}`);
            }
        }
        catch (error) {
            logger_1.default.warn(`Failed to get address info for ${currency}:${address}`, { error });
            isValid = false;
        }
        return {
            address,
            currency,
            balance,
            isValid,
            isWatchOnly
        };
    }
    /**
     * Получение транзакции по хешу
     */
    async getTransaction(currency, txHash) {
        const client = this.getClient(currency);
        try {
            switch (currency) {
                case 'BTC':
                    const btcTx = await client.getTransaction(txHash);
                    return {
                        txHash: btcTx.txid,
                        currency,
                        fromAddress: btcTx.vin[0]?.scriptSig?.asm || 'unknown',
                        toAddress: btcTx.vout[0]?.scriptPubKey?.addresses?.[0] || 'unknown',
                        amount: btcTx.vout.reduce((sum, out) => sum + out.value, 0),
                        fee: 0, // TODO: Calculate fee
                        confirmations: btcTx.confirmations || 0,
                        status: (btcTx.confirmations || 0) > 0 ? 'confirmed' : 'pending',
                        blockNumber: btcTx.blocktime ? undefined : undefined,
                        timestamp: btcTx.blocktime ? new Date(btcTx.blocktime * 1000) : undefined
                    };
                case 'ETH':
                    const ethTx = await client.getTransaction(txHash);
                    const ethReceipt = await client.getTransactionReceipt(txHash);
                    if (!ethTx)
                        return null;
                    return {
                        txHash: ethTx.hash,
                        currency,
                        fromAddress: ethTx.from,
                        toAddress: ethTx.to || 'contract_creation',
                        amount: parseFloat(client['web3'].utils.fromWei(ethTx.value, 'ether')),
                        fee: ethReceipt ? parseFloat(client['web3'].utils.fromWei((BigInt(ethReceipt.gasUsed) * BigInt(ethTx.gasPrice)).toString(), 'ether')) : 0,
                        confirmations: ethTx.blockNumber ? await client.getBlockNumber() - ethTx.blockNumber : 0,
                        status: ethReceipt ? (ethReceipt.status ? 'confirmed' : 'failed') : 'pending',
                        blockNumber: ethTx.blockNumber || undefined,
                        timestamp: ethTx.blockNumber ? new Date() : undefined // TODO: Get actual block timestamp
                    };
                case 'SOL':
                    const solTx = await client.getTransaction(txHash);
                    if (!solTx)
                        return null;
                    return {
                        txHash,
                        currency,
                        fromAddress: solTx.transaction.message.accountKeys[0] || 'unknown',
                        toAddress: solTx.transaction.message.accountKeys[1] || 'unknown',
                        amount: client.lamportsToSol(solTx.meta?.postBalances[1] - solTx.meta?.preBalances[1] || 0),
                        fee: client.lamportsToSol(solTx.meta?.fee || 0),
                        confirmations: 1, // Solana использует другую модель подтверждений
                        status: solTx.meta?.err ? 'failed' : 'confirmed',
                        blockNumber: solTx.slot,
                        timestamp: solTx.blockTime ? new Date(solTx.blockTime * 1000) : undefined
                    };
                case 'LTC':
                    const ltcTx = await client.getTransaction(txHash);
                    return {
                        txHash: ltcTx.txid,
                        currency,
                        fromAddress: ltcTx.vin[0]?.scriptSig?.asm || 'unknown',
                        toAddress: ltcTx.vout[0]?.scriptPubKey?.addresses?.[0] || 'unknown',
                        amount: ltcTx.vout.reduce((sum, out) => sum + out.value, 0),
                        fee: 0, // TODO: Calculate fee
                        confirmations: ltcTx.confirmations || 0,
                        status: (ltcTx.confirmations || 0) > 0 ? 'confirmed' : 'pending',
                        blockNumber: ltcTx.blocktime ? undefined : undefined,
                        timestamp: ltcTx.blocktime ? new Date(ltcTx.blocktime * 1000) : undefined
                    };
                case 'DASH':
                    const dashTx = await client.getTransaction(txHash);
                    return {
                        txHash: dashTx.txid,
                        currency,
                        fromAddress: dashTx.vin[0]?.scriptSig?.asm || 'unknown',
                        toAddress: dashTx.vout[0]?.scriptPubKey?.addresses?.[0] || 'unknown',
                        amount: dashTx.vout.reduce((sum, out) => sum + out.value, 0),
                        fee: 0, // TODO: Calculate fee
                        confirmations: dashTx.confirmations || 0,
                        status: (dashTx.confirmations || 0) > 0 ? 'confirmed' : 'pending',
                        blockNumber: dashTx.blocktime ? undefined : undefined,
                        timestamp: dashTx.blocktime ? new Date(dashTx.blocktime * 1000) : undefined
                    };
                case 'ZEC':
                    const zecTx = await client.getTransaction(txHash);
                    return {
                        txHash: zecTx.txid,
                        currency,
                        fromAddress: zecTx.vin[0]?.scriptSig?.asm || 'shielded',
                        toAddress: zecTx.vout[0]?.scriptPubKey?.addresses?.[0] || 'shielded',
                        amount: zecTx.vout.reduce((sum, out) => sum + out.value, 0),
                        fee: 0, // TODO: Calculate fee
                        confirmations: zecTx.confirmations || 0,
                        status: (zecTx.confirmations || 0) > 0 ? 'confirmed' : 'pending',
                        blockNumber: zecTx.blocktime ? undefined : undefined,
                        timestamp: zecTx.blocktime ? new Date(zecTx.blocktime * 1000) : undefined
                    };
                default:
                    throw new Error(`Unsupported currency: ${currency}`);
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to get transaction for ${currency}:${txHash}`, { error });
            return null;
        }
    }
    /**
     * Получение статуса всех блокчейн клиентов
     */
    getClientsStatus() {
        const statuses = [];
        for (const [currency, client] of this.clients.entries()) {
            const metrics = this.performanceMetrics.get(currency);
            statuses.push({
                currency,
                isConnected: metrics?.isConnected || false,
                lastHealthCheck: metrics?.lastHealthCheck || null,
                blockHeight: metrics?.currentBlock,
                peerCount: metrics?.networkPeers,
                syncStatus: metrics?.additionalInfo,
                error: metrics?.additionalInfo?.error ? String(metrics.additionalInfo.error) : undefined
            });
        }
        return statuses;
    }
    /**
     * Получение метрик производительности
     */
    getPerformanceMetrics() {
        return new Map(this.performanceMetrics);
    }
    /**
     * Проверка доступности клиента для валюты
     */
    isClientAvailable(currency) {
        const client = this.clients.get(currency);
        const metrics = this.performanceMetrics.get(currency);
        return client !== undefined && (metrics?.isConnected || false);
    }
    /**
     * Получение клиента для валюты
     */
    getClient(currency) {
        const client = this.clients.get(currency);
        if (!client) {
            throw new Error(`Client for ${currency} is not initialized`);
        }
        if (!this.isClientAvailable(currency)) {
            throw new Error(`Client for ${currency} is not available`);
        }
        return client;
    }
    /**
     * Получение поддерживаемых валют
     */
    getSupportedCurrencies() {
        return Array.from(this.clients.keys());
    }
    /**
     * Остановка всех клиентов и очистка ресурсов
     */
    async shutdown() {
        logger_1.default.info('Shutting down Blockchain Manager');
        // Остановка интервалов мониторинга
        for (const interval of this.healthCheckIntervals.values()) {
            clearInterval(interval);
        }
        this.healthCheckIntervals.clear();
        // Отключение всех клиентов
        const disconnectPromises = Array.from(this.clients.entries()).map(async ([currency, client]) => {
            try {
                switch (currency) {
                    case 'BTC':
                        await client.disconnect();
                        break;
                    case 'ETH':
                        await client.disconnect();
                        break;
                    case 'SOL':
                        await client.disconnect();
                        break;
                    case 'LTC':
                        await client.disconnect();
                        break;
                    case 'DASH':
                        await client.disconnect();
                        break;
                    case 'ZEC':
                        await client.disconnect();
                        break;
                }
                logger_1.default.info(`${currency} client disconnected successfully`);
            }
            catch (error) {
                logger_1.default.warn(`Failed to disconnect ${currency} client`, { error });
            }
        });
        await Promise.allSettled(disconnectPromises);
        this.clients.clear();
        this.performanceMetrics.clear();
        this.isInitialized = false;
        logger_1.default.info('Blockchain Manager shutdown completed');
    }
    /**
     * Проверка инициализации менеджера
     */
    isReady() {
        return this.isInitialized;
    }
    /**
     * Повторная инициализация клиента для конкретной валюты
     */
    async reinitializeClient(currency) {
        logger_1.default.info(`Reinitializing client for ${currency}`);
        // Остановка существующего клиента
        const existingClient = this.clients.get(currency);
        if (existingClient) {
            try {
                switch (currency) {
                    case 'BTC':
                        await existingClient.disconnect();
                        break;
                    case 'ETH':
                        await existingClient.disconnect();
                        break;
                    case 'SOL':
                        await existingClient.disconnect();
                        break;
                    case 'LTC':
                        await existingClient.disconnect();
                        break;
                    case 'DASH':
                        await existingClient.disconnect();
                        break;
                    case 'ZEC':
                        await existingClient.disconnect();
                        break;
                }
            }
            catch (error) {
                logger_1.default.warn(`Failed to disconnect existing ${currency} client`, { error });
            }
        }
        // Инициализация нового клиента
        switch (currency) {
            case 'BTC':
                if (this.config.bitcoin?.enabled) {
                    await this.initializeBitcoinClient();
                }
                break;
            case 'ETH':
                if (this.config.ethereum?.enabled) {
                    await this.initializeEthereumClient();
                }
                break;
            case 'SOL':
                if (this.config.solana?.enabled) {
                    await this.initializeSolanaClient();
                }
                break;
            case 'LTC':
                if (this.config.litecoin?.enabled) {
                    await this.initializeLitecoinClient();
                }
                break;
            case 'DASH':
                if (this.config.dash?.enabled) {
                    await this.initializeDashClient();
                }
                break;
            case 'ZEC':
                if (this.config.zcash?.enabled) {
                    await this.initializeZcashClient();
                }
                break;
            default:
                throw new Error(`Unsupported currency for reinitialization: ${currency}`);
        }
        logger_1.default.info(`Client for ${currency} reinitialized successfully`);
    }
}
exports.BlockchainManager = BlockchainManager;
//# sourceMappingURL=BlockchainManager.js.map