"use strict";
/**
 * Redis-powered Оптимизированный Query Builder
 *
 * Расширяет OptimizedQueryBuilder с интеграцией Redis кэширования:
 * - Замена in-memory кэша на Redis
 * - Intelligent cache invalidation
 * - Query result caching с smart TTL
 * - Database query optimization with Redis backing
 * - Performance monitoring с Redis analytics
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisOptimizedQueryBuilder = void 0;
const sequelize_1 = require("sequelize");
const logger_1 = require("../logger");
const ErrorTypes_1 = require("../../utils/errors/ErrorTypes");
/**
 * Redis-интегрированный Query Builder
 */
class RedisOptimizedQueryBuilder {
    constructor(sequelize, redisCache, performanceMonitor) {
        this.queryStats = new Map();
        // Cache invalidation mapping
        this.invalidationTagsMap = new Map();
        this.sequelize = sequelize;
        this.redisCache = redisCache;
        this.performanceMonitor = performanceMonitor;
        logger_1.enhancedDbLogger.info('🚀 RedisOptimizedQueryBuilder инициализирован с Redis backing');
    }
    /**
     * REDIS-ОПТИМИЗИРОВАННАЯ статистика для MixRequest
     */
    async getMixRequestStatistics(filters = {}) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('getMixRequestStatistics');
        const span = this.performanceMonitor?.startSpan('redis_db_mix_request_stats', 'database');
        try {
            // Генерируем умный cache key
            const cacheKey = this.generateSmartCacheKey('mix_request_stats', filters);
            const invalidationTags = ['mix_requests', 'statistics'];
            // Пытаемся получить из Redis кэша
            const cachedResult = await this.redisCache.get(cacheKey);
            if (cachedResult) {
                if (span)
                    this.performanceMonitor?.finishSpan(span, 'success');
                await logger_1.enhancedDbLogger.endOperation(operationId, true);
                logger_1.enhancedDbLogger.debug('✅ Redis cache hit для MixRequest статистики', { cacheKey });
                return cachedResult;
            }
            // Выполняем оптимизированный запрос к БД
            const whereClause = this.buildDateFilter(filters.startDate, filters.endDate);
            const currencyFilter = filters.currency ? `AND currency = :currency` : '';
            // Агрегированный запрос вместо загрузки всех записей
            const [statsResult] = await this.executeQuery(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'DEPOSITED' THEN 1 ELSE 0 END) as deposited,
          SUM(CASE WHEN status = 'POOLING' THEN 1 ELSE 0 END) as pooling,
          SUM(CASE WHEN status = 'MIXING' THEN 1 ELSE 0 END) as mixing,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled
        FROM mix_requests 
        WHERE 1=1 ${whereClause} ${currencyFilter}
      `, {
                startDate: filters.startDate,
                endDate: filters.endDate,
                currency: filters.currency
            }, {
                cache: false, // Мы используем Redis, не встроенный кэш
                explain: process.env.NODE_ENV === 'development'
            });
            // Статистика по валютам
            const currencyStats = await this.executeQuery(`
        SELECT 
          currency,
          COUNT(*) as count,
          SUM(input_amount) as total_amount,
          AVG(input_amount) as avg_amount
        FROM mix_requests 
        WHERE 1=1 ${whereClause} ${currencyFilter}
        GROUP BY currency
      `, {
                startDate: filters.startDate,
                endDate: filters.endDate,
                currency: filters.currency
            }, {
                cache: false
            });
            // Формируем результат
            const total = Number(statsResult[0]?.total || 0);
            const completed = Number(statsResult[0]?.completed || 0);
            const byStatus = {
                COMPLETED: Number(statsResult[0]?.completed || 0),
                PENDING: Number(statsResult[0]?.pending || 0),
                DEPOSITED: Number(statsResult[0]?.deposited || 0),
                POOLING: Number(statsResult[0]?.pooling || 0),
                MIXING: Number(statsResult[0]?.mixing || 0),
                FAILED: Number(statsResult[0]?.failed || 0),
                CANCELLED: Number(statsResult[0]?.cancelled || 0)
            };
            const byCurrency = {};
            const totalAmount = {};
            const averageAmount = {};
            currencyStats.forEach(stat => {
                const currency = stat.currency;
                byCurrency[currency] = Number(stat.count);
                totalAmount[currency] = Number(stat.total_amount || 0);
                averageAmount[currency] = Number(stat.avg_amount || 0);
            });
            const successRate = total > 0 ? (completed / total) * 100 : 0;
            const result = {
                total,
                byStatus,
                byCurrency,
                totalAmount,
                averageAmount,
                successRate
            };
            // Кэшируем результат в Redis с умным TTL
            const ttl = this.calculateSmartTTL(total, 'statistics');
            await this.redisCache.set(cacheKey, result, ttl);
            // Регистрируем invalidation tags
            this.registerInvalidationTags(cacheKey, invalidationTags);
            if (span)
                this.performanceMonitor?.finishSpan(span, 'success');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.debug('💾 MixRequest статистика кэширована в Redis', {
                cacheKey,
                ttl,
                total
            });
            return result;
        }
        catch (error) {
            if (span)
                this.performanceMonitor?.finishSpan(span, 'error');
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw new ErrorTypes_1.DatabaseError('Ошибка получения статистики MixRequest', ErrorTypes_1.ErrorCode.QUERY_FAILED, { operation: 'getMixRequestStatistics', filters });
        }
    }
    /**
     * REDIS-ОПТИМИЗИРОВАННАЯ статистика для Wallet
     */
    async getWalletStatistics() {
        const operationId = await logger_1.enhancedDbLogger.startOperation('getWalletStatistics');
        const span = this.performanceMonitor?.startSpan('redis_db_wallet_stats', 'database');
        try {
            const cacheKey = 'wallet_statistics';
            const invalidationTags = ['wallets', 'statistics'];
            // Проверяем Redis кэш
            const cachedResult = await this.redisCache.get(cacheKey);
            if (cachedResult) {
                if (span)
                    this.performanceMonitor?.finishSpan(span, 'success');
                await logger_1.enhancedDbLogger.endOperation(operationId, true);
                logger_1.enhancedDbLogger.debug('✅ Redis cache hit для Wallet статистики');
                return cachedResult;
            }
            // Основная статистика
            const [mainStats] = await this.executeQuery(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_wallets,
          SUM(CASE WHEN is_locked = true THEN 1 ELSE 0 END) as locked_wallets
        FROM wallets
      `, {}, {
                cache: false
            });
            // Статистика по типам
            const typeStats = await this.executeQuery(`
        SELECT 
          type,
          COUNT(*) as count
        FROM wallets 
        GROUP BY type
      `, {}, {
                cache: false
            });
            // Статистика по валютам и балансам
            const currencyStats = await this.executeQuery(`
        SELECT 
          currency,
          COUNT(*) as count,
          SUM(balance) as total_balance
        FROM wallets 
        GROUP BY currency
      `, {}, {
                cache: false
            });
            // Формируем результат
            const byType = {};
            typeStats.forEach(stat => {
                byType[stat.type] = Number(stat.count);
            });
            const byCurrency = {};
            const totalBalance = {};
            currencyStats.forEach(stat => {
                const currency = stat.currency;
                byCurrency[currency] = Number(stat.count);
                totalBalance[currency] = Number(stat.total_balance || 0);
            });
            const result = {
                total: Number(mainStats[0]?.total || 0),
                byType,
                byCurrency,
                totalBalance,
                activeWallets: Number(mainStats[0]?.active_wallets || 0),
                lockedWallets: Number(mainStats[0]?.locked_wallets || 0)
            };
            // Кэшируем в Redis
            const ttl = this.calculateSmartTTL(result.total, 'wallet_stats');
            await this.redisCache.set(cacheKey, result, ttl);
            this.registerInvalidationTags(cacheKey, invalidationTags);
            if (span)
                this.performanceMonitor?.finishSpan(span, 'success');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.debug('💾 Wallet статистика кэширована в Redis', {
                cacheKey,
                ttl
            });
            return result;
        }
        catch (error) {
            if (span)
                this.performanceMonitor?.finishSpan(span, 'error');
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw new ErrorTypes_1.DatabaseError('Ошибка получения статистики Wallet', ErrorTypes_1.ErrorCode.QUERY_FAILED, { operation: 'getWalletStatistics' });
        }
    }
    /**
     * REDIS-ОПТИМИЗИРОВАННЫЙ поиск MixRequest с отношениями
     */
    async findMixRequestsWithRelations(filters) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('findMixRequestsWithRelations');
        const span = this.performanceMonitor?.startSpan('redis_db_mix_request_find', 'database');
        try {
            const page = filters.page || 1;
            const limit = Math.min(filters.limit || 20, 100);
            const offset = (page - 1) * limit;
            // Умный cache key учитывающий все фильтры
            const cacheKey = this.generateSmartCacheKey('mix_requests_with_relations', {
                ...filters,
                page,
                limit
            });
            const invalidationTags = ['mix_requests', 'deposit_addresses', 'output_transactions'];
            // Проверяем Redis кэш
            const cachedResult = await this.redisCache.get(cacheKey);
            if (cachedResult) {
                if (span)
                    this.performanceMonitor?.finishSpan(span, 'success');
                await logger_1.enhancedDbLogger.endOperation(operationId, true);
                logger_1.enhancedDbLogger.debug('✅ Redis cache hit для MixRequest поиска', { cacheKey });
                return cachedResult;
            }
            // Строим WHERE условия
            const whereConditions = ['1=1'];
            const replacements = { limit, offset };
            if (filters.currency) {
                whereConditions.push('mr.currency = :currency');
                replacements.currency = filters.currency;
            }
            if (filters.status) {
                if (Array.isArray(filters.status)) {
                    whereConditions.push('mr.status IN (:statuses)');
                    replacements.statuses = filters.status;
                }
                else {
                    whereConditions.push('mr.status = :status');
                    replacements.status = filters.status;
                }
            }
            if (filters.minAmount) {
                whereConditions.push('mr.input_amount >= :minAmount');
                replacements.minAmount = filters.minAmount;
            }
            if (filters.maxAmount) {
                whereConditions.push('mr.input_amount <= :maxAmount');
                replacements.maxAmount = filters.maxAmount;
            }
            const dateFilter = this.buildDateFilter(filters.startDate, filters.endDate, 'mr.');
            if (dateFilter) {
                whereConditions.push(dateFilter.replace('WHERE', ''));
                if (filters.startDate)
                    replacements.startDate = filters.startDate;
                if (filters.endDate)
                    replacements.endDate = filters.endDate;
            }
            const whereClause = whereConditions.join(' AND ');
            // Оптимизированный JOIN запрос
            const query = `
        SELECT 
          mr.*,
          da.id as deposit_address_id,
          da.address as deposit_address,
          da.used as deposit_address_used,
          COUNT(ot.id) as output_transactions_count,
          JSON_ARRAYAGG(
            CASE WHEN ot.id IS NOT NULL 
            THEN JSON_OBJECT(
              'id', ot.id,
              'address', ot.address,
              'amount', ot.amount,
              'txid', ot.txid,
              'output_index', ot.output_index,
              'status', ot.status
            ) END
          ) as output_transactions
        FROM mix_requests mr
        LEFT JOIN deposit_addresses da ON mr.id = da.mix_request_id
        LEFT JOIN output_transactions ot ON mr.id = ot.mix_request_id
        WHERE ${whereClause}
        GROUP BY mr.id, da.id
        ORDER BY mr.created_at DESC
        LIMIT :limit OFFSET :offset
      `;
            // Запрос для подсчета общего количества (кэшируем отдельно)
            const countCacheKey = this.generateSmartCacheKey('mix_requests_count', filters);
            let total = await this.redisCache.get(countCacheKey);
            if (total === null) {
                const countQuery = `
          SELECT COUNT(DISTINCT mr.id) as total
          FROM mix_requests mr
          LEFT JOIN deposit_addresses da ON mr.id = da.mix_request_id  
          WHERE ${whereClause}
        `;
                const [countResult] = await this.executeQuery(countQuery, replacements, {
                    cache: false
                });
                total = Number(countResult?.total || 0);
                // Кэшируем count с коротким TTL
                await this.redisCache.set(countCacheKey, total, 300); // 5 минут
                this.registerInvalidationTags(countCacheKey, invalidationTags);
            }
            // Выполняем основной запрос
            const rows = await this.executeQuery(query, replacements, {
                cache: false,
                explain: process.env.NODE_ENV === 'development'
            });
            const totalPages = Math.ceil(total / limit);
            const result = {
                rows: rows.map(this.processMixRequestRow),
                count: total,
                totalPages,
                currentPage: page,
                hasNext: page < totalPages,
                hasPrev: page > 1,
                limit,
                offset
            };
            // Кэшируем результат с умным TTL
            const ttl = this.calculateSmartTTL(rows.length, 'search_results');
            await this.redisCache.set(cacheKey, result, ttl);
            this.registerInvalidationTags(cacheKey, invalidationTags);
            if (span)
                this.performanceMonitor?.finishSpan(span, 'success');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.debug('💾 MixRequest поиск кэширован в Redis', {
                cacheKey,
                ttl,
                rowsCount: rows.length
            });
            return result;
        }
        catch (error) {
            if (span)
                this.performanceMonitor?.finishSpan(span, 'error');
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw new ErrorTypes_1.DatabaseError('Ошибка поиска MixRequest с relations', ErrorTypes_1.ErrorCode.QUERY_FAILED, { operation: 'findMixRequestsWithRelations', filters });
        }
    }
    /**
     * REDIS-ОПТИМИЗИРОВАННЫЙ поиск кошельков с достаточным балансом
     */
    async findWalletsWithSufficientBalance(currency, minAmount, limit = 10) {
        const operationId = await logger_1.enhancedDbLogger.startOperation('findWalletsWithSufficientBalance');
        const span = this.performanceMonitor?.startSpan('redis_db_wallet_find_balance', 'database');
        try {
            const cacheKey = `wallets_balance_${currency}_${minAmount}_${limit}`;
            const invalidationTags = ['wallets', 'balances'];
            // Проверяем Redis кэш (короткий TTL для балансов)
            const cachedResult = await this.redisCache.get(cacheKey);
            if (cachedResult) {
                if (span)
                    this.performanceMonitor?.finishSpan(span, 'success');
                await logger_1.enhancedDbLogger.endOperation(operationId, true);
                logger_1.enhancedDbLogger.debug('✅ Redis cache hit для Wallet balance поиска', { cacheKey });
                return cachedResult;
            }
            const query = `
        SELECT 
          w.*,
          (w.balance - :minAmount) as available_amount
        FROM wallets w
        WHERE w.currency = :currency
          AND w.balance >= :minAmount
          AND w.is_active = true
          AND w.is_locked = false
          AND w.status = 'ACTIVE'
          AND w.type IN ('HOT', 'POOL')
        ORDER BY 
          w.balance DESC,
          w.last_used_at ASC
        LIMIT :limit
      `;
            const rows = await this.executeQuery(query, {
                currency,
                minAmount,
                limit
            }, {
                cache: false
            });
            // Кэшируем с коротким TTL (балансы часто меняются)
            const ttl = 60; // 1 минута для балансов
            await this.redisCache.set(cacheKey, rows, ttl);
            this.registerInvalidationTags(cacheKey, invalidationTags);
            if (span)
                this.performanceMonitor?.finishSpan(span, 'success');
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            logger_1.enhancedDbLogger.debug('💾 Wallet balance поиск кэширован в Redis', {
                cacheKey,
                ttl,
                rowsCount: rows.length
            });
            return rows;
        }
        catch (error) {
            if (span)
                this.performanceMonitor?.finishSpan(span, 'error');
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw new ErrorTypes_1.DatabaseError('Ошибка поиска кошельков с достаточным балансом', ErrorTypes_1.ErrorCode.QUERY_FAILED, { operation: 'findWalletsWithSufficientBalance', currency, minAmount });
        }
    }
    /**
     * Выполнение оптимизированного запроса с Redis кэшированием
     */
    async executeQuery(query, replacements = {}, options = {}) {
        const startTime = Date.now();
        const queryKey = options.cacheKey || this.generateQueryKey(query, replacements);
        try {
            // EXPLAIN запрос для анализа в development
            if (options.explain && process.env.NODE_ENV === 'development') {
                try {
                    const explainResult = await this.sequelize.query(`EXPLAIN ${query}`, {
                        replacements,
                        type: sequelize_1.QueryTypes.SELECT
                    });
                    logger_1.enhancedDbLogger.debug('📊 EXPLAIN результат', {
                        query: query.substring(0, 100),
                        explain: explainResult
                    });
                }
                catch (explainError) {
                    // Игнорируем ошибки EXPLAIN
                }
            }
            // Выполняем основной запрос
            const result = await this.sequelize.query(query, {
                replacements,
                type: sequelize_1.QueryTypes.SELECT,
                transaction: options.transaction,
                timeout: options.timeout,
                raw: options.raw !== false
            });
            const queryTime = Date.now() - startTime;
            // Сохраняем статистику
            this.queryStats.set(queryKey, {
                queryTime,
                rowsReturned: Array.isArray(result) ? result.length : 1,
                rowsExamined: 0,
                indexesUsed: [],
                cacheHit: false,
                cacheSource: 'none',
                optimizationTips: []
            });
            // Предупреждение о медленных запросах
            if (queryTime > 1000) {
                logger_1.enhancedDbLogger.warn('🐌 Медленный запрос обнаружен', {
                    query: query.substring(0, 200),
                    queryTime,
                    rowsReturned: Array.isArray(result) ? result.length : 1
                });
            }
            return result;
        }
        catch (error) {
            const queryTime = Date.now() - startTime;
            logger_1.enhancedDbLogger.error('❌ Ошибка выполнения запроса', {
                query: query.substring(0, 200),
                error: error.message,
                queryTime,
                replacements
            });
            throw error;
        }
    }
    /**
     * Умная генерация cache key
     */
    generateSmartCacheKey(operation, params) {
        const paramsString = JSON.stringify(params, Object.keys(params).sort());
        const hash = require('crypto')
            .createHash('sha256')
            .update(`${operation}_${paramsString}`)
            .digest('hex')
            .substring(0, 16);
        return `query:${operation}:${hash}`;
    }
    /**
     * Расчет умного TTL на основе типа данных
     */
    calculateSmartTTL(dataSize, type) {
        switch (type) {
            case 'statistics':
                return dataSize > 1000 ? 1800 : 900; // 30 мин или 15 мин
            case 'wallet_stats':
                return 300; // 5 минут (часто меняются)
            case 'search_results':
                return dataSize > 50 ? 600 : 300; // 10 мин или 5 мин
            case 'balances':
                return 60; // 1 минута (критически важные данные)
            default:
                return 600; // 10 минут по умолчанию
        }
    }
    /**
     * Регистрация invalidation tags для умной инвалидации
     */
    registerInvalidationTags(cacheKey, tags) {
        for (const tag of tags) {
            if (!this.invalidationTagsMap.has(tag)) {
                this.invalidationTagsMap.set(tag, []);
            }
            this.invalidationTagsMap.get(tag).push(cacheKey);
        }
    }
    /**
     * Умная инвалидация кэша по тегам
     */
    async invalidateByTags(tags) {
        let totalInvalidated = 0;
        for (const tag of tags) {
            const keysToInvalidate = this.invalidationTagsMap.get(tag) || [];
            for (const key of keysToInvalidate) {
                try {
                    const deleted = await this.redisCache.delete(key);
                    if (deleted)
                        totalInvalidated++;
                }
                catch (error) {
                    logger_1.enhancedDbLogger.warn('⚠️ Ошибка инвалидации ключа', { key, error });
                }
            }
            // Очищаем mapping
            this.invalidationTagsMap.set(tag, []);
        }
        logger_1.enhancedDbLogger.info('🗑️ Инвалидация по тегам завершена', {
            tags,
            totalInvalidated
        });
        return totalInvalidated;
    }
    /**
     * Построение фильтра по датам
     */
    buildDateFilter(startDate, endDate, prefix = '') {
        if (!startDate && !endDate)
            return '';
        const conditions = [];
        if (startDate && endDate) {
            conditions.push(`${prefix}created_at BETWEEN :startDate AND :endDate`);
        }
        else if (startDate) {
            conditions.push(`${prefix}created_at >= :startDate`);
        }
        else if (endDate) {
            conditions.push(`${prefix}created_at <= :endDate`);
        }
        return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    }
    /**
     * Генерация ключа для кэша
     */
    generateQueryKey(query, replacements) {
        const queryHash = Buffer.from(query).toString('base64').substring(0, 32);
        const paramsHash = Buffer.from(JSON.stringify(replacements)).toString('base64').substring(0, 16);
        return `query_${queryHash}_${paramsHash}`;
    }
    /**
     * Обработка строки результата MixRequest
     */
    processMixRequestRow(row) {
        try {
            // Парсим JSON для output_transactions
            if (row.output_transactions) {
                row.output_transactions = JSON.parse(row.output_transactions).filter((tx) => tx !== null);
            }
            else {
                row.output_transactions = [];
            }
            // Структурируем deposit_address
            if (row.deposit_address_id) {
                row.deposit_address = {
                    id: row.deposit_address_id,
                    address: row.deposit_address,
                    used: row.deposit_address_used
                };
            }
            // Удаляем технические поля
            delete row.deposit_address_id;
            delete row.deposit_address_used;
            delete row.output_transactions_count;
            return row;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка обработки строки MixRequest', { error, row });
            return row;
        }
    }
    /**
     * Инвалидация кэша по паттерну (переадресация в Redis)
     */
    async invalidateCache(pattern) {
        await this.redisCache.invalidatePattern(pattern);
        logger_1.enhancedDbLogger.info('🗑️ Redis инвалидация кэша', { pattern });
    }
    /**
     * Получение статистики кэша
     */
    getCacheStats() {
        return this.redisCache.getStats();
    }
    /**
     * Получение статистики запросов
     */
    getQueryStats() {
        return new Map(this.queryStats);
    }
    /**
     * Очистка статистики запросов
     */
    clearQueryStats() {
        this.queryStats.clear();
    }
    /**
     * Получение статистики производительности БД с Redis метриками
     */
    async getDatabasePerformanceStats() {
        const operationId = await logger_1.enhancedDbLogger.startOperation('getDatabasePerformanceStats');
        try {
            // Базовая статистика запросов
            const stats = Array.from(this.queryStats.values());
            const avgQueryTime = stats.length > 0
                ? stats.reduce((sum, stat) => sum + stat.queryTime, 0) / stats.length
                : 0;
            // Redis статистика
            const redisStats = this.redisCache.getStats();
            await logger_1.enhancedDbLogger.endOperation(operationId, true);
            return {
                avgQueryTime,
                slowQueries: stats.filter(s => s.queryTime > 1000).length,
                totalQueries: stats.length,
                cacheHitRate: redisStats.hitRate,
                redisStats,
                connectionStats: {} // TODO: Добавить статистику соединений
            };
        }
        catch (error) {
            await logger_1.enhancedDbLogger.endOperation(operationId, false);
            await logger_1.enhancedDbLogger.logError(error);
            throw new ErrorTypes_1.DatabaseError('Ошибка получения статистики производительности БД', ErrorTypes_1.ErrorCode.QUERY_FAILED, { operation: 'getDatabasePerformanceStats' });
        }
    }
}
exports.RedisOptimizedQueryBuilder = RedisOptimizedQueryBuilder;
exports.default = RedisOptimizedQueryBuilder;
//# sourceMappingURL=RedisOptimizedQueryBuilder.js.map