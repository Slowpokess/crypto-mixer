"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthereumGethClient = void 0;
const web3_1 = require("web3");
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../../utils/logger"));
/**
 * Продакшн-готовый клиент для Ethereum Geth
 * Полная интеграция с Ethereum через Web3 и прямые RPC вызовы
 */
class EthereumGethClient {
    constructor(config) {
        this.httpClient = null;
        this._isConnected = false;
        this.lastHealthCheck = null;
        this.healthCheckInterval = null;
        this.currentProvider = null;
        this.config = {
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            gasLimit: 21000,
            gasPrice: '20000000000', // 20 Gwei
            confirmations: 3,
            network: 'mainnet',
            ...config
        };
        // Определяем провайдера
        this.currentProvider = this.determineProvider();
        // Инициализация Web3
        this.web3 = new web3_1.Web3(this.currentProvider);
        // Настройка HTTP клиента для прямых RPC вызовов
        if (this.config.httpUrl) {
            this.setupHttpClient();
        }
        // Добавление приватных ключей в кошелек
        if (this.config.accounts?.privateKeys) {
            this.setupAccounts();
        }
        // Запуск периодической проверки здоровья
        this.startHealthCheck();
    }
    /**
     * Определение провайдера для подключения
     */
    determineProvider() {
        if (this.config.httpUrl) {
            return this.config.httpUrl;
        }
        if (this.config.wsUrl) {
            return this.config.wsUrl;
        }
        if (this.config.ipcPath) {
            return this.config.ipcPath;
        }
        // Дефолтные провайдеры для разных сетей
        switch (this.config.network) {
            case 'mainnet':
                return 'http://localhost:8545';
            case 'goerli':
                return 'http://localhost:8545';
            case 'sepolia':
                return 'http://localhost:8545';
            case 'localhost':
                return 'http://localhost:8545';
            default:
                return 'http://localhost:8545';
        }
    }
    /**
     * Настройка HTTP клиента для прямых RPC вызовов
     */
    setupHttpClient() {
        this.httpClient = axios_1.default.create({
            baseURL: this.config.httpUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CryptoMixer-Geth/1.0'
            }
        });
    }
    /**
     * Добавление приватных ключей в кошелек Web3
     */
    setupAccounts() {
        if (this.config.accounts?.privateKeys) {
            for (const privateKey of this.config.accounts.privateKeys) {
                this.web3.eth.accounts.wallet.add(privateKey);
            }
            logger_1.default.info(`Added ${this.config.accounts.privateKeys.length} accounts to Ethereum wallet`);
        }
    }
    /**
     * Выполнение прямого RPC вызова к Geth
     */
    async rpcCall(method, params = []) {
        if (!this.httpClient) {
            throw new Error('HTTP client not configured for RPC calls');
        }
        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method,
            params
        };
        let lastError = null;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await this.httpClient.post('/', request);
                if (response.data.error) {
                    throw new Error(`Ethereum RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
                }
                this._isConnected = true;
                return response.data.result;
            }
            catch (error) {
                lastError = error;
                this._isConnected = false;
                logger_1.default.warn(`Ethereum RPC attempt ${attempt} failed`, {
                    method,
                    error: error.message,
                    attempt,
                    maxRetries: this.config.maxRetries
                });
                if (attempt < this.config.maxRetries) {
                    await this.delay(this.config.retryDelay * attempt);
                }
            }
        }
        logger_1.default.error('Ethereum RPC failed after all retries', {
            method,
            params,
            error: lastError?.message
        });
        throw lastError;
    }
    /**
     * Задержка для повторных попыток
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Запуск периодической проверки здоровья
     */
    startHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.getBlockNumber();
                this.lastHealthCheck = new Date();
            }
            catch (error) {
                logger_1.default.warn('Ethereum Geth health check failed', { error });
            }
        }, 30000); // Каждые 30 секунд
    }
    /**
     * Остановка проверки здоровья
     */
    stopHealthCheck() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }
    // ========== ОСНОВНЫЕ МЕТОДЫ API ==========
    /**
     * Получение номера последнего блока
     */
    async getBlockNumber() {
        return await this.web3.eth.getBlockNumber();
    }
    /**
     * Получение баланса адреса
     */
    async getBalance(address, blockNumber = 'latest') {
        return await this.web3.eth.getBalance(address, blockNumber);
    }
    /**
     * Получение баланса в ETH
     */
    async getBalanceInEth(address, blockNumber = 'latest') {
        const balanceWei = await this.getBalance(address, blockNumber);
        return parseFloat(this.web3.utils.fromWei(balanceWei, 'ether'));
    }
    /**
     * Получение nonce для адреса
     */
    async getTransactionCount(address, blockNumber = 'latest') {
        return await this.web3.eth.getTransactionCount(address, blockNumber);
    }
    /**
     * Получение цены газа
     */
    async getGasPrice() {
        return await this.web3.eth.getGasPrice();
    }
    /**
     * Оценка газа для транзакции
     */
    async estimateGas(transaction) {
        return await this.web3.eth.estimateGas(transaction);
    }
    /**
     * Получение блока по номеру или хешу
     */
    async getBlock(blockHashOrNumber, includeTransactions = false) {
        return await this.web3.eth.getBlock(blockHashOrNumber, includeTransactions);
    }
    /**
     * Получение транзакции по хешу
     */
    async getTransaction(transactionHash) {
        return await this.web3.eth.getTransaction(transactionHash);
    }
    /**
     * Получение квитанции транзакции
     */
    async getTransactionReceipt(transactionHash) {
        return await this.web3.eth.getTransactionReceipt(transactionHash);
    }
    /**
     * Отправка подписанной транзакции
     */
    async sendSignedTransaction(signedTransaction) {
        const receipt = await this.web3.eth.sendSignedTransaction(signedTransaction);
        return receipt;
    }
    /**
     * Создание и отправка транзакции
     */
    async sendTransaction(from, to, value, data, gasLimit, gasPrice) {
        const transaction = {
            from,
            to,
            value: this.web3.utils.toWei(value, 'ether'),
            gas: gasLimit || this.config.gasLimit,
            gasPrice: gasPrice || this.config.gasPrice,
            data: data || '0x'
        };
        const receipt = await this.web3.eth.sendTransaction(transaction);
        return receipt;
    }
    /**
     * Подпись транзакции
     */
    async signTransaction(transaction, privateKey) {
        const signedTx = await this.web3.eth.accounts.signTransaction(transaction, privateKey);
        return signedTx.rawTransaction;
    }
    /**
     * Создание нового аккаунта
     */
    createAccount() {
        const account = this.web3.eth.accounts.create();
        return {
            address: account.address,
            privateKey: account.privateKey
        };
    }
    /**
     * Получение адреса из приватного ключа
     */
    getAddressFromPrivateKey(privateKey) {
        return this.web3.eth.accounts.privateKeyToAccount(privateKey).address;
    }
    /**
     * Ожидание подтверждения транзакции
     */
    async waitForTransactionConfirmation(txHash, confirmations = this.config.confirmations) {
        let receipt = null;
        let currentConfirmations = 0;
        while (currentConfirmations < confirmations) {
            receipt = await this.getTransactionReceipt(txHash);
            if (!receipt) {
                await this.delay(1000); // Ждем 1 секунду
                continue;
            }
            const currentBlockNumber = await this.getBlockNumber();
            currentConfirmations = currentBlockNumber - receipt.blockNumber + 1;
            if (currentConfirmations < confirmations) {
                await this.delay(1000); // Ждем 1 секунду между проверками
            }
        }
        return receipt;
    }
    // ========== GETH СПЕЦИФИЧНЫЕ МЕТОДЫ ==========
    /**
     * Получение статуса синхронизации
     */
    async getSyncStatus() {
        if (!this.httpClient) {
            throw new Error('HTTP client required for direct RPC calls');
        }
        return this.rpcCall('eth_syncing');
    }
    /**
     * Получение информации о нодах
     */
    async getNodeInfo() {
        if (!this.httpClient) {
            throw new Error('HTTP client required for direct RPC calls');
        }
        return this.rpcCall('admin_nodeInfo');
    }
    /**
     * Получение списка пиров
     */
    async getPeers() {
        if (!this.httpClient) {
            throw new Error('HTTP client required for direct RPC calls');
        }
        return this.rpcCall('admin_peers');
    }
    /**
     * Получение статистики мемпула
     */
    async getMempoolStatus() {
        if (!this.httpClient) {
            throw new Error('HTTP client required for direct RPC calls');
        }
        return this.rpcCall('txpool_status');
    }
    /**
     * Получение версии клиента
     */
    async getClientVersion() {
        if (!this.httpClient) {
            throw new Error('HTTP client required for direct RPC calls');
        }
        return this.rpcCall('web3_clientVersion');
    }
    /**
     * Проверка соединения с нодой
     */
    async isConnected() {
        try {
            await this.getBlockNumber();
            this._isConnected = true;
            return true;
        }
        catch (error) {
            this._isConnected = false;
            return false;
        }
    }
    /**
     * Получение статуса соединения
     */
    getConnectionStatus() {
        return this._isConnected;
    }
    /**
     * Получение времени последней проверки здоровья
     */
    getLastHealthCheck() {
        return this.lastHealthCheck;
    }
    /**
     * Закрытие соединений
     */
    async disconnect() {
        this.stopHealthCheck();
        // Закрытие WebSocket соединения если используется
        if (this.web3.currentProvider && typeof this.web3.currentProvider === 'object' && 'disconnect' in this.web3.currentProvider) {
            await this.web3.currentProvider.disconnect();
        }
        this.isConnected = false;
    }
    /**
     * Получение статистики производительности
     */
    async getPerformanceStats() {
        try {
            const [blockNumber, gasPrice, syncStatus] = await Promise.all([
                this.getBlockNumber(),
                this.getGasPrice(),
                this.getSyncStatus()
            ]);
            let peerCount = 0;
            let mempoolStatus = { pending: 0, queued: 0 };
            try {
                const peers = await this.getPeers();
                peerCount = peers.length;
                mempoolStatus = await this.getMempoolStatus();
            }
            catch (error) {
                logger_1.default.warn('Could not get additional Geth stats', { error });
            }
            return {
                isConnected: this._isConnected,
                lastHealthCheck: this.lastHealthCheck,
                currentBlockNumber: blockNumber,
                gasPrice,
                peerCount,
                syncStatus,
                mempoolStatus
            };
        }
        catch (error) {
            logger_1.default.error('Failed to get Ethereum Geth performance stats', { error });
            throw error;
        }
    }
    /**
     * Получение текущей сети
     */
    async getNetworkId() {
        return await this.web3.eth.net.getId();
    }
    /**
     * Получение ID сети
     */
    async getChainId() {
        return await this.web3.eth.getChainId();
    }
}
exports.EthereumGethClient = EthereumGethClient;
//# sourceMappingURL=EthereumGethClient.js.map