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

import { Sequelize, QueryTypes, Transaction } from 'sequelize';
import { enhancedDbLogger } from '../logger';
import { PerformanceMonitor } from '../../utils/monitoring/PerformanceMonitor';
import { DatabaseError, ErrorCode } from '../../utils/errors/ErrorTypes';
import { RedisConnectionManager } from '../cache/RedisConnectionManager';
import { RedisCacheLayer } from '../cache/RedisCacheLayer';
import { MixRequestStatsResult, WalletStatsResult } from './OptimizedQueryBuilder';

export interface RedisQueryOptions {
  // Базовые опции
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  
  // Redis кэширование
  cache?: boolean;
  cacheKey?: string;
  cacheTTL?: number; // секунды
  cacheInvalidationTags?: string[]; // Теги для умной инвалидации
  
  // Производительность
  explain?: boolean;
  timeout?: number;
  enableCompression?: boolean;
  
  // Дополнительные параметры
  raw?: boolean;
  transaction?: Transaction;
  
  // Redis specific
  useMultiLevel?: boolean; // L1 + L2 кэширование
  enableBatching?: boolean;
  distributedLocking?: boolean;
}

export interface AggregationResult {
  [key: string]: number | string | null;
}

export interface PaginatedResult<T> {
  rows: T[];
  count: number;
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  limit: number;
  offset: number;
}

export interface RedisQueryPerformanceStats {
  queryTime: number;
  rowsReturned: number;
  rowsExamined: number;
  indexesUsed: string[];
  cacheHit: boolean;
  cacheSource: 'l1' | 'l2' | 'none';
  optimizationTips: string[];
  redisLatency?: number;
  compressionRatio?: number;
}

/**
 * Redis-интегрированный Query Builder
 */
export class RedisOptimizedQueryBuilder {
  private sequelize: Sequelize;
  private redisCache: RedisCacheLayer;
  private performanceMonitor?: PerformanceMonitor;
  private queryStats = new Map<string, RedisQueryPerformanceStats>();
  private activeSpans = new Map<string, { startTime: number; operation: string }>();

  // Cache invalidation mapping
  private invalidationTagsMap = new Map<string, string[]>();

  constructor(
    sequelize: Sequelize, 
    redisCache: RedisCacheLayer,
    performanceMonitor?: PerformanceMonitor
  ) {
    this.sequelize = sequelize;
    this.redisCache = redisCache;
    this.performanceMonitor = performanceMonitor;

    enhancedDbLogger.info('🚀 RedisOptimizedQueryBuilder инициализирован с Redis backing');
  }

  /**
   * Создание span для трассировки операций
   */
  private createSpan(operation: string, _category: string): string {
    const spanId = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.activeSpans.set(spanId, { startTime: Date.now(), operation });
    return spanId;
  }

  /**
   * Завершение span для трассировки операций
   */
  private finishSpan(spanId: string): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      const duration = Date.now() - span.startTime;
      enhancedDbLogger.info(`🕐 Operation ${span.operation} completed`, { duration: `${duration}ms` });
      this.activeSpans.delete(spanId);
    }
  }

  /**
   * REDIS-ОПТИМИЗИРОВАННАЯ статистика для MixRequest
   */
  async getMixRequestStatistics(filters: {
    startDate?: Date;
    endDate?: Date;
    currency?: string;
  } = {}): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byCurrency: Record<string, number>;
    totalAmount: Record<string, number>;
    averageAmount: Record<string, number>;
    successRate: number;
  }> {
    const operationId = await enhancedDbLogger.startOperation('getMixRequestStatistics');
    const span = this.createSpan('redis_db_mix_request_stats', 'database');

    try {
      // Генерируем умный cache key
      const cacheKey = this.generateSmartCacheKey('mix_request_stats', filters);
      const invalidationTags = ['mix_requests', 'statistics'];

      // Пытаемся получить из Redis кэша
      const cachedResult = await this.redisCache.get(cacheKey);
      if (cachedResult) {
        this.finishSpan(span);
        await enhancedDbLogger.endOperation(operationId, true);
        
        enhancedDbLogger.debug('✅ Redis cache hit для MixRequest статистики', { cacheKey });
        return cachedResult;
      }

      // Выполняем оптимизированный запрос к БД
      const whereClause = this.buildDateFilter(filters.startDate, filters.endDate);
      const currencyFilter = filters.currency ? `AND currency = :currency` : '';

      // Агрегированный запрос вместо загрузки всех записей
      const statsResult = await this.executeQuery<MixRequestStatsResult[]>(`
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
      const currencyStats = await this.executeQuery<AggregationResult[]>(`
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
      const firstResult = statsResult[0] as MixRequestStatsResult;
      const total = Number(firstResult?.total || 0);
      const completed = Number(firstResult?.completed || 0);

      const byStatus = {
        COMPLETED: Number(firstResult?.completed || 0),
        PENDING: Number(firstResult?.pending || 0),
        DEPOSITED: Number(firstResult?.deposited || 0),
        POOLING: Number(firstResult?.pooling || 0),
        MIXING: Number(firstResult?.mixing || 0),
        FAILED: Number(firstResult?.failed || 0),
        CANCELLED: Number(firstResult?.cancelled || 0)
      };

      const byCurrency: Record<string, number> = {};
      const totalAmount: Record<string, number> = {};
      const averageAmount: Record<string, number> = {};

      currencyStats.forEach(stat => {
        const currency = stat.currency as string;
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

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

      enhancedDbLogger.debug('💾 MixRequest статистика кэширована в Redis', { 
        cacheKey, 
        ttl,
        total 
      });

      return result;

    } catch (error) {
      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error as Error);
      throw new DatabaseError(
        'Ошибка получения статистики MixRequest',
        ErrorCode.QUERY_FAILED,
        { operation: 'getMixRequestStatistics', additionalInfo: { filters } }
      );
    }
  }

  /**
   * REDIS-ОПТИМИЗИРОВАННАЯ статистика для Wallet
   */
  async getWalletStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    byCurrency: Record<string, number>;
    totalBalance: Record<string, number>;
    activeWallets: number;
    lockedWallets: number;
  }> {
    const operationId = await enhancedDbLogger.startOperation('getWalletStatistics');
    const span = this.createSpan('redis_db_wallet_stats', 'database');

    try {
      const cacheKey = 'wallet_statistics';
      const invalidationTags = ['wallets', 'statistics'];

      // Проверяем Redis кэш
      const cachedResult = await this.redisCache.get(cacheKey);
      if (cachedResult) {
        this.finishSpan(span);
        await enhancedDbLogger.endOperation(operationId, true);
        
        enhancedDbLogger.debug('✅ Redis cache hit для Wallet статистики');
        return cachedResult;
      }

      // Основная статистика
      const mainStatsResult = await this.executeQuery<WalletStatsResult[]>(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_wallets,
          SUM(CASE WHEN is_locked = true THEN 1 ELSE 0 END) as locked_wallets
        FROM wallets
      `, {}, {
        cache: false
      });

      // Статистика по типам
      const typeStats = await this.executeQuery<AggregationResult[]>(`
        SELECT 
          type,
          COUNT(*) as count
        FROM wallets 
        GROUP BY type
      `, {}, {
        cache: false
      });

      // Статистика по валютам и балансам
      const currencyStats = await this.executeQuery<AggregationResult[]>(`
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
      const byType: Record<string, number> = {};
      typeStats.forEach(stat => {
        byType[stat.type as string] = Number(stat.count);
      });

      const byCurrency: Record<string, number> = {};
      const totalBalance: Record<string, number> = {};
      currencyStats.forEach(stat => {
        const currency = stat.currency as string;
        byCurrency[currency] = Number(stat.count);
        totalBalance[currency] = Number(stat.total_balance || 0);
      });

      const mainStats = mainStatsResult[0] as WalletStatsResult;
      
      const result = {
        total: Number(mainStats?.total || 0),
        byType,
        byCurrency,
        totalBalance,
        activeWallets: Number(mainStats?.active_wallets || 0),
        lockedWallets: Number(mainStats?.locked_wallets || 0)
      };

      // Кэшируем в Redis
      const ttl = this.calculateSmartTTL(result.total, 'wallet_stats');
      await this.redisCache.set(cacheKey, result, ttl);
      
      this.registerInvalidationTags(cacheKey, invalidationTags);

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

      enhancedDbLogger.debug('💾 Wallet статистика кэширована в Redis', { 
        cacheKey, 
        ttl 
      });

      return result;

    } catch (error) {
      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error as Error);
      throw new DatabaseError(
        'Ошибка получения статистики Wallet',
        ErrorCode.QUERY_FAILED,
        { operation: 'getWalletStatistics' }
      );
    }
  }

  /**
   * REDIS-ОПТИМИЗИРОВАННЫЙ поиск MixRequest с отношениями
   */
  async findMixRequestsWithRelations(filters: {
    currency?: string;
    status?: string | string[];
    minAmount?: number;
    maxAmount?: number;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult<any>> {
    const operationId = await enhancedDbLogger.startOperation('findMixRequestsWithRelations');
    const span = this.createSpan('redis_db_mix_request_find', 'database');

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
        this.finishSpan(span);
        await enhancedDbLogger.endOperation(operationId, true);
        
        enhancedDbLogger.debug('✅ Redis cache hit для MixRequest поиска', { cacheKey });
        return cachedResult;
      }

      // Строим WHERE условия
      const whereConditions: string[] = ['1=1'];
      const replacements: any = { limit, offset };

      if (filters.currency) {
        whereConditions.push('mr.currency = :currency');
        replacements.currency = filters.currency;
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          whereConditions.push('mr.status IN (:statuses)');
          replacements.statuses = filters.status;
        } else {
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
        if (filters.startDate) replacements.startDate = filters.startDate;
        if (filters.endDate) replacements.endDate = filters.endDate;
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
      let total = await this.redisCache.get<number>(countCacheKey);
      
      if (total === null) {
        const countQuery = `
          SELECT COUNT(DISTINCT mr.id) as total
          FROM mix_requests mr
          LEFT JOIN deposit_addresses da ON mr.id = da.mix_request_id  
          WHERE ${whereClause}
        `;

        const countResult = await this.executeQuery<AggregationResult[]>(countQuery, replacements, {
          cache: false
        });
        
        total = Number(countResult[0]?.total || 0);
        
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

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

      enhancedDbLogger.debug('💾 MixRequest поиск кэширован в Redis', { 
        cacheKey, 
        ttl,
        rowsCount: rows.length 
      });

      return result;

    } catch (error) {
      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error as Error);
      throw new DatabaseError(
        'Ошибка поиска MixRequest с relations',
        ErrorCode.QUERY_FAILED,
        { operation: 'findMixRequestsWithRelations', additionalInfo: { filters } }
      );
    }
  }

  /**
   * REDIS-ОПТИМИЗИРОВАННЫЙ поиск кошельков с достаточным балансом
   */
  async findWalletsWithSufficientBalance(
    currency: string,
    minAmount: number,
    limit: number = 10
  ): Promise<any[]> {
    const operationId = await enhancedDbLogger.startOperation('findWalletsWithSufficientBalance');
    const span = this.createSpan('redis_db_wallet_find_balance', 'database');

    try {
      const cacheKey = `wallets_balance_${currency}_${minAmount}_${limit}`;
      const invalidationTags = ['wallets', 'balances'];

      // Проверяем Redis кэш (короткий TTL для балансов)
      const cachedResult = await this.redisCache.get(cacheKey);
      if (cachedResult) {
        this.finishSpan(span);
        await enhancedDbLogger.endOperation(operationId, true);
        
        enhancedDbLogger.debug('✅ Redis cache hit для Wallet balance поиска', { cacheKey });
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

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

      enhancedDbLogger.debug('💾 Wallet balance поиск кэширован в Redis', { 
        cacheKey, 
        ttl,
        rowsCount: rows.length 
      });

      return rows;

    } catch (error) {
      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error as Error);
      throw new DatabaseError(
        'Ошибка поиска кошельков с достаточным балансом',
        ErrorCode.QUERY_FAILED,
        { operation: 'findWalletsWithSufficientBalance', additionalInfo: { currency, minAmount } }
      );
    }
  }

  /**
   * Выполнение оптимизированного запроса с Redis кэшированием
   */
  private async executeQuery<T = any>(
    query: string,
    replacements: any = {},
    options: RedisQueryOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    const queryKey = options.cacheKey || this.generateQueryKey(query, replacements);

    try {
      // EXPLAIN запрос для анализа в development
      if (options.explain && process.env.NODE_ENV === 'development') {
        try {
          const explainResult = await this.sequelize.query(`EXPLAIN ${query}`, {
            replacements,
            type: QueryTypes.SELECT
          });
          enhancedDbLogger.debug('📊 EXPLAIN результат', { 
            query: query.substring(0, 100), 
            explain: explainResult 
          });
        } catch (explainError) {
          // Игнорируем ошибки EXPLAIN
        }
      }

      // Выполняем основной запрос
      const sequelizeOptions: any = {
        replacements,
        type: QueryTypes.SELECT,
        transaction: options.transaction,
        raw: options.raw !== false
      };
      
      // Добавляем timeout если поддерживается
      if (options.timeout) {
        sequelizeOptions.timeout = options.timeout;
      }
      
      const result = await this.sequelize.query(query, sequelizeOptions);

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
        enhancedDbLogger.warn('🐌 Медленный запрос обнаружен', {
          query: query.substring(0, 200),
          queryTime,
          rowsReturned: Array.isArray(result) ? result.length : 1
        });
      }

      return result as T;

    } catch (error) {
      const queryTime = Date.now() - startTime;
      enhancedDbLogger.error('❌ Ошибка выполнения запроса', {
        query: query.substring(0, 200),
        error: (error as Error).message,
        queryTime,
        replacements
      });
      throw error;
    }
  }

  /**
   * Умная генерация cache key
   */
  private generateSmartCacheKey(operation: string, params: any): string {
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
  private calculateSmartTTL(dataSize: number, type: string): number {
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
  private registerInvalidationTags(cacheKey: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.invalidationTagsMap.has(tag)) {
        this.invalidationTagsMap.set(tag, []);
      }
      this.invalidationTagsMap.get(tag)!.push(cacheKey);
    }
  }

  /**
   * Умная инвалидация кэша по тегам
   */
  public async invalidateByTags(tags: string[]): Promise<number> {
    let totalInvalidated = 0;
    
    for (const tag of tags) {
      const keysToInvalidate = this.invalidationTagsMap.get(tag) || [];
      
      for (const key of keysToInvalidate) {
        try {
          const deleted = await this.redisCache.delete(key);
          if (deleted) totalInvalidated++;
        } catch (error) {
          enhancedDbLogger.warn('⚠️ Ошибка инвалидации ключа', { key, error });
        }
      }
      
      // Очищаем mapping
      this.invalidationTagsMap.set(tag, []);
    }

    enhancedDbLogger.info('🗑️ Инвалидация по тегам завершена', { 
      tags, 
      totalInvalidated 
    });

    return totalInvalidated;
  }

  /**
   * Построение фильтра по датам
   */
  private buildDateFilter(startDate?: Date, endDate?: Date, prefix: string = ''): string {
    if (!startDate && !endDate) return '';

    const conditions: string[] = [];
    
    if (startDate && endDate) {
      conditions.push(`${prefix}created_at BETWEEN :startDate AND :endDate`);
    } else if (startDate) {
      conditions.push(`${prefix}created_at >= :startDate`);
    } else if (endDate) {
      conditions.push(`${prefix}created_at <= :endDate`);
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
  }

  /**
   * Генерация ключа для кэша
   */
  private generateQueryKey(query: string, replacements: any): string {
    const queryHash = Buffer.from(query).toString('base64').substring(0, 32);
    const paramsHash = Buffer.from(JSON.stringify(replacements)).toString('base64').substring(0, 16);
    return `query_${queryHash}_${paramsHash}`;
  }

  /**
   * Обработка строки результата MixRequest
   */
  private processMixRequestRow(row: any): any {
    try {
      // Парсим JSON для output_transactions
      if (row.output_transactions) {
        row.output_transactions = JSON.parse(row.output_transactions).filter((tx: any) => tx !== null);
      } else {
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
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка обработки строки MixRequest', { error, row });
      return row;
    }
  }

  /**
   * Инвалидация кэша по паттерну (переадресация в Redis)
   */
  public async invalidateCache(pattern: string): Promise<void> {
    await this.redisCache.invalidatePattern(pattern);
    enhancedDbLogger.info('🗑️ Redis инвалидация кэша', { pattern });
  }

  /**
   * Получение статистики кэша
   */
  public getCacheStats(): any {
    return this.redisCache.getStats();
  }

  /**
   * Получение статистики запросов
   */
  public getQueryStats(): Map<string, RedisQueryPerformanceStats> {
    return new Map(this.queryStats);
  }

  /**
   * Очистка статистики запросов
   */
  public clearQueryStats(): void {
    this.queryStats.clear();
  }

  /**
   * Получение статистики производительности БД с Redis метриками
   */
  async getDatabasePerformanceStats(): Promise<{
    avgQueryTime: number;
    slowQueries: number;
    totalQueries: number;
    cacheHitRate: number;
    redisStats: any;
    connectionStats: any;
  }> {
    const operationId = await enhancedDbLogger.startOperation('getDatabasePerformanceStats');

    try {
      // Базовая статистика запросов
      const stats = Array.from(this.queryStats.values());
      const avgQueryTime = stats.length > 0 
        ? stats.reduce((sum, stat) => sum + stat.queryTime, 0) / stats.length 
        : 0;

      // Redis статистика
      const redisStats = this.redisCache.getStats();

      await enhancedDbLogger.endOperation(operationId, true);

      return {
        avgQueryTime,
        slowQueries: stats.filter(s => s.queryTime > 1000).length,
        totalQueries: stats.length,
        cacheHitRate: redisStats.hitRate,
        redisStats,
        connectionStats: {} // TODO: Добавить статистику соединений
      };

    } catch (error) {
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error as Error);
      throw new DatabaseError(
        'Ошибка получения статистики производительности БД',
        ErrorCode.QUERY_FAILED,
        { operation: 'getDatabasePerformanceStats' }
      );
    }
  }
}

export default RedisOptimizedQueryBuilder;