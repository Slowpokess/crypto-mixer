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
exports.DashCoreClient = void 0;
const axios_1 = __importDefault(require("axios"));
const bitcoin = __importStar(require("bitcoinjs-lib"));
const ecc = __importStar(require("tiny-secp256k1"));
const ecpair_1 = require("ecpair");
const logger_1 = __importDefault(require("../../utils/logger"));
bitcoin.initEccLib(ecc);
const ECPair = (0, ecpair_1.ECPairFactory)(ecc);
/**
 * Сеть Dash с параметрами
 */
const dashNetwork = {
    messagePrefix: '\x19DarkCoin Signed Message:\n',
    bech32: 'dash', // Dash пока не поддерживает bech32, но оставляем для будущего
    bip32: {
        public: 0x0488b21e,
        private: 0x0488ade4,
    },
    pubKeyHash: 0x4c, // Адреса начинаются с X
    scriptHash: 0x10, // Мультисиг адреса начинаются с 7
    wif: 0xcc,
};
/**
 * Продакшн-готовый клиент для Dash Core
 * Полная интеграция с Dash Core daemon через RPC API
 * Поддерживает InstantSend, PrivateSend, ChainLocks и Masternodes
 */
class DashCoreClient {
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
            enableInstantSend: true,
            enablePrivateSend: false,
            privateSendRounds: 2,
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
                'User-Agent': 'CryptoMixer-DashCore/1.0'
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
     * Выполнение RPC запроса к Dash Core
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
                    throw new Error(`Dash RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
                }
                this.isConnected = true;
                return response.data.result;
            }
            catch (error) {
                lastError = error;
                this.isConnected = false;
                logger_1.default.warn(`Dash RPC attempt ${attempt} failed`, {
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
        logger_1.default.error('Dash RPC failed after all retries', {
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
                logger_1.default.warn('Dash Core health check failed', { error });
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
     * Получение информации о блокчейне Dash
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
     * Создание нового Dash адреса
     */
    async getNewAddress(label) {
        const params = label ? [label] : [];
        return this.rpcCall('getnewaddress', params);
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
    async sendRawTransaction(hexString, allowHighFees = false) {
        return this.rpcCall('sendrawtransaction', [hexString, allowHighFees]);
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
    async signRawTransaction(hexString) {
        return this.rpcCall('signrawtransaction', [hexString]);
    }
    /**
     * Отправка средств на адрес
     */
    async sendToAddress(address, amount, comment, commentTo, subtractFeeFromAmount = false, useInstantSend = false) {
        const params = [address, amount];
        if (comment)
            params.push(comment);
        if (commentTo)
            params.push(commentTo);
        if (subtractFeeFromAmount)
            params.push(subtractFeeFromAmount);
        if (useInstantSend && this.config.enableInstantSend)
            params.push(useInstantSend);
        return this.rpcCall('sendtoaddress', params);
    }
    /**
     * Оценка комиссии для транзакции Dash
     * Dash имеет блоки каждые 2.5 минуты
     */
    async estimateFee(numBlocks) {
        try {
            return this.rpcCall('estimatefee', [numBlocks]);
        }
        catch (error) {
            // Fallback для старых версий Dash Core
            return 0.0001; // Дефолтная комиссия 0.0001 DASH
        }
    }
    /**
     * Валидация Dash адреса
     */
    async validateAddress(address) {
        return this.rpcCall('validateaddress', [address]);
    }
    // ========== DASH-СПЕЦИФИЧНЫЕ МЕТОДЫ ==========
    /**
     * Отправка InstantSend транзакции
     */
    async sendInstantSend(address, amount, comment) {
        if (!this.config.enableInstantSend) {
            throw new Error('InstantSend не включен в конфигурации');
        }
        return this.sendToAddress(address, amount, comment, undefined, false, true);
    }
    /**
     * Проверка статуса InstantSend для транзакции
     */
    async getInstantSendStatus(txid) {
        return this.rpcCall('getinstantsendstatus', [txid]);
    }
    /**
     * Получение информации о мастернодах
     */
    async getMasternodeList(filter) {
        const params = filter ? [filter] : [];
        return this.rpcCall('masternodelist', params);
    }
    /**
     * Получение количества активных мастернод
     */
    async getMasternodeCount() {
        return this.rpcCall('masternodecount');
    }
    /**
     * Начать PrivateSend микширование
     */
    async startPrivateSend() {
        if (!this.config.enablePrivateSend) {
            throw new Error('PrivateSend не включен в конфигурации');
        }
        try {
            await this.rpcCall('privatesend', ['start']);
            return true;
        }
        catch (error) {
            logger_1.default.error('Failed to start PrivateSend', { error });
            return false;
        }
    }
    /**
     * Остановить PrivateSend микширование
     */
    async stopPrivateSend() {
        try {
            await this.rpcCall('privatesend', ['stop']);
            return true;
        }
        catch (error) {
            logger_1.default.error('Failed to stop PrivateSend', { error });
            return false;
        }
    }
    /**
     * Получение статуса PrivateSend
     */
    async getPrivateSendInfo() {
        return this.rpcCall('privatesend', ['info']);
    }
    /**
     * Настройка количества раундов PrivateSend
     */
    async setPrivateSendRounds(rounds) {
        try {
            await this.rpcCall('privatesend', ['set-rounds', rounds]);
            return true;
        }
        catch (error) {
            logger_1.default.error('Failed to set PrivateSend rounds', { error, rounds });
            return false;
        }
    }
    /**
     * Получение баланса PrivateSend
     */
    async getPrivateSendBalance() {
        try {
            const walletInfo = await this.getWalletInfo();
            return walletInfo.privatesend_balance || 0;
        }
        catch (error) {
            logger_1.default.error('Failed to get PrivateSend balance', { error });
            return 0;
        }
    }
    /**
     * Создание Dash адреса программно
     */
    createDashAddress() {
        const keyPair = ECPair.makeRandom({ network: dashNetwork });
        const { address } = bitcoin.payments.p2pkh({
            pubkey: keyPair.publicKey,
            network: dashNetwork
        });
        return {
            address: address,
            privateKey: keyPair.toWIF(),
            publicKey: keyPair.publicKey.toString('hex')
        };
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
            const [blockchainInfo, networkInfo, mempoolInfo, masternodeCount] = await Promise.all([
                this.getBlockchainInfo(),
                this.getNetworkInfo(),
                this.getMempoolInfo(),
                this.getMasternodeCount().catch(() => ({ total: 0 }))
            ]);
            return {
                isConnected: this.isConnected,
                lastHealthCheck: this.lastHealthCheck,
                currentBlockHeight: blockchainInfo.blocks,
                mempoolSize: mempoolInfo.size,
                connectionCount: networkInfo.connections,
                masternodeCount: masternodeCount.total,
                instantSendLocks: mempoolInfo.instantsendlocks,
                chainLocks: !!blockchainInfo.chainlocks
            };
        }
        catch (error) {
            logger_1.default.error('Failed to get Dash Core performance stats', { error });
            throw error;
        }
    }
    /**
     * Проверка здоровья Dash ноды
     */
    async healthCheck() {
        try {
            const [blockchainInfo, networkInfo, masternodeCount] = await Promise.all([
                this.getBlockchainInfo(),
                this.getNetworkInfo(),
                this.getMasternodeCount().catch(() => ({ total: 0 }))
            ]);
            return {
                connected: true,
                blockHeight: blockchainInfo.blocks,
                connections: networkInfo.connections,
                version: networkInfo.subversion,
                network: blockchainInfo.chain,
                warnings: networkInfo.warnings ? [networkInfo.warnings] : [],
                masternodeCount: masternodeCount.total,
                instantSendEnabled: this.config.enableInstantSend || false,
                privateSendEnabled: this.config.enablePrivateSend || false
            };
        }
        catch (error) {
            logger_1.default.error('Dash health check failed:', error);
            return {
                connected: false,
                blockHeight: 0,
                connections: 0,
                version: 'unknown',
                network: 'unknown',
                warnings: [error.message],
                masternodeCount: 0,
                instantSendEnabled: false,
                privateSendEnabled: false
            };
        }
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
    async importAddress(address, label, rescan = false) {
        const params = [address];
        if (label !== undefined)
            params.push(label);
        if (rescan !== undefined)
            params.push(rescan);
        await this.rpcCall('importaddress', params);
    }
    /**
     * Мониторинг новых блоков Dash
     */
    async waitForNewBlock(timeout = 60000) {
        return this.rpcCall('waitfornewblock', [timeout / 1000]);
    }
    /**
     * Получение информации о квораме (для ChainLocks)
     */
    async getQuorumInfo(quorumType, quorumHash) {
        return this.rpcCall('quorum', ['info', quorumType, quorumHash]);
    }
    /**
     * Получение списка квораумов
     */
    async listQuorums(count) {
        const params = count ? [count] : [];
        return this.rpcCall('quorum', ['list', ...params]);
    }
}
exports.DashCoreClient = DashCoreClient;
//# sourceMappingURL=DashCoreClient.js.map