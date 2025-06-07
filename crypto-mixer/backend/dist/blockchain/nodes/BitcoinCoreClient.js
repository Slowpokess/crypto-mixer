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
exports.BitcoinCoreClient = void 0;
const axios_1 = __importDefault(require("axios"));
const bitcoin = __importStar(require("bitcoinjs-lib"));
const ecc = __importStar(require("tiny-secp256k1"));
const ecpair_1 = require("ecpair");
const logger_1 = __importDefault(require("../../utils/logger"));
bitcoin.initEccLib(ecc);
const ECPair = (0, ecpair_1.ECPairFactory)(ecc);
/**
 * Продакшн-готовый клиент для Bitcoin Core
 * Полная интеграция с Bitcoin Core daemon через RPC API
 */
class BitcoinCoreClient {
    constructor(config) {
        this.requestId = 0;
        this.isConnected = false;
        this.lastHealthCheck = null;
        this.healthCheckInterval = null;
        this.config = {
            timeout: 30000,
            maxRetries: 3,
            retryDelay: 1000,
            ssl: false,
            ...config
        };
        this.httpClient = axios_1.default.create({
            baseURL: `${this.config.ssl ? 'https' : 'http'}://${this.config.host}:${this.config.port}`,
            auth: {
                username: this.config.username,
                password: this.config.password
            },
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'CryptoMixer-BitcoinCore/1.0'
            }
        });
        // Настройка SSL если указано
        if (this.config.ssl) {
            this.setupSSL();
        }
        // Запуск периодической проверки здоровья
        this.startHealthCheck();
    }
    /**
     * Настройка SSL соединения
     */
    setupSSL() {
        if (this.config.sslCert || this.config.sslKey || this.config.sslCa) {
            const fs = require('fs');
            const https = require('https');
            const httpsAgent = new https.Agent({
                cert: this.config.sslCert ? fs.readFileSync(this.config.sslCert) : undefined,
                key: this.config.sslKey ? fs.readFileSync(this.config.sslKey) : undefined,
                ca: this.config.sslCa ? fs.readFileSync(this.config.sslCa) : undefined,
                rejectUnauthorized: true
            });
            this.httpClient.defaults.httpsAgent = httpsAgent;
        }
    }
    /**
     * Выполнение RPC запроса к Bitcoin Core
     */
    async rpcCall(method, params = []) {
        const requestId = ++this.requestId;
        const request = {
            jsonrpc: '1.0',
            id: requestId,
            method,
            params
        };
        let lastError = null;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const url = this.config.wallet ? `/wallet/${this.config.wallet}` : '/';
                const response = await this.httpClient.post(url, request);
                if (response.data.error) {
                    throw new Error(`Bitcoin RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
                }
                this.isConnected = true;
                return response.data.result;
            }
            catch (error) {
                lastError = error;
                this.isConnected = false;
                logger_1.default.warn(`Bitcoin RPC attempt ${attempt} failed`, {
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
        logger_1.default.error('Bitcoin RPC failed after all retries', {
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
                await this.getBlockchainInfo();
                this.lastHealthCheck = new Date();
            }
            catch (error) {
                logger_1.default.warn('Bitcoin Core health check failed', { error });
            }
        }, 60000); // Каждую минуту
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
     * Получение информации о блокчейне
     */
    async getBlockchainInfo() {
        return this.rpcCall('getblockchaininfo');
    }
    /**
     * Получение сетевой информации
     */
    async getNetworkInfo() {
        return this.rpcCall('getnetworkinfo');
    }
    /**
     * Получение информации о мемпуле
     */
    async getMempoolInfo() {
        return this.rpcCall('getmempoolinfo');
    }
    /**
     * Получение информации о кошельке
     */
    async getWalletInfo() {
        return this.rpcCall('getwalletinfo');
    }
    /**
     * Создание нового адреса
     */
    async getNewAddress(label, addressType = 'bech32') {
        const params = label ? [label, addressType] : [undefined, addressType];
        return this.rpcCall('getnewaddress', params.filter(p => p !== undefined));
    }
    /**
     * Получение информации об адресе
     */
    async getAddressInfo(address) {
        return this.rpcCall('getaddressinfo', [address]);
    }
    /**
     * Получение баланса кошелька
     */
    async getBalance(minConfirmations = 1) {
        return this.rpcCall('getbalance', ['*', minConfirmations]);
    }
    /**
     * Получение баланса конкретного адреса
     */
    async getReceivedByAddress(address, minConfirmations = 1) {
        return this.rpcCall('getreceivedbyaddress', [address, minConfirmations]);
    }
    /**
     * Получение списка UTXO
     */
    async listUnspent(minConfirmations = 1, maxConfirmations = 9999999, addresses) {
        const params = [minConfirmations, maxConfirmations];
        if (addresses) {
            params.push(addresses);
        }
        return this.rpcCall('listunspent', params);
    }
    /**
     * Получение транзакции по хешу
     */
    async getTransaction(txid, includeWatchonly = false) {
        return this.rpcCall('gettransaction', [txid, includeWatchonly]);
    }
    /**
     * Получение необработанной транзакции
     */
    async getRawTransaction(txid, verbose = true) {
        return this.rpcCall('getrawtransaction', [txid, verbose]);
    }
    /**
     * Отправка необработанной транзакции
     */
    async sendRawTransaction(hexString, maxFeeRate) {
        const params = maxFeeRate ? [hexString, maxFeeRate] : [hexString];
        return this.rpcCall('sendrawtransaction', params);
    }
    /**
     * Создание необработанной транзакции
     */
    async createRawTransaction(inputs, outputs) {
        return this.rpcCall('createrawtransaction', [inputs, outputs]);
    }
    /**
     * Подпись необработанной транзакции
     */
    async signRawTransactionWithWallet(hexString) {
        return this.rpcCall('signrawtransactionwithwallet', [hexString]);
    }
    /**
     * Отправка средств на адрес
     */
    async sendToAddress(address, amount, comment, commentTo, subtractFeeFromAmount = false) {
        const params = [address, amount];
        if (comment)
            params.push(comment);
        if (commentTo)
            params.push(commentTo);
        if (subtractFeeFromAmount)
            params.push(subtractFeeFromAmount);
        return this.rpcCall('sendtoaddress', params);
    }
    /**
     * Оценка комиссии для транзакции
     */
    async estimateSmartFee(confirmationTarget, estimateMode = 'CONSERVATIVE') {
        return this.rpcCall('estimatesmartfee', [confirmationTarget, estimateMode]);
    }
    /**
     * Получение лучшего хеша блока
     */
    async getBestBlockHash() {
        return this.rpcCall('getbestblockhash');
    }
    /**
     * Получение блока по хешу
     */
    async getBlock(blockHash, verbosity = 1) {
        return this.rpcCall('getblock', [blockHash, verbosity]);
    }
    /**
     * Получение хеша блока по высоте
     */
    async getBlockHash(height) {
        return this.rpcCall('getblockhash', [height]);
    }
    /**
     * Получение количества блоков
     */
    async getBlockCount() {
        return this.rpcCall('getblockcount');
    }
    /**
     * Импорт адреса для отслеживания
     */
    async importAddress(address, label, rescan = false, p2sh = false) {
        const params = [address];
        if (label !== undefined)
            params.push(label);
        if (rescan !== undefined)
            params.push(rescan);
        if (p2sh !== undefined)
            params.push(p2sh);
        await this.rpcCall('importaddress', params);
    }
    /**
     * Получение статуса соединения
     */
    isNodeConnected() {
        return this.isConnected;
    }
    /**
     * Получение времени последней проверки здоровья
     */
    getLastHealthCheck() {
        return this.lastHealthCheck;
    }
    /**
     * Проверка доступности ноды
     */
    async ping() {
        try {
            await this.rpcCall('ping');
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Закрытие соединения
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
            const [blockchainInfo, networkInfo, mempoolInfo] = await Promise.all([
                this.getBlockchainInfo(),
                this.getNetworkInfo(),
                this.getMempoolInfo()
            ]);
            return {
                isConnected: this.isConnected,
                lastHealthCheck: this.lastHealthCheck,
                currentBlockHeight: blockchainInfo.blocks,
                mempoolSize: mempoolInfo.size,
                connectionCount: networkInfo.connections
            };
        }
        catch (error) {
            logger_1.default.error('Failed to get Bitcoin Core performance stats', { error });
            throw error;
        }
    }
}
exports.BitcoinCoreClient = BitcoinCoreClient;
//# sourceMappingURL=BitcoinCoreClient.js.map