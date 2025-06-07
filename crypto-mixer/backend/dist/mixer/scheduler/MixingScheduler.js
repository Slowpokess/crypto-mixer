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
exports.MixingScheduler = void 0;
const events_1 = require("events");
const crypto = __importStar(require("crypto"));
const MemoryManager_1 = require("../../utils/MemoryManager");
/**
 * Планировщик операций микширования
 * Координирует временные задержки, распределяет нагрузку и управляет очередями
 */
class MixingScheduler extends events_1.EventEmitter {
    constructor(dependencies = {}) {
        super();
        // Using MemoryManager for timer management
        this.SCHEDULE_TIMER = 'scheduler:schedule-loop';
        this.EXECUTION_TIMER = 'scheduler:execution-loop';
        this.CLEANUP_TIMER = 'scheduler:cleanup';
        this.METRICS_TIMER = 'scheduler:metrics';
        this.database = dependencies.database;
        this.logger = dependencies.logger;
        this.blockchainManager = dependencies.blockchainManager;
        this.poolManager = dependencies.poolManager;
        this.security = dependencies.security;
        // Конфигурация планировщика
        this.config = {
            // Минимальная задержка между операциями (мс)
            minDelay: 10000, // 10 секунд
            // Максимальная задержка между операциями (мс)  
            maxDelay: 72 * 60 * 60 * 1000, // 72 часа
            // Максимальное количество одновременных операций
            maxConcurrentOperations: 50,
            // Интервал проверки расписания (мс)
            scheduleCheckInterval: 30000, // 30 секунд
            // Максимальное количество попыток выполнения
            maxRetryAttempts: 5,
            // Экспоненциальный коэффициент задержки для повторов
            retryBackoffMultiplier: 2,
            // Время жизни запланированной операции (мс)
            operationTTL: 7 * 24 * 60 * 60 * 1000, // 7 дней
            // Размер батча для обработки
            batchSize: 10,
            ...dependencies.config
        };
        // Состояние планировщика с bounded collections
        this.state = {
            isRunning: false,
            scheduledOperations: MemoryManager_1.memoryManager.createBoundedMap('scheduler:operations', {
                maxSize: 10000,
                cleanupThreshold: 0.8,
                ttl: this.config.operationTTL
            }),
            activeOperations: MemoryManager_1.memoryManager.createBoundedMap('scheduler:active', {
                maxSize: this.config.maxConcurrentOperations * 2,
                cleanupThreshold: 0.9,
                ttl: 4 * 60 * 60 * 1000 // 4 hours max execution time
            }),
            operationQueue: [],
            statistics: {
                totalScheduled: 0,
                totalExecuted: 0,
                totalFailed: 0,
                averageDelay: 0,
                successRate: 0
            }
        };
        // Типы операций и их приоритеты
        this.operationTypes = {
            DISTRIBUTION: { priority: 1, maxConcurrent: 20 },
            CONSOLIDATION: { priority: 2, maxConcurrent: 10 },
            REBALANCING: { priority: 3, maxConcurrent: 5 },
            COINJOIN: { priority: 1, maxConcurrent: 15 },
            CLEANUP: { priority: 4, maxConcurrent: 5 }
        };
        this.logger?.info('MixingScheduler инициализирован');
        // Setup memory manager listeners
        this._setupMemoryListeners();
    }
    /**
     * Запускает планировщик
     */
    async start() {
        try {
            if (this.state.isRunning) {
                throw new Error('Планировщик уже запущен');
            }
            this.logger?.info('Запуск планировщика микширования...');
            // Загружаем незавершенные операции из БД
            await this._loadScheduledOperations();
            // Запускаем основной цикл планировщика
            this._startScheduleLoop();
            // Запускаем исполнительный цикл
            this._startExecutionLoop();
            // Запускаем периодические задачи
            this._startPeriodicTasks();
            this.state.isRunning = true;
            this.emit('scheduler:started');
            this.logger?.info('Планировщик микширования запущен', {
                scheduledOperations: this.state.scheduledOperations.size,
                queueLength: this.state.operationQueue.length
            });
        }
        catch (error) {
            this.logger?.error('Ошибка запуска планировщика:', error);
            throw error;
        }
    }
    /**
     * Останавливает планировщик
     */
    async stop() {
        try {
            if (!this.state.isRunning) {
                return;
            }
            this.logger?.info('Остановка планировщика микширования...');
            this.state.isRunning = false;
            // Останавливаем все таймеры
            this._clearAllTimers();
            // Ждем завершения активных операций
            await this._waitForActiveOperations();
            // Сохраняем состояние в БД
            await this._saveScheduledOperations();
            this.emit('scheduler:stopped');
            this.logger?.info('Планировщик микширования остановлен');
        }
        catch (error) {
            this.logger?.error('Ошибка остановки планировщика:', error);
            throw error;
        }
    }
    /**
     * Планирует операцию распределения средств
     */
    async scheduleDistribution(payload) {
        const operation = {
            id: crypto.randomUUID(),
            type: 'DISTRIBUTION',
            priority: this.operationTypes.DISTRIBUTION.priority,
            scheduledTime: new Date(Date.now() + (payload.delay || this.config.minDelay)),
            payload,
            retryCount: 0,
            maxRetries: this.config.maxRetryAttempts,
            createdAt: new Date(),
            mixId: payload.mixId,
            currency: payload.currency,
            amount: payload.amount,
            status: 'SCHEDULED'
        };
        return this._scheduleOperation(operation);
    }
    /**
     * Планирует операцию консолидации
     */
    async scheduleConsolidation(payload) {
        const operation = {
            id: crypto.randomUUID(),
            type: 'CONSOLIDATION',
            priority: this.operationTypes.CONSOLIDATION.priority,
            scheduledTime: new Date(Date.now() + this.config.minDelay),
            payload,
            retryCount: 0,
            maxRetries: this.config.maxRetryAttempts,
            createdAt: new Date(),
            status: 'SCHEDULED'
        };
        return this._scheduleOperation(operation);
    }
    /**
     * Планирует операцию ребалансировки
     */
    async scheduleRebalancing(payload) {
        const operation = {
            id: crypto.randomUUID(),
            type: 'REBALANCING',
            priority: this.operationTypes.REBALANCING.priority,
            scheduledTime: new Date(Date.now() + this.config.minDelay * 5), // Больше задержка
            payload,
            retryCount: 0,
            maxRetries: this.config.maxRetryAttempts,
            createdAt: new Date(),
            status: 'SCHEDULED'
        };
        return this._scheduleOperation(operation);
    }
    /**
     * Получает статус операции
     */
    getOperationStatus(operationId) {
        return this.state.scheduledOperations.get(operationId) || null;
    }
    /**
     * Отменяет запланированную операцию
     */
    async cancelOperation(operationId) {
        const operation = this.state.scheduledOperations.get(operationId);
        if (!operation) {
            return false;
        }
        // Отменяем таймер если есть
        MemoryManager_1.memoryManager.clearTimer(`operation:${operationId}`);
        // Удаляем из очереди
        this.state.operationQueue = this.state.operationQueue.filter(op => op.id !== operationId);
        // Прерываем выполнение если активна
        const activeContext = this.state.activeOperations.get(operationId);
        if (activeContext) {
            activeContext.abortController?.abort();
            this.state.activeOperations.delete(operationId);
        }
        // Обновляем статус
        operation.status = 'CANCELLED';
        this.state.scheduledOperations.set(operationId, operation);
        this.emit('operation:cancelled', { operationId });
        this.logger?.info('Операция отменена', { operationId });
        return true;
    }
    /**
     * Получает текущий статус планировщика
     */
    getStatus() {
        return {
            isRunning: this.state.isRunning,
            scheduledOperations: this.state.scheduledOperations.size,
            activeOperations: this.state.activeOperations.size,
            queueLength: this.state.operationQueue.length,
            statistics: { ...this.state.statistics },
            operationLoad: this._calculateOperationLoad()
        };
    }
    /**
     * Проверка здоровья планировщика
     */
    async healthCheck() {
        const issues = [];
        const checks = {
            scheduler: { status: 'pass', message: 'Планировщик работает' },
            operations: { status: 'pass', message: 'Операции выполняются нормально' },
            queue: { status: 'pass', message: 'Очередь обрабатывается' },
            performance: { status: 'pass', message: 'Производительность в норме' }
        };
        // Проверка работы планировщика
        if (!this.state.isRunning) {
            checks.scheduler = { status: 'fail', message: 'Планировщик не запущен' };
            issues.push('Планировщик не работает');
        }
        // Проверка нагрузки
        const operationLoad = this._calculateOperationLoad();
        if (operationLoad > 90) {
            checks.operations = { status: 'warn', message: `Высокая нагрузка: ${operationLoad}%` };
            issues.push(`Высокая нагрузка операций: ${operationLoad}%`);
        }
        // Проверка очереди
        if (this.state.operationQueue.length > 100) {
            checks.queue = { status: 'warn', message: `Переполнена очередь: ${this.state.operationQueue.length}` };
            issues.push(`Большая очередь: ${this.state.operationQueue.length} операций`);
        }
        // Проверка успешности
        const successRate = this._calculateSuccessRate();
        if (successRate < 90 && this.state.statistics.totalExecuted > 10) {
            checks.performance = { status: 'warn', message: `Низкий процент успеха: ${successRate}%` };
            issues.push(`Низкий процент успешных операций: ${successRate}%`);
        }
        // Проверка зависших операций
        const stuckOperations = this._findStuckOperations();
        if (stuckOperations.length > 0) {
            checks.operations = { status: 'warn', message: `Обнаружено ${stuckOperations.length} зависших операций` };
            issues.push(`Зависшие операции: ${stuckOperations.length}`);
        }
        const healthy = issues.length === 0;
        const status = healthy ? 'healthy' : (issues.some(i => i.includes('fail')) ? 'unhealthy' : 'degraded');
        return {
            healthy,
            status,
            checks,
            details: {
                isRunning: this.state.isRunning,
                scheduledOperations: this.state.scheduledOperations.size,
                activeOperations: this.state.activeOperations.size,
                queueLength: this.state.operationQueue.length,
                averageProcessingTime: this._calculateAverageProcessingTime(),
                successRate,
                operationLoad
            },
            issues
        };
    }
    // Приватные методы (заглушки для основной структуры)
    async _loadScheduledOperations() {
        // TODO: Загрузка операций из БД
        this.logger?.debug('Загрузка запланированных операций из БД');
    }
    _startScheduleLoop() {
        MemoryManager_1.memoryManager.createTimer(this.SCHEDULE_TIMER, () => this._processSchedule(), this.config.scheduleCheckInterval, 'interval', 'Main schedule processing loop');
    }
    _startExecutionLoop() {
        MemoryManager_1.memoryManager.createTimer(this.EXECUTION_TIMER, () => this._processExecutionQueue(), 5000, // Каждые 5 секунд
        'interval', 'Execution queue processing loop');
    }
    _startPeriodicTasks() {
        // Очистка истекших операций каждые 10 минут
        MemoryManager_1.memoryManager.createTimer(this.CLEANUP_TIMER, () => this._cleanupExpiredOperations(), 600000, 'interval', 'Cleanup expired operations');
        // Обновление метрик каждую минуту
        MemoryManager_1.memoryManager.createTimer(this.METRICS_TIMER, () => this._updateMetrics(), 60000, 'interval', 'Update scheduler metrics');
    }
    _clearAllTimers() {
        // Clear managed timers
        MemoryManager_1.memoryManager.clearTimer(this.SCHEDULE_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.EXECUTION_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.CLEANUP_TIMER);
        MemoryManager_1.memoryManager.clearTimer(this.METRICS_TIMER);
        // Clear all operation-specific timers
        this._clearAllOperationTimers();
    }
    async _waitForActiveOperations() {
        const timeout = 30000; // 30 секунд
        const start = Date.now();
        while (this.state.activeOperations.size > 0 && (Date.now() - start) < timeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (this.state.activeOperations.size > 0) {
            this.logger?.warn('Принудительная остановка с активными операциями', {
                activeOperations: this.state.activeOperations.size
            });
        }
    }
    async _saveScheduledOperations() {
        // TODO: Сохранение операций в БД
        this.logger?.debug('Сохранение запланированных операций в БД');
    }
    async _scheduleOperation(operation) {
        this.state.scheduledOperations.set(operation.id, operation);
        this.state.statistics.totalScheduled++;
        const delay = operation.scheduledTime.getTime() - Date.now();
        if (delay <= 0) {
            // Выполнить немедленно
            this.state.operationQueue.push(operation);
            operation.status = 'PENDING';
        }
        else {
            // Запланировать на будущее с использованием MemoryManager
            MemoryManager_1.memoryManager.createTimer(`operation:${operation.id}`, () => {
                this.state.operationQueue.push(operation);
                operation.status = 'PENDING';
                this.emit('operation:ready', { operationId: operation.id });
            }, delay, 'timeout', `Delayed execution for operation ${operation.type}`);
        }
        this.emit('operation:scheduled', { operationId: operation.id, scheduledTime: operation.scheduledTime });
        this.logger?.info('Операция запланирована', {
            operationId: operation.id,
            type: operation.type,
            scheduledTime: operation.scheduledTime
        });
        return operation.id;
    }
    _processSchedule() {
        // TODO: Обработка расписания
    }
    _processExecutionQueue() {
        // TODO: Обработка очереди выполнения
    }
    _cleanupExpiredOperations() {
        // TODO: Очистка истекших операций
    }
    _updateMetrics() {
        // TODO: Обновление метрик
    }
    _calculateOperationLoad() {
        const activeCount = this.state.activeOperations.size;
        const maxConcurrent = this.config.maxConcurrentOperations;
        return Math.round((activeCount / maxConcurrent) * 100);
    }
    _calculateSuccessRate() {
        const total = this.state.statistics.totalExecuted + this.state.statistics.totalFailed;
        if (total === 0)
            return 100;
        return Math.round((this.state.statistics.totalExecuted / total) * 100);
    }
    _calculateAverageProcessingTime() {
        // TODO: Реализация расчета среднего времени обработки
        return 0;
    }
    _findStuckOperations() {
        const now = Date.now();
        const stuckThreshold = 30 * 60 * 1000; // 30 минут
        const stuck = [];
        for (const [operationId, context] of this.state.activeOperations) {
            const elapsed = now - context.startTime.getTime();
            if (elapsed > stuckThreshold) {
                stuck.push(context.operation);
            }
        }
        return stuck;
    }
    _setupMemoryListeners() {
        MemoryManager_1.memoryManager.on('memory-warning', (data) => {
            this.logger?.warn('Memory warning detected in scheduler', data);
            this._triggerEmergencyCleanup();
        });
        MemoryManager_1.memoryManager.on('emergency-cleanup', (data) => {
            this.logger?.error('Emergency cleanup triggered in scheduler', data);
            this.emit('scheduler:emergency-cleanup', data);
        });
    }
    _triggerEmergencyCleanup() {
        this.logger?.warn('🚨 Scheduler emergency cleanup triggered');
        // Clear completed operations older than 1 hour
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        const toRemove = [];
        for (const [operationId] of this.state.scheduledOperations) {
            const operation = this.state.scheduledOperations.get(operationId);
            if (operation && (operation.status === 'COMPLETED' || operation.status === 'FAILED')) {
                if (operation.createdAt.getTime() < oneHourAgo) {
                    toRemove.push(operationId);
                }
            }
        }
        for (const operationId of toRemove) {
            this.state.scheduledOperations.delete(operationId);
        }
        // Clear operation queue if too large
        if (this.state.operationQueue.length > 100) {
            this.state.operationQueue = this.state.operationQueue.slice(0, 50);
        }
        this.logger?.info('Emergency cleanup completed', {
            removedOperations: toRemove.length,
            remainingQueue: this.state.operationQueue.length
        });
    }
    _clearAllOperationTimers() {
        // Clear all operation timers by pattern
        const activeTimers = MemoryManager_1.memoryManager.getActiveTimers();
        for (const timerName of activeTimers) {
            if (timerName.startsWith('operation:')) {
                MemoryManager_1.memoryManager.clearTimer(timerName);
            }
        }
    }
    /**
     * Graceful shutdown with proper cleanup
     */
    async shutdown() {
        this.logger?.info('🧹 MixingScheduler shutdown initiated...');
        try {
            // Stop the scheduler
            await this.stop();
            // Clear all managed resources
            this._clearAllTimers();
            // Clear collections
            this.state.scheduledOperations.clear();
            this.state.activeOperations.clear();
            this.state.operationQueue = [];
            // Remove event listeners
            this.removeAllListeners();
            this.logger?.info('✅ MixingScheduler shutdown completed');
        }
        catch (error) {
            this.logger?.error('Error during scheduler shutdown:', error);
            throw error;
        }
    }
}
exports.MixingScheduler = MixingScheduler;
exports.default = MixingScheduler;
//# sourceMappingURL=MixingScheduler.js.map