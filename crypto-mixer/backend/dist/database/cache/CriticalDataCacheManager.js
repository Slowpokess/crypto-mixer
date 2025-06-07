"use strict";
/**
 * Менеджер кэширования критических данных микширования
 *
 * Специализированное кэширование для:
 * - Активные запросы микширования
 * - Балансы кошельков и пулы ликвидности
 * - Курсы валют и комиссии
 * - Временные ключи и сессии
 * - Blockchain confirmations статусы
 * - Anti-fraud данные и блэклисты
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CriticalDataCacheManager = void 0;
const logger_1 = require("../logger");
const events_1 = require("events");
/**
 * Менеджер критических данных с высокой производительностью
 */
class CriticalDataCacheManager extends events_1.EventEmitter {
    constructor(cache) {
        super();
        // Cache prefixes для разных типов данных
        this.PREFIXES = {
            MIXING_SESSION: 'mix_session:',
            WALLET_BALANCE: 'wallet_balance:',
            EXCHANGE_RATE: 'exchange_rate:',
            ANTIFRAUD: 'antifraud:',
            CONFIRMATION: 'confirmation:',
            TEMP_KEY: 'temp_key:',
            USER_SESSION: 'user_session:',
            BLACKLIST: 'blacklist:',
            WHITELIST: 'whitelist:'
        };
        // TTL константы (в секундах)
        this.TTL = {
            MIXING_SESSION: 3600 * 24, // 24 часа
            WALLET_BALANCE: 60, // 1 минута
            EXCHANGE_RATE: 300, // 5 минут
            ANTIFRAUD: 3600 * 24 * 7, // 1 неделя
            CONFIRMATION: 300, // 5 минут
            TEMP_KEY: 1800, // 30 минут
            USER_SESSION: 3600 * 2, // 2 часа
            BLACKLIST: 3600 * 24, // 24 часа
            WHITELIST: 3600 * 12 // 12 часов
        };
        this.cache = cache;
        logger_1.enhancedDbLogger.info('🔒 CriticalDataCacheManager инициализирован');
    }
    /**
     * MIXING SESSION MANAGEMENT
     */
    /**
     * Сохранение данных сессии микширования
     */
    async setMixingSession(sessionData) {
        try {
            const key = `${this.PREFIXES.MIXING_SESSION}${sessionData.id}`;
            await this.cache.set(key, sessionData, this.TTL.MIXING_SESSION);
            // Также индексируем по deposit address для быстрого поиска
            const depositKey = `${this.PREFIXES.MIXING_SESSION}deposit:${sessionData.depositAddress}`;
            await this.cache.set(depositKey, sessionData.id, this.TTL.MIXING_SESSION);
            logger_1.enhancedDbLogger.debug('💾 Mixing session сохранена', {
                sessionId: sessionData.id,
                status: sessionData.status,
                currency: sessionData.currency
            });
            this.emit('mixing_session_cached', sessionData);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка сохранения mixing session', {
                sessionId: sessionData.id,
                error
            });
            throw error;
        }
    }
    /**
     * Получение данных сессии микширования
     */
    async getMixingSession(sessionId) {
        try {
            const key = `${this.PREFIXES.MIXING_SESSION}${sessionId}`;
            const sessionData = await this.cache.get(key);
            if (sessionData) {
                logger_1.enhancedDbLogger.debug('✅ Mixing session найдена', {
                    sessionId,
                    status: sessionData.status
                });
            }
            return sessionData;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения mixing session', { sessionId, error });
            return null;
        }
    }
    /**
     * Поиск сессии по deposit address
     */
    async findMixingSessionByDeposit(depositAddress) {
        try {
            const depositKey = `${this.PREFIXES.MIXING_SESSION}deposit:${depositAddress}`;
            const sessionId = await this.cache.get(depositKey);
            if (!sessionId)
                return null;
            return await this.getMixingSession(sessionId);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка поиска session по deposit', { depositAddress, error });
            return null;
        }
    }
    /**
     * Обновление статуса сессии микширования
     */
    async updateMixingSessionStatus(sessionId, status, metadata) {
        try {
            const existingSession = await this.getMixingSession(sessionId);
            if (!existingSession)
                return false;
            const updatedSession = {
                ...existingSession,
                status,
                lastUpdated: new Date(),
                ...metadata
            };
            await this.setMixingSession(updatedSession);
            logger_1.enhancedDbLogger.info('🔄 Mixing session статус обновлен', {
                sessionId,
                oldStatus: existingSession.status,
                newStatus: status
            });
            this.emit('mixing_session_status_updated', { sessionId, oldStatus: existingSession.status, newStatus: status });
            return true;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка обновления статуса session', { sessionId, status, error });
            return false;
        }
    }
    /**
     * WALLET BALANCE MANAGEMENT
     */
    /**
     * Кэширование баланса кошелька
     */
    async setWalletBalance(balanceData) {
        try {
            const key = `${this.PREFIXES.WALLET_BALANCE}${balanceData.id}`;
            await this.cache.set(key, balanceData, this.TTL.WALLET_BALANCE);
            // Индексируем по валюте для быстрого поиска
            const currencyKey = `${this.PREFIXES.WALLET_BALANCE}currency:${balanceData.currency}`;
            const currencyWallets = await this.cache.get(currencyKey) || [];
            if (!currencyWallets.includes(balanceData.id)) {
                currencyWallets.push(balanceData.id);
                await this.cache.set(currencyKey, currencyWallets, this.TTL.WALLET_BALANCE);
            }
            logger_1.enhancedDbLogger.debug('💰 Wallet balance кэширован', {
                walletId: balanceData.id,
                currency: balanceData.currency,
                balance: balanceData.balance
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка кэширования wallet balance', {
                walletId: balanceData.id,
                error
            });
            throw error;
        }
    }
    /**
     * Получение баланса кошелька
     */
    async getWalletBalance(walletId) {
        try {
            const key = `${this.PREFIXES.WALLET_BALANCE}${walletId}`;
            return await this.cache.get(key);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения wallet balance', { walletId, error });
            return null;
        }
    }
    /**
     * Инвалидация баланса кошелька
     */
    async invalidateWalletBalance(walletId) {
        try {
            const key = `${this.PREFIXES.WALLET_BALANCE}${walletId}`;
            await this.cache.delete(key);
            logger_1.enhancedDbLogger.debug('🗑️ Wallet balance инвалидирован', { walletId });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инвалидации wallet balance', { walletId, error });
        }
    }
    /**
     * EXCHANGE RATES MANAGEMENT
     */
    /**
     * Кэширование курса валют
     */
    async setExchangeRate(rateData) {
        try {
            const key = `${this.PREFIXES.EXCHANGE_RATE}${rateData.baseCurrency}_${rateData.quoteCurrency}`;
            await this.cache.set(key, rateData, this.TTL.EXCHANGE_RATE);
            logger_1.enhancedDbLogger.debug('📈 Exchange rate кэширован', {
                pair: `${rateData.baseCurrency}/${rateData.quoteCurrency}`,
                rate: rateData.rate,
                source: rateData.source
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка кэширования exchange rate', {
                pair: `${rateData.baseCurrency}/${rateData.quoteCurrency}`,
                error
            });
            throw error;
        }
    }
    /**
     * Получение курса валют
     */
    async getExchangeRate(baseCurrency, quoteCurrency) {
        try {
            const key = `${this.PREFIXES.EXCHANGE_RATE}${baseCurrency}_${quoteCurrency}`;
            return await this.cache.get(key);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения exchange rate', {
                baseCurrency,
                quoteCurrency,
                error
            });
            return null;
        }
    }
    /**
     * ANTIFRAUD & SECURITY MANAGEMENT
     */
    /**
     * Кэширование antifraud данных
     */
    async setAntifraudData(data) {
        try {
            const key = `${this.PREFIXES.ANTIFRAUD}${data.address}`;
            await this.cache.set(key, data, this.TTL.ANTIFRAUD);
            // Если risk score высокий, добавляем в blacklist
            if (data.riskScore >= 80) {
                await this.addToBlacklist(data.address, `High risk score: ${data.riskScore}`);
            }
            logger_1.enhancedDbLogger.debug('🛡️ Antifraud данные кэшированы', {
                address: data.address.substring(0, 10) + '...',
                riskScore: data.riskScore,
                flags: data.flags
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка кэширования antifraud данных', {
                address: data.address,
                error
            });
            throw error;
        }
    }
    /**
     * Получение antifraud данных
     */
    async getAntifraudData(address) {
        try {
            const key = `${this.PREFIXES.ANTIFRAUD}${address}`;
            return await this.cache.get(key);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения antifraud данных', { address, error });
            return null;
        }
    }
    /**
     * Добавление адреса в blacklist
     */
    async addToBlacklist(address, reason) {
        try {
            const key = `${this.PREFIXES.BLACKLIST}${address}`;
            await this.cache.set(key, {
                address,
                reason,
                addedAt: new Date(),
                source: 'INTERNAL'
            }, this.TTL.BLACKLIST);
            logger_1.enhancedDbLogger.warn('⚠️ Адрес добавлен в blacklist', {
                address: address.substring(0, 10) + '...',
                reason
            });
            this.emit('address_blacklisted', { address, reason });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка добавления в blacklist', { address, reason, error });
            throw error;
        }
    }
    /**
     * Проверка, находится ли адрес в blacklist
     */
    async isBlacklisted(address) {
        try {
            const key = `${this.PREFIXES.BLACKLIST}${address}`;
            const result = await this.cache.exists(key);
            if (result) {
                logger_1.enhancedDbLogger.warn('🚫 Обнаружен blacklisted адрес', {
                    address: address.substring(0, 10) + '...'
                });
            }
            return result;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка проверки blacklist', { address, error });
            return false;
        }
    }
    /**
     * BLOCKCHAIN CONFIRMATIONS MANAGEMENT
     */
    /**
     * Кэширование данных о подтверждениях
     */
    async setConfirmationData(data) {
        try {
            const key = `${this.PREFIXES.CONFIRMATION}${data.txid}`;
            await this.cache.set(key, data, this.TTL.CONFIRMATION);
            logger_1.enhancedDbLogger.debug('⛓️ Confirmation данные кэшированы', {
                txid: data.txid.substring(0, 16) + '...',
                confirmations: data.confirmations,
                isConfirmed: data.isConfirmed
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка кэширования confirmation данных', {
                txid: data.txid,
                error
            });
            throw error;
        }
    }
    /**
     * Получение данных о подтверждениях
     */
    async getConfirmationData(txid) {
        try {
            const key = `${this.PREFIXES.CONFIRMATION}${txid}`;
            return await this.cache.get(key);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения confirmation данных', { txid, error });
            return null;
        }
    }
    /**
     * TEMPORARY KEYS & SESSION MANAGEMENT
     */
    /**
     * Сохранение временного ключа
     */
    async setTempKey(keyId, data, customTTL) {
        try {
            const key = `${this.PREFIXES.TEMP_KEY}${keyId}`;
            const ttl = customTTL || this.TTL.TEMP_KEY;
            await this.cache.set(key, data, ttl);
            logger_1.enhancedDbLogger.debug('🔑 Временный ключ сохранен', { keyId, ttl });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка сохранения временного ключа', { keyId, error });
            throw error;
        }
    }
    /**
     * Получение временного ключа
     */
    async getTempKey(keyId) {
        try {
            const key = `${this.PREFIXES.TEMP_KEY}${keyId}`;
            return await this.cache.get(key);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения временного ключа', { keyId, error });
            return null;
        }
    }
    /**
     * Удаление временного ключа
     */
    async deleteTempKey(keyId) {
        try {
            const key = `${this.PREFIXES.TEMP_KEY}${keyId}`;
            const deleted = await this.cache.delete(key);
            if (deleted) {
                logger_1.enhancedDbLogger.debug('🗑️ Временный ключ удален', { keyId });
            }
            return deleted;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка удаления временного ключа', { keyId, error });
            return false;
        }
    }
    /**
     * BULK OPERATIONS для высокой производительности
     */
    /**
     * Bulk кэширование балансов кошельков
     */
    async bulkSetWalletBalances(balances) {
        try {
            const operations = balances.map(balance => ({
                type: 'set',
                key: `${this.PREFIXES.WALLET_BALANCE}${balance.id}`,
                value: balance,
                ttl: this.TTL.WALLET_BALANCE
            }));
            await this.cache.executeBatch({ operations });
            logger_1.enhancedDbLogger.debug('📦 Bulk кэширование балансов', { count: balances.length });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка bulk кэширования балансов', {
                count: balances.length,
                error
            });
            throw error;
        }
    }
    /**
     * Bulk получение балансов кошельков
     */
    async bulkGetWalletBalances(walletIds) {
        try {
            const operations = walletIds.map(id => ({
                type: 'get',
                key: `${this.PREFIXES.WALLET_BALANCE}${id}`
            }));
            const results = await this.cache.executeBatch({ operations });
            const balancesMap = new Map();
            walletIds.forEach((id, index) => {
                balancesMap.set(id, results[index] || null);
            });
            logger_1.enhancedDbLogger.debug('📦 Bulk получение балансов', { count: walletIds.length });
            return balancesMap;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка bulk получения балансов', {
                count: walletIds.length,
                error
            });
            throw error;
        }
    }
    /**
     * ANALYTICS & MONITORING
     */
    /**
     * Получение статистики кэша критических данных
     */
    getCacheStats() {
        return {
            ...this.cache.getStats(),
            prefixes: Object.keys(this.PREFIXES),
            ttlSettings: this.TTL
        };
    }
    /**
     * Очистка всех критических данных (ОСТОРОЖНО!)
     */
    async clearAllCriticalData() {
        logger_1.enhancedDbLogger.warn('⚠️ Очистка ВСЕХ критических данных!');
        try {
            for (const prefix of Object.values(this.PREFIXES)) {
                await this.cache.invalidatePattern(prefix);
            }
            logger_1.enhancedDbLogger.info('✅ Все критические данные очищены');
            this.emit('all_critical_data_cleared');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка очистки критических данных', { error });
            throw error;
        }
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger_1.enhancedDbLogger.info('🔄 Остановка CriticalDataCacheManager...');
        // Кэш будет остановлен в основном менеджере
        this.removeAllListeners();
        logger_1.enhancedDbLogger.info('✅ CriticalDataCacheManager остановлен');
    }
}
exports.CriticalDataCacheManager = CriticalDataCacheManager;
exports.default = CriticalDataCacheManager;
//# sourceMappingURL=CriticalDataCacheManager.js.map