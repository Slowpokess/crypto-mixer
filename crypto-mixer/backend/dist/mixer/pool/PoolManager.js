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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoolManager = void 0;
const events_1 = require("events");
const crypto = __importStar(require("crypto"));
/**
 * Система управления пулами ликвидности для микширования
 * Обеспечивает эффективное распределение и смешивание средств
 */
class PoolManager extends events_1.EventEmitter {
    constructor(dependencies = {}) {
        super();
        this.database = dependencies.database;
        this.logger = dependencies.logger;
        this.security = dependencies.security;
        this.blockchainManager = dependencies.blockchainManager;
        // Конфигурация пулов
        this.config = {
            // Минимальный размер пула для каждой валюты
            minPoolSizes: {
                BTC: 1.0,
                ETH: 10.0,
                USDT: 10000,
                SOL: 100,
                ...dependencies.config?.minPoolSizes
            },
            // Максимальный размер пула
            maxPoolSizes: {
                BTC: 100.0,
                ETH: 1000.0,
                USDT: 10000000,
                SOL: 100000,
                ...dependencies.config?.maxPoolSizes
            },
            // Целевой размер пула (оптимальный)
            targetPoolSizes: {
                BTC: 10.0,
                ETH: 100.0,
                USDT: 1000000,
                SOL: 10000,
                ...dependencies.config?.targetPoolSizes
            },
            // Время жизни средств в пуле (мс)
            maxPoolAge: 24 * 60 * 60 * 1000, // 24 часа
            // Интервал ребалансировки пулов
            rebalanceInterval: 60 * 60 * 1000, // 1 час
            // Минимальное количество участников для смешивания
            minMixParticipants: 3,
            // Максимальное количество промежуточных адресов
            maxIntermediateAddresses: 10,
            ...dependencies.config
        };
        // Состояние пулов
        this.pools = new Map(); // currency -> PoolData
        this.intermediateAddresses = new Map(); // currency -> addresses[]
        this.mixingQueues = new Map(); // currency -> queue[]
        this.rebalanceTimers = new Map();
        // Метрики пулов
        this.metrics = {
            totalTransactions: 0,
            totalVolume: new Map(),
            averagePoolUtilization: 0,
            rebalanceCount: 0,
            lastOptimization: null
        };
        this.isMonitoring = false;
        this.logger?.info('PoolManager инициализирован');
    }
    /**
     * Запускает мониторинг пулов
     */
    async startMonitoring() {
        try {
            if (this.isMonitoring) {
                return;
            }
            this.logger?.info('Запуск мониторинга пулов...');
            // Инициализируем пулы для всех валют
            await this._initializePools();
            // Загружаем данные из БД
            await this._loadPoolData();
            // Запускаем мониторинг
            this._startPoolMonitoring();
            // Запускаем оптимизацию
            this._startPoolOptimization();
            this.isMonitoring = true;
            this.emit('monitoring:started');
            this.logger?.info('Мониторинг пулов запущен', {
                poolCount: this.pools.size,
                currencies: Array.from(this.pools.keys())
            });
        }
        catch (error) {
            this.logger?.error('Ошибка запуска мониторинга пулов:', error);
            throw error;
        }
    }
    /**
     * Останавливает мониторинг пулов
     */
    async stopMonitoring() {
        try {
            if (!this.isMonitoring) {
                return;
            }
            this.logger?.info('Остановка мониторинга пулов...');
            // Останавливаем все таймеры
            if (this.monitoringInterval) {
                clearInterval(this.monitoringInterval);
            }
            if (this.optimizationInterval) {
                clearInterval(this.optimizationInterval);
            }
            // Останавливаем таймеры ребалансировки
            for (const timer of this.rebalanceTimers.values()) {
                clearTimeout(timer);
            }
            this.rebalanceTimers.clear();
            // Сохраняем данные в БД
            await this._savePoolData();
            this.isMonitoring = false;
            this.emit('monitoring:stopped');
            this.logger?.info('Мониторинг пулов остановлен');
        }
        catch (error) {
            this.logger?.error('Ошибка остановки мониторинга пулов:', error);
            throw error;
        }
    }
    /**
     * Добавляет средства в пул
     */
    async addToPool(request) {
        const { currency, amount, depositAddress } = request;
        try {
            // Получаем или создаем пул
            const pool = this._getOrCreatePool(currency);
            // Создаем транзакцию в пуле
            const transaction = {
                id: crypto.randomUUID(),
                amount,
                address: depositAddress,
                timestamp: new Date(),
                status: 'PENDING'
            };
            pool.transactions.push(transaction);
            pool.totalAmount += amount;
            pool.availableAmount += amount;
            // Обновляем метрики
            this.metrics.totalTransactions++;
            const currentVolume = this.metrics.totalVolume.get(currency) || 0;
            this.metrics.totalVolume.set(currency, currentVolume + amount);
            // Проверяем готовность к микшированию
            await this._checkMixingReadiness(currency);
            this.emit('pool:deposit', { currency, amount, transactionId: transaction.id });
            this.logger?.info('Средства добавлены в пул', {
                currency,
                amount,
                poolSize: pool.totalAmount,
                transactionId: transaction.id
            });
        }
        catch (error) {
            this.logger?.error('Ошибка добавления в пул:', error);
            throw error;
        }
    }
    /**
     * Обрабатывает часть микширования
     */
    async processMixingChunk(chunk, sessionId) {
        const { currency, amount } = chunk;
        try {
            const pool = this.pools.get(currency);
            if (!pool) {
                throw new Error(`Пул для ${currency} не найден`);
            }
            // Резервируем средства для микширования
            if (pool.availableAmount < amount) {
                throw new Error(`Недостаточно средств в пуле ${currency}`);
            }
            pool.availableAmount -= amount;
            pool.lockedAmount += amount;
            // Добавляем в очередь микширования
            await this._addToMixingQueue(currency, {
                id: sessionId,
                amount,
                inputAddress: '', // Будет заполнено позже
                outputAddresses: [],
                joinedAt: new Date()
            });
            this.emit('pool:chunk_processed', { currency, amount, sessionId });
            this.logger?.debug('Обработан чанк микширования', {
                currency,
                amount,
                sessionId,
                availableAmount: pool.availableAmount
            });
        }
        catch (error) {
            this.logger?.error('Ошибка обработки чанка микширования:', error);
            throw error;
        }
    }
    /**
     * Получает статистику пула для валюты
     */
    async getPoolStatistics(currency) {
        const pool = this.pools.get(currency);
        if (!pool) {
            return {
                currency,
                size: 0,
                utilization: 0,
                participants: 0,
                averageTransactionSize: 0,
                lastActivity: new Date(0),
                healthScore: 0
            };
        }
        const utilization = pool.totalAmount > 0 ? (pool.lockedAmount / pool.totalAmount) * 100 : 0;
        const averageTransactionSize = pool.transactions.length > 0
            ? pool.transactions.reduce((sum, tx) => sum + tx.amount, 0) / pool.transactions.length
            : 0;
        const lastActivity = pool.transactions.length > 0
            ? new Date(Math.max(...pool.transactions.map(tx => tx.timestamp.getTime())))
            : new Date(0);
        const healthScore = this._calculatePoolHealth(pool);
        return {
            currency,
            size: pool.totalAmount,
            utilization,
            participants: pool.transactions.length,
            averageTransactionSize,
            lastActivity,
            healthScore
        };
    }
    /**
     * Получает общую статистику всех пулов
     */
    getOverallStatistics() {
        const stats = {
            totalPools: this.pools.size,
            totalLiquidity: new Map(),
            averageUtilization: 0,
            totalTransactions: this.metrics.totalTransactions,
            totalVolume: this.metrics.totalVolume,
            rebalanceCount: this.metrics.rebalanceCount
        };
        let totalUtilization = 0;
        let poolCount = 0;
        for (const [currency, pool] of this.pools) {
            stats.totalLiquidity.set(currency, pool.totalAmount);
            totalUtilization += pool.utilizationRate;
            poolCount++;
        }
        stats.averageUtilization = poolCount > 0 ? totalUtilization / poolCount : 0;
        return stats;
    }
    /**
     * Проверка здоровья пулов
     */
    async healthCheck() {
        const issues = [];
        const poolStatuses = {};
        let healthyPools = 0;
        let totalPools = 0;
        for (const [currency, pool] of this.pools) {
            totalPools++;
            const health = this._calculatePoolHealth(pool);
            const utilization = pool.utilizationRate;
            let status = 'pass';
            let message = 'Пул работает нормально';
            if (health < 50) {
                status = 'fail';
                message = 'Критическое состояние пула';
                issues.push(`Пул ${currency} в критическом состоянии`);
            }
            else if (health < 80) {
                status = 'warn';
                message = 'Пул требует внимания';
                issues.push(`Пул ${currency} требует оптимизации`);
            }
            else {
                healthyPools++;
            }
            if (utilization > 95) {
                status = 'warn';
                message = 'Очень высокая загрузка пула';
                issues.push(`Пул ${currency} перегружен (${utilization}%)`);
            }
            poolStatuses[currency] = {
                status,
                message,
                size: pool.totalAmount,
                utilization
            };
        }
        // Проверка общих показателей
        const queueLength = Array.from(this.mixingQueues.values()).reduce((sum, queue) => sum + queue.participants.length, 0);
        if (queueLength > 100) {
            issues.push(`Большие очереди микширования: ${queueLength}`);
        }
        if (!this.isMonitoring) {
            issues.push('Мониторинг пулов не активен');
        }
        const healthy = issues.length === 0 && healthyPools === totalPools;
        const status = healthy ? 'healthy' : (issues.some(i => i.includes('критическом')) ? 'unhealthy' : 'degraded');
        return {
            healthy,
            status,
            pools: poolStatuses,
            details: {
                totalPools,
                activePools: healthyPools,
                totalLiquidity: new Map(Array.from(this.pools.entries()).map(([k, v]) => [k, v.totalAmount])),
                averageUtilization: this.metrics.averagePoolUtilization,
                queueLength
            },
            issues
        };
    }
    // Приватные методы (заглушки для основной структуры)
    async _initializePools() {
        const currencies = ['BTC', 'ETH', 'USDT', 'SOL'];
        for (const currency of currencies) {
            this._getOrCreatePool(currency);
        }
        this.logger?.debug('Пулы инициализированы', { currencies });
    }
    async _loadPoolData() {
        // TODO: Загрузка данных пулов из БД
        this.logger?.debug('Загрузка данных пулов из БД');
    }
    async _savePoolData() {
        // TODO: Сохранение данных пулов в БД
        this.logger?.debug('Сохранение данных пулов в БД');
    }
    _startPoolMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this._monitorPools();
        }, 30000); // Каждые 30 секунд
    }
    _startPoolOptimization() {
        this.optimizationInterval = setInterval(() => {
            this._optimizePools();
        }, this.config.rebalanceInterval);
    }
    _getOrCreatePool(currency) {
        let pool = this.pools.get(currency);
        if (!pool) {
            pool = {
                currency,
                totalAmount: 0,
                availableAmount: 0,
                lockedAmount: 0,
                transactions: [],
                intermediateAddresses: [],
                lastRebalance: new Date(),
                utilizationRate: 0,
                averageAge: 0
            };
            this.pools.set(currency, pool);
            this.mixingQueues.set(currency, {
                currency,
                participants: [],
                targetAmount: 0,
                created: new Date(),
                status: 'WAITING'
            });
        }
        return pool;
    }
    async _checkMixingReadiness(currency) {
        const pool = this.pools.get(currency);
        const queue = this.mixingQueues.get(currency);
        if (!pool || !queue)
            return;
        const minSize = this.config.minPoolSizes[currency] || 0;
        if (pool.availableAmount >= minSize && queue.participants.length >= this.config.minMixParticipants) {
            await this._triggerMixing(currency);
        }
    }
    async _addToMixingQueue(currency, participant) {
        const queue = this.mixingQueues.get(currency);
        if (queue) {
            queue.participants.push(participant);
            await this._checkMixingReadiness(currency);
        }
    }
    async _triggerMixing(currency) {
        // TODO: Реализация триггера микширования
        this.logger?.debug('Триггер микширования', { currency });
    }
    _monitorPools() {
        for (const [currency, pool] of this.pools) {
            // Обновляем утилизацию
            pool.utilizationRate = pool.totalAmount > 0 ? (pool.lockedAmount / pool.totalAmount) * 100 : 0;
            // Проверяем необходимость ребалансировки
            this._checkRebalanceNeed(currency, pool);
        }
        // Обновляем общие метрики
        this._updateAverageUtilization();
    }
    _optimizePools() {
        this.metrics.lastOptimization = new Date();
        for (const currency of this.pools.keys()) {
            this._optimizePool(currency);
        }
        this.logger?.debug('Оптимизация пулов завершена');
    }
    _checkRebalanceNeed(currency, pool) {
        const target = this.config.targetPoolSizes[currency] || 0;
        const deviation = Math.abs(pool.totalAmount - target) / target;
        if (deviation > 0.2) { // 20% отклонение
            this._scheduleRebalance(currency);
        }
    }
    _scheduleRebalance(currency) {
        if (this.rebalanceTimers.has(currency))
            return;
        const timer = setTimeout(() => {
            this._rebalancePool(currency);
            this.rebalanceTimers.delete(currency);
        }, 60000); // Ребалансировка через минуту
        this.rebalanceTimers.set(currency, timer);
    }
    _rebalancePool(currency) {
        this.metrics.rebalanceCount++;
        this.emit('pool:rebalanced', { currency });
        this.logger?.info('Пул ребалансирован', { currency });
    }
    _optimizePool(currency) {
        // TODO: Реализация оптимизации пула
        this.logger?.debug('Оптимизация пула', { currency });
    }
    _updateAverageUtilization() {
        const totalUtilization = Array.from(this.pools.values())
            .reduce((sum, pool) => sum + pool.utilizationRate, 0);
        this.metrics.averagePoolUtilization = this.pools.size > 0 ? totalUtilization / this.pools.size : 0;
    }
    _calculatePoolHealth(pool) {
        let health = 100;
        // Проверяем размер пула
        const minSize = this.config.minPoolSizes[pool.currency] || 0;
        const maxSize = this.config.maxPoolSizes[pool.currency] || Infinity;
        if (pool.totalAmount < minSize) {
            health -= 30; // Штраф за маленький размер
        }
        if (pool.totalAmount > maxSize) {
            health -= 20; // Штраф за переполнение
        }
        // Проверяем утилизацию
        if (pool.utilizationRate > 90) {
            health -= 25; // Штраф за перегрузку
        }
        else if (pool.utilizationRate < 10) {
            health -= 15; // Штраф за недоиспользование
        }
        // Проверяем возраст транзакций
        const now = Date.now();
        const oldTransactions = pool.transactions.filter(tx => now - tx.timestamp.getTime() > this.config.maxPoolAge);
        if (oldTransactions.length > 0) {
            health -= oldTransactions.length * 5; // Штраф за старые транзакции
        }
        return Math.max(0, Math.min(100, health));
    }
}
exports.PoolManager = PoolManager;
exports.default = PoolManager;
//# sourceMappingURL=PoolManager.js.map