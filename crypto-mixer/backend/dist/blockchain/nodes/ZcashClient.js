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
exports.ZcashClient = void 0;
const axios_1 = __importDefault(require("axios"));
const bitcoin = __importStar(require("bitcoinjs-lib"));
const ecc = __importStar(require("tiny-secp256k1"));
const ecpair_1 = require("ecpair");
const logger_1 = __importDefault(require("../../utils/logger"));
bitcoin.initEccLib(ecc);
const ECPair = (0, ecpair_1.ECPairFactory)(ecc);
/**
 * Сеть Zcash с параметрами
 */
const zcashNetwork = {
    messagePrefix: '\x18Zcash Signed Message:\n',
    bech32: 'zs', // Для будущих Sapling адресов
    bip32: {
        public: 0x0488b21e,
        private: 0x0488ade4,
    },
    pubKeyHash: 0x1cb8, // t1 адреса (transparent)
    scriptHash: 0x1cbd, // t3 адреса (multisig)
    wif: 0x80,
};
/**
 * Продакшн-готовый клиент для Zcash
 * Полная интеграция с Zcash daemon через RPC API
 * Поддерживает transparent и shielded транзакции (Sprout и Sapling)
 */
class ZcashClient {
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
            enableShielded: true,
            defaultShieldedAddress: 'sapling',
            autoShieldTransparent: false,
            shieldingThreshold: 0.1, // Авто-шилдинг при 0.1 ZEC
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
                'User-Agent': 'CryptoMixer-Zcash/1.0'
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
     * Выполнение RPC запроса к Zcash
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
                    throw new Error(`Zcash RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
                }
                this.isConnected = true;
                return response.data.result;
            }
            catch (error) {
                lastError = error;
                this.isConnected = false;
                logger_1.default.warn(`Zcash RPC attempt ${attempt} failed`, {
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
        logger_1.default.error('Zcash RPC failed after all retries', {
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
                logger_1.default.warn('Zcash health check failed', { error });
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
     * Получение информации о блокчейне Zcash
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
     * Получение информации о кошельке
     */
    async getWalletInfo() {
        return this.rpcCall('getwalletinfo');
    }
    /**
     * Создание нового transparent адреса
     */
    async getNewAddress(label) {
        const params = label ? [label] : [];
        return this.rpcCall('getnewaddress', params);
    }
    /**
     * Создание нового shielded адреса
     */
    async getNewShieldedAddress(type = 'sapling') {
        if (!this.config.enableShielded) {
            throw new Error('Shielded адреса отключены в конфигурации');
        }
        if (type === 'sprout') {
            return this.rpcCall('z_getnewaddress', ['sprout']);
        }
        else {
            return this.rpcCall('z_getnewaddress', ['sapling']);
        }
    }
    /**
     * Получение баланса кошелька (transparent)
     */
    async getBalance(minConfirmations = 1) {
        return this.rpcCall('getbalance', ['*', minConfirmations]);
    }
    /**
     * Получение shielded баланса
     */
    async getShieldedBalance(address, minConfirmations = 1) {
        if (!this.config.enableShielded) {
            return 0;
        }
        const params = address ? [address, minConfirmations] : [minConfirmations];
        return this.rpcCall('z_getbalance', params);
    }
    /**
     * Получение общего баланса (transparent + shielded)
     */
    async getTotalBalance(minConfirmations = 1) {
        const [transparent, shielded] = await Promise.all([
            this.getBalance(minConfirmations),
            this.getShieldedBalance(undefined, minConfirmations)
        ]);
        return {
            transparent,
            shielded,
            total: transparent + shielded
        };
    }
    /**
     * Получение списка shielded адресов
     */
    async listShieldedAddresses() {
        if (!this.config.enableShielded) {
            return [];
        }
        return this.rpcCall('z_listaddresses');
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
     * Отправка transparent транзакции
     */
    async sendToAddress(address, amount, comment, commentTo) {
        const params = [address, amount];
        if (comment)
            params.push(comment);
        if (commentTo)
            params.push(commentTo);
        return this.rpcCall('sendtoaddress', params);
    }
    // ========== ZCASH SHIELDED МЕТОДЫ ==========
    /**
     * Отправка shielded транзакции
     */
    async sendShielded(fromAddress, toAddress, amount, memo, fee) {
        if (!this.config.enableShielded) {
            throw new Error('Shielded транзакции отключены в конфигурации');
        }
        const operation = {
            fromaddress: fromAddress,
            amounts: [{
                    address: toAddress,
                    amount: amount,
                    memo: memo ? Buffer.from(memo).toString('hex') : undefined
                }]
        };
        if (fee) {
            operation.fee = fee;
        }
        const operationId = await this.rpcCall('z_sendmany', [operation.fromaddress, operation.amounts, 1, operation.fee]);
        // Ожидаем завершения операции
        return this.waitForOperation(operationId);
    }
    /**
     * Экранирование transparent средств (t->z)
     */
    async shieldTransparentFunds(fromAddress, toShieldedAddress, amount, fee) {
        if (!this.config.enableShielded) {
            throw new Error('Shielded операции отключены в конфигурации');
        }
        // Если сумма не указана, шилдим весь баланс
        if (!amount) {
            const balance = await this.getBalance();
            amount = balance - (fee || 0.0001); // Оставляем место для комиссии
        }
        const operation = {
            fromaddress: fromAddress,
            amounts: [{
                    address: toShieldedAddress,
                    amount: amount
                }]
        };
        if (fee) {
            operation.fee = fee;
        }
        const operationId = await this.rpcCall('z_sendmany', [operation.fromaddress, operation.amounts, 1, operation.fee]);
        return this.waitForOperation(operationId);
    }
    /**
     * Разэкранирование shielded средств (z->t)
     */
    async unshieldFunds(fromShieldedAddress, toTransparentAddress, amount, fee) {
        if (!this.config.enableShielded) {
            throw new Error('Shielded операции отключены в конфигурации');
        }
        const operation = {
            fromaddress: fromShieldedAddress,
            amounts: [{
                    address: toTransparentAddress,
                    amount: amount
                }]
        };
        if (fee) {
            operation.fee = fee;
        }
        const operationId = await this.rpcCall('z_sendmany', [operation.fromaddress, operation.amounts, 1, operation.fee]);
        return this.waitForOperation(operationId);
    }
    /**
     * Получение статуса операции
     */
    async getOperationStatus(operationId) {
        const operations = await this.rpcCall('z_getoperationstatus', [[operationId]]);
        if (operations.length === 0) {
            throw new Error(`Операция ${operationId} не найдена`);
        }
        return operations[0];
    }
    /**
     * Ожидание завершения операции
     */
    async waitForOperation(operationId, maxWaitTime = 300000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
            const status = await this.getOperationStatus(operationId);
            if (status.status === 'success') {
                return status.result.txid;
            }
            else if (status.status === 'failed') {
                throw new Error(`Операция провалилась: ${status.error?.message || 'Unknown error'}`);
            }
            else if (status.status === 'cancelled') {
                throw new Error('Операция была отменена');
            }
            // Ждем 2 секунды перед следующей проверкой
            await this.delay(2000);
        }
        throw new Error(`Операция не завершилась в течение ${maxWaitTime / 1000} секунд`);
    }
    /**
     * Получение viewing key для shielded адреса
     */
    async getViewingKey(address) {
        return this.rpcCall('z_exportviewingkey', [address]);
    }
    /**
     * Импорт viewing key
     */
    async importViewingKey(viewingKey, rescan = 'whenkeyisnew', startHeight) {
        const params = [viewingKey, rescan];
        if (startHeight !== undefined) {
            params.push(startHeight);
        }
        await this.rpcCall('z_importviewingkey', params);
    }
    /**
     * Валидация Zcash адреса
     */
    async validateAddress(address) {
        // Проверяем и transparent и shielded адреса
        try {
            if (address.startsWith('t1') || address.startsWith('t3')) {
                const result = await this.rpcCall('validateaddress', [address]);
                return { ...result, type: 'transparent' };
            }
            else {
                const result = await this.rpcCall('z_validateaddress', [address]);
                return { ...result, type: result.type || 'shielded' };
            }
        }
        catch (error) {
            return { isvalid: false };
        }
    }
    /**
     * Создание transparent Zcash адреса программно
     */
    createTransparentAddress() {
        const keyPair = ECPair.makeRandom({ network: zcashNetwork });
        const { address } = bitcoin.payments.p2pkh({
            pubkey: keyPair.publicKey,
            network: zcashNetwork
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
            const [blockchainInfo, networkInfo, balances, shieldedAddresses] = await Promise.all([
                this.getBlockchainInfo(),
                this.getNetworkInfo(),
                this.getTotalBalance(),
                this.listShieldedAddresses().catch(() => [])
            ]);
            return {
                isConnected: this.isConnected,
                lastHealthCheck: this.lastHealthCheck,
                currentBlockHeight: blockchainInfo.blocks,
                connectionCount: networkInfo.connections,
                transparentBalance: balances.transparent,
                shieldedBalance: balances.shielded,
                totalBalance: balances.total,
                shieldedAddressCount: shieldedAddresses.length,
                valuePools: blockchainInfo.valuePools
            };
        }
        catch (error) {
            logger_1.default.error('Failed to get Zcash performance stats', { error });
            throw error;
        }
    }
    /**
     * Проверка здоровья Zcash ноды
     */
    async healthCheck() {
        try {
            const [blockchainInfo, networkInfo, balances] = await Promise.all([
                this.getBlockchainInfo(),
                this.getNetworkInfo(),
                this.getTotalBalance().catch(() => ({ transparent: 0, shielded: 0, total: 0 }))
            ]);
            const upgradeStatus = {};
            for (const [name, upgrade] of Object.entries(blockchainInfo.upgrades)) {
                upgradeStatus[name] = upgrade.status;
            }
            return {
                connected: true,
                blockHeight: blockchainInfo.blocks,
                connections: networkInfo.connections,
                version: networkInfo.subversion,
                network: blockchainInfo.chain,
                warnings: networkInfo.warnings ? [networkInfo.warnings] : [],
                shieldedEnabled: this.config.enableShielded || false,
                transparentBalance: balances.transparent,
                shieldedBalance: balances.shielded,
                upgradeStatus
            };
        }
        catch (error) {
            logger_1.default.error('Zcash health check failed:', error);
            return {
                connected: false,
                blockHeight: 0,
                connections: 0,
                version: 'unknown',
                network: 'unknown',
                warnings: [error.message],
                shieldedEnabled: false,
                transparentBalance: 0,
                shieldedBalance: 0,
                upgradeStatus: {}
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
     * Автоматическое экранирование transparent средств при превышении порога
     */
    async autoShieldIfNeeded() {
        if (!this.config.autoShieldTransparent || !this.config.enableShielded) {
            return null;
        }
        const transparentBalance = await this.getBalance();
        if (transparentBalance >= this.config.shieldingThreshold) {
            try {
                // Создаем новый shielded адрес для автошилдинга
                const shieldedAddress = await this.getNewShieldedAddress(this.config.defaultShieldedAddress);
                logger_1.default.info('Автоматическое экранирование transparent средств', {
                    amount: transparentBalance,
                    threshold: this.config.shieldingThreshold,
                    toAddress: shieldedAddress.substring(0, 20) + '...'
                });
                return await this.shieldTransparentFunds('', shieldedAddress, transparentBalance - 0.0001);
            }
            catch (error) {
                logger_1.default.error('Ошибка автоматического экранирования', { error });
                return null;
            }
        }
        return null;
    }
}
exports.ZcashClient = ZcashClient;
//# sourceMappingURL=ZcashClient.js.map