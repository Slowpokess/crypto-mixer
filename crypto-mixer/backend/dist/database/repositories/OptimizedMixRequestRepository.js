"use strict";
/**
 * Оптимизированный MixRequestRepository с устранением N+1 проблем
 *
 * Основные оптимизации:
 * - Агрегированные запросы вместо загрузки всех записей в память
 * - Эффективные JOIN'ы вместо отдельных запросов
 * - Кэширование часто используемых данных
 * - Пагинация с оптимизацией
 * - Performance monitoring всех запросов
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizedMixRequestRepository = void 0;
const sequelize_1 = require("sequelize");
const BaseRepository_1 = require("./BaseRepository");
const OutputTransaction_1 = require("../models/OutputTransaction");
const DepositAddress_1 = require("../models/DepositAddress");
const AuditLog_1 = require("../models/AuditLog");
const logger_1 = require("../logger");
/**
 * Оптимизированный репозиторий для работы с запросами микширования
 */
class OptimizedMixRequestRepository extends BaseRepository_1.BaseRepository {
    constructor(model, queryBuilder) {
        super(model);
        this.queryBuilder = queryBuilder;
    }
    /**
     * Создание нового запроса микширования с полной инициализацией
     * Оптимизация: Использование транзакций для консистентности
     */
    async createMixRequest(data, transaction) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('createMixRequest');
        try {
            this.validateData(data);
            const mixRequest = await this.create(data, transaction);
            // Асинхронное логирование для улучшения производительности
            setImmediate(async () => {
                try {
                    await AuditLog_1.AuditLog.logAction({
                        level: 'INFO',
                        action: 'MIX_REQUEST_CREATED',
                        message: `Mix request created for ${data.inputAmount} ${data.currency}`,
                        mixRequestId: mixRequest.id,
                        details: {
                            currency: data.currency,
                            amount: data.inputAmount,
                            outputAddresses: data.outputAddresses
                        }
                    });
                }
                catch (auditError) {
                    logger_1.enhancedDbLogger.warn('Ошибка audit логирования при создании MixRequest', { auditError });
                }
            });
            // Инвалидируем кэш статистики
            this.queryBuilder.invalidateCache('mix_stats');
            this.queryBuilder.invalidateCache('mix_currency_stats');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('createMixRequest', { id: mixRequest.id, currency: data.currency });
            return mixRequest;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('createMixRequest', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск запросов по статусу с eager loading
     * Устранение N+1: Один запрос вместо множественных
     */
    async findByStatus(status) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('findByStatus');
        try {
            // Используем один оптимизированный JOIN запрос
            const result = await this.findAll({ status }, {
                include: [
                    {
                        model: DepositAddress_1.DepositAddress,
                        as: 'depositAddress',
                        required: false // LEFT JOIN вместо INNER JOIN
                    },
                    {
                        model: OutputTransaction_1.OutputTransaction,
                        as: 'outputTransactions',
                        required: false,
                        separate: false // Важно: избегаем отдельных запросов
                    }
                ],
                order: [['createdAt', 'DESC']]
            });
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('findByStatus', { status, count: result.length });
            return result;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('findByStatus', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск активных запросов по валюте
     * Использует индексированный запрос с кэшированием
     */
    async findActiveByCurrency(currency) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('findActiveByCurrency');
        try {
            const activeStatuses = ['PENDING', 'DEPOSITED', 'POOLING', 'MIXING'];
            const result = await this.findAll({
                currency,
                status: { [sequelize_1.Op.in]: activeStatuses }
            }, {
                include: [
                    {
                        model: DepositAddress_1.DepositAddress,
                        as: 'depositAddress',
                        required: false
                    },
                    {
                        model: OutputTransaction_1.OutputTransaction,
                        as: 'outputTransactions',
                        required: false,
                        separate: false
                    }
                ],
                order: [['createdAt', 'ASC']]
            });
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('findActiveByCurrency', { currency, count: result.length });
            return result;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('findActiveByCurrency', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * КАРДИНАЛЬНО ОПТИМИЗИРОВАННЫЙ: Статистика с агрегацией на БД
     * Устранение N+1: Вместо загрузки всех записей - агрегация на уровне БД
     */
    async getStatistics(startDate, endDate, currency) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('getStatistics');
        try {
            // Используем оптимизированный query builder
            const result = await this.queryBuilder.getMixRequestStatistics({
                startDate,
                endDate,
                currency
            });
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('getStatistics', {
                total: result.total,
                successRate: result.successRate,
                dateRange: { startDate, endDate },
                currency
            });
            return result;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('getStatistics', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск с фильтрацией и пагинацией
     * Устранение N+1: Единый JOIN запрос с пагинацией
     */
    async findWithFilters(filters) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('findWithFilters');
        try {
            // Используем оптимизированный query builder
            const result = await this.queryBuilder.findMixRequestsWithRelations(filters);
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('findWithFilters', {
                filters,
                resultCount: result.rows.length,
                totalCount: result.count
            });
            return result;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('findWithFilters', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * ОПТИМИЗИРОВАННЫЙ: Получение полной информации о запросе
     * Один запрос с глубокими JOIN'ами вместо множественных
     */
    async getFullDetails(id) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('getFullDetails');
        try {
            const result = await this.findById(id, {
                include: [
                    {
                        model: DepositAddress_1.DepositAddress,
                        as: 'depositAddress',
                        include: [
                            {
                                model: require('../models').MonitoredAddress,
                                as: 'monitoredAddress',
                                required: false
                            }
                        ],
                        required: false
                    },
                    {
                        model: OutputTransaction_1.OutputTransaction,
                        as: 'outputTransactions',
                        required: false,
                        separate: false,
                        order: [['outputIndex', 'ASC']]
                    },
                    {
                        model: AuditLog_1.AuditLog,
                        as: 'auditLogs',
                        required: false,
                        separate: true, // Отдельный запрос для логов из-за LIMIT
                        order: [['createdAt', 'DESC']],
                        limit: 20
                    }
                ]
            });
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('getFullDetails', { id, found: !!result });
            return result;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('getFullDetails', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * ОПТИМИЗИРОВАННЫЙ: Batch обновление статуса
     * Обновление множества записей одним запросом
     */
    async batchUpdateStatus(ids, status, additionalData = {}, transaction) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('batchUpdateStatus');
        try {
            if (ids.length === 0) {
                return 0;
            }
            const updateData = { status, ...additionalData };
            // Batch обновление одним запросом
            const [updatedCount] = await this.model.update(updateData, {
                where: { id: { [sequelize_1.Op.in]: ids } },
                transaction
            });
            // Асинхронное логирование для производительности
            setImmediate(async () => {
                try {
                    const auditPromises = ids.map(id => AuditLog_1.AuditLog.logAction({
                        level: 'INFO',
                        action: 'MIX_REQUEST_STATUS_BATCH_UPDATED',
                        message: `Batch status update to ${status}`,
                        mixRequestId: id,
                        newValues: { status },
                        details: { batchSize: ids.length, ...additionalData }
                    }));
                    await Promise.all(auditPromises);
                }
                catch (auditError) {
                    logger_1.enhancedDbLogger.warn('Ошибка batch audit логирования', { auditError });
                }
            });
            // Инвалидируем кэш
            this.queryBuilder.invalidateCache('mix_stats');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('batchUpdateStatus', {
                idsCount: ids.length,
                updatedCount,
                newStatus: status
            });
            return updatedCount;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('batchUpdateStatus', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * ОПТИМИЗИРОВАННЫЙ: Поиск готовых к обработке с оптимизированными JOIN'ами
     */
    async findReadyForProcessing(limit = 100) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('findReadyForProcessing');
        try {
            const result = await this.findAll({
                status: 'DEPOSITED',
                [sequelize_1.Op.and]: [
                    { inputAmount: { [sequelize_1.Op.gt]: 0 } },
                    { currency: { [sequelize_1.Op.in]: ['BTC', 'ETH', 'USDT', 'SOL'] } }
                ]
            }, {
                include: [
                    {
                        model: DepositAddress_1.DepositAddress,
                        as: 'depositAddress',
                        where: { used: true },
                        required: true // INNER JOIN, так как это обязательное условие
                    }
                ],
                order: [['depositConfirmedAt', 'ASC']],
                limit // Ограничиваем количество для обработки
            });
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('findReadyForProcessing', { count: result.length, limit });
            return result;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('findReadyForProcessing', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * ОПТИМИЗИРОВАННЫЙ: Очистка старых записей с batch операциями
     */
    async cleanupOldRequests(daysToKeep = 30, batchSize = 1000) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('cleanupOldRequests');
        try {
            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
            let totalDeleted = 0;
            // Удаляем порциями для избежания блокировок
            while (true) {
                const deletedCount = await this.model.destroy({
                    where: {
                        status: { [sequelize_1.Op.in]: ['COMPLETED', 'CANCELLED'] },
                        createdAt: { [sequelize_1.Op.lt]: cutoffDate }
                    },
                    limit: batchSize
                });
                totalDeleted += deletedCount;
                if (deletedCount === 0) {
                    break; // Больше нечего удалять
                }
                // Небольшая пауза между batch операциями
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            // Инвалидируем кэш после очистки
            this.queryBuilder.invalidateCache('mix_stats');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('cleanupOldRequests', {
                totalDeleted,
                cutoffDate,
                daysToKeep,
                batchSize
            });
            return totalDeleted;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('cleanupOldRequests', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * НОВЫЙ: Получение метрик производительности запросов
     */
    async getQueryPerformanceMetrics() {
        const operationId = await logger_1.enhancedDbLogger.startOperation('getQueryPerformanceMetrics');
        try {
            const stats = await this.queryBuilder.getDatabasePerformanceStats();
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            return {
                slowQueries: stats.slowQueries,
                avgQueryTime: stats.avgQueryTime,
                cacheHitRate: stats.cacheHitRate,
                totalQueries: stats.totalQueries
            };
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('getQueryPerformanceMetrics', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * НОВЫЙ: Bulk операции для массовых обновлений
     */
    async bulkCreateMixRequests(data, transaction) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('bulkCreateMixRequests');
        try {
            if (data.length === 0) {
                return [];
            }
            // Валидируем все данные перед bulk операцией
            data.forEach(item => this.validateData(item));
            // Bulk создание одним запросом
            const mixRequests = await this.model.bulkCreate(data, {
                transaction,
                returning: true,
                validate: true
            });
            // Асинхронное логирование
            setImmediate(async () => {
                try {
                    const auditPromises = mixRequests.map(request => AuditLog_1.AuditLog.logAction({
                        level: 'INFO',
                        action: 'MIX_REQUEST_BULK_CREATED',
                        message: `Bulk created mix request for ${request.inputAmount} ${request.currency}`,
                        mixRequestId: request.id,
                        details: {
                            batchSize: data.length,
                            currency: request.currency,
                            amount: request.inputAmount
                        }
                    }));
                    await Promise.all(auditPromises);
                }
                catch (auditError) {
                    logger_1.enhancedDbLogger.warn('Ошибка bulk audit логирования', { auditError });
                }
            });
            // Инвалидируем кэш
            this.queryBuilder.invalidateCache('mix_stats');
            this.queryBuilder.invalidateCache('mix_currency_stats');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('bulkCreateMixRequests', {
                inputCount: data.length,
                createdCount: mixRequests.length
            });
            return mixRequests;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('bulkCreateMixRequests', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * НОВЫЙ: Оптимизированный поиск по валюте с агрегацией
     */
    async getCurrencyAggregates(currency) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('getCurrencyAggregates');
        try {
            // Агрегация на уровне БД вместо загрузки записей в память
            const [result] = await this.model.sequelize.query(`
        SELECT 
          COUNT(*) as total_requests,
          SUM(input_amount) as total_amount,
          AVG(input_amount) as average_amount,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN status IN ('PENDING', 'DEPOSITED', 'POOLING', 'MIXING') THEN 1 ELSE 0 END) as pending_count
        FROM mix_requests 
        WHERE currency = :currency
      `, {
                replacements: { currency },
                type: 'SELECT'
            });
            const stats = result[0] || {};
            const totalRequests = Number(stats.total_requests || 0);
            const completedCount = Number(stats.completed_count || 0);
            const successRate = totalRequests > 0 ? (completedCount / totalRequests) * 100 : 0;
            const aggregates = {
                totalRequests,
                totalAmount: Number(stats.total_amount || 0),
                averageAmount: Number(stats.average_amount || 0),
                completedCount,
                pendingCount: Number(stats.pending_count || 0),
                successRate
            };
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            this.log('getCurrencyAggregates', { currency, ...aggregates });
            return aggregates;
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            this.handleError('getCurrencyAggregates', error);
            // handleError уже выбросит ошибку, этот код недостижим был бы
        }
    }
    /**
     * Инвалидация кэша при изменении данных
     */
    invalidateRelevantCache() {
        this.queryBuilder.invalidateCache('mix_stats');
        this.queryBuilder.invalidateCache('mix_currency_stats');
        this.queryBuilder.invalidateCache('mix_count');
    }
    /**
     * Переопределение updateById с инвалидацией кэша
     */
    async updateById(id, data, transaction) {
        const result = await super.updateById(id, data, transaction);
        if (result) {
            this.invalidateRelevantCache();
        }
        return result;
    }
    /**
     * Переопределение deleteById с инвалидацией кэша
     */
    async deleteById(id, transaction) {
        const result = await super.deleteById(id, transaction);
        if (result) {
            this.invalidateRelevantCache();
        }
        return result;
    }
}
exports.OptimizedMixRequestRepository = OptimizedMixRequestRepository;
exports.default = OptimizedMixRequestRepository;
//# sourceMappingURL=OptimizedMixRequestRepository.js.map