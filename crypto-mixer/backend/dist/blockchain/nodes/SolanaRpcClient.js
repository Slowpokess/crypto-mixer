"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaRpcClient = void 0;
const web3_js_1 = require("@solana/web3.js");
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../../utils/logger"));
/**
 * Продакшн-готовый клиент для Solana RPC
 * Полная интеграция с Solana через @solana/web3.js и прямые RPC вызовы
 */
class SolanaRpcClient {
    constructor(config) {
        this.httpClient = null;
        this._isConnected = false;
        this.lastHealthCheck = null;
        this.healthCheckInterval = null;
        this.config = {
            rpcUrl: 'http://localhost:8899',
            commitment: 'confirmed',
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            confirmTransactionInitialTimeout: 60000,
            ...config
        };
        // Инициализация соединения с Solana
        this.connection = new web3_js_1.Connection(this.config.rpcUrl, {
            commitment: this.config.commitment,
            confirmTransactionInitialTimeout: this.config.confirmTransactionInitialTimeout
        });
        // Настройка HTTP клиента для прямых RPC вызовов
        this.setupHttpClient();
        // Запуск периодической проверки здоровья
        this.startHealthCheck();
    }
    /**
     * Настройка HTTP клиента для прямых RPC вызовов
     */
    setupHttpClient() {
        this.httpClient = axios_1.default.create({
            baseURL: this.config.rpcUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CryptoMixer-Solana/1.0'
            }
        });
    }
    /**
     * Выполнение прямого RPC вызова к Solana
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
                    throw new Error(`Solana RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
                }
                this._isConnected = true;
                return response.data.result;
            }
            catch (error) {
                lastError = error;
                this._isConnected = false;
                logger_1.default.warn(`Solana RPC attempt ${attempt} failed`, {
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
        logger_1.default.error('Solana RPC failed after all retries', {
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
                await this.getSlot();
                this.lastHealthCheck = new Date();
            }
            catch (error) {
                logger_1.default.warn('Solana RPC health check failed', { error });
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
     * Получение текущего слота
     */
    async getSlot() {
        return await this.connection.getSlot();
    }
    /**
     * Получение высоты блока
     */
    async getBlockHeight() {
        return await this.connection.getBlockHeight();
    }
    /**
     * Получение баланса аккаунта в лампортах
     */
    async getBalance(publicKey) {
        const pubkey = typeof publicKey === 'string' ? new web3_js_1.PublicKey(publicKey) : publicKey;
        return await this.connection.getBalance(pubkey);
    }
    /**
     * Получение баланса в SOL
     */
    async getBalanceInSol(publicKey) {
        const balance = await this.getBalance(publicKey);
        return balance / web3_js_1.LAMPORTS_PER_SOL;
    }
    /**
     * Получение информации об аккаунте
     */
    async getAccountInfo(publicKey) {
        const pubkey = typeof publicKey === 'string' ? new web3_js_1.PublicKey(publicKey) : publicKey;
        const accountInfo = await this.connection.getAccountInfo(pubkey);
        if (!accountInfo) {
            return null;
        }
        return {
            executable: accountInfo.executable,
            owner: accountInfo.owner.toBase58(),
            lamports: accountInfo.lamports,
            data: accountInfo.data,
            rentEpoch: accountInfo.rentEpoch
        };
    }
    /**
     * Создание нового keypair
     */
    generateKeypair() {
        const keypair = web3_js_1.Keypair.generate();
        return {
            publicKey: keypair.publicKey.toBase58(),
            secretKey: Array.from(keypair.secretKey)
        };
    }
    /**
     * Восстановление keypair из секретного ключа
     */
    keypairFromSecretKey(secretKey) {
        return web3_js_1.Keypair.fromSecretKey(new Uint8Array(secretKey));
    }
    /**
     * Отправка SOL с одного аккаунта на другой
     */
    async transferSol(fromKeypair, toPublicKey, lamports) {
        const toPubkey = typeof toPublicKey === 'string' ? new web3_js_1.PublicKey(toPublicKey) : toPublicKey;
        const transaction = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
            fromPubkey: fromKeypair.publicKey,
            toPubkey,
            lamports
        }));
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, transaction, [fromKeypair]);
        return signature;
    }
    /**
     * Получение последнего blockhash
     */
    async getLatestBlockhash() {
        return await this.connection.getLatestBlockhash();
    }
    /**
     * Отправка и подтверждение транзакции
     */
    async sendAndConfirmTransaction(transaction, signers, options) {
        const signature = await (0, web3_js_1.sendAndConfirmTransaction)(this.connection, transaction, signers, options);
        return signature;
    }
    /**
     * Получение транзакции по подписи
     */
    async getTransaction(signature) {
        const transaction = await this.connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0
        });
        return transaction;
    }
    /**
     * Ожидание подтверждения транзакции
     */
    async confirmTransaction(signature, commitment = 'confirmed') {
        try {
            const latestBlockhash = await this.getLatestBlockhash();
            const strategy = {
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            };
            const result = await this.connection.confirmTransaction(strategy, commitment);
            return !result.value.err;
        }
        catch (error) {
            logger_1.default.error('Failed to confirm transaction', { signature, error });
            return false;
        }
    }
    // ========== SOLANA СПЕЦИФИЧНЫЕ МЕТОДЫ ==========
    /**
     * Получение информации об эпохе
     */
    async getEpochInfo() {
        return this.rpcCall('getEpochInfo');
    }
    /**
     * Получение информации о версии
     */
    async getVersion() {
        return this.rpcCall('getVersion');
    }
    /**
     * Получение информации об инфляции
     */
    async getInflationGovernor() {
        return this.rpcCall('getInflationGovernor');
    }
    /**
     * Получение курса инфляции
     */
    async getInflationRate() {
        return this.rpcCall('getInflationRate');
    }
    /**
     * Получение общего предложения
     */
    async getSupply() {
        const result = await this.rpcCall('getSupply');
        return result.value;
    }
    /**
     * Получение узлов кластера
     */
    async getClusterNodes() {
        return this.rpcCall('getClusterNodes');
    }
    /**
     * Получение аккаунтов для голосования
     */
    async getVoteAccounts() {
        return this.rpcCall('getVoteAccounts');
    }
    /**
     * Получение производительности
     */
    async getRecentPerformanceSamples(limit = 720) {
        return this.rpcCall('getRecentPerformanceSamples', [limit]);
    }
    /**
     * Получение производства блоков
     */
    async getBlockProduction() {
        const result = await this.rpcCall('getBlockProduction');
        return result.value;
    }
    /**
     * Получение минимального баланса для освобождения от арендной платы
     */
    async getMinimumBalanceForRentExemption(dataLength) {
        return await this.connection.getMinimumBalanceForRentExemption(dataLength);
    }
    /**
     * Проверка соединения с нодой
     */
    async isConnected() {
        try {
            await this.getSlot();
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
        this.isConnected = false;
    }
    /**
     * Получение статистики производительности
     */
    async getPerformanceStats() {
        try {
            const [slot, blockHeight, epochInfo, clusterNodes, recentPerformance] = await Promise.all([
                this.getSlot(),
                this.getBlockHeight(),
                this.getEpochInfo(),
                this.getClusterNodes(),
                this.getRecentPerformanceSamples(10) // Последние 10 образцов
            ]);
            return {
                isConnected: this._isConnected,
                lastHealthCheck: this.lastHealthCheck,
                currentSlot: slot,
                blockHeight,
                epochInfo,
                clusterNodes: clusterNodes.length,
                recentPerformance
            };
        }
        catch (error) {
            logger_1.default.error('Failed to get Solana RPC performance stats', { error });
            throw error;
        }
    }
    /**
     * Получение статуса здоровья ноды
     */
    async getHealth() {
        try {
            return await this.rpcCall('getHealth');
        }
        catch (error) {
            return error.message || 'unhealthy';
        }
    }
    /**
     * Конвертация SOL в лампорты
     */
    solToLamports(sol) {
        return Math.floor(sol * web3_js_1.LAMPORTS_PER_SOL);
    }
    /**
     * Конвертация лампортов в SOL
     */
    lamportsToSol(lamports) {
        return lamports / web3_js_1.LAMPORTS_PER_SOL;
    }
    /**
     * Валидация публичного ключа
     */
    isValidPublicKey(publicKey) {
        try {
            new web3_js_1.PublicKey(publicKey);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.SolanaRpcClient = SolanaRpcClient;
//# sourceMappingURL=SolanaRpcClient.js.map