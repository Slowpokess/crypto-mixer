/**
 * Оптимизированный Query Builder для устранения N+1 проблем
 * 
 * Обеспечивает:
 * - Эффективные JOIN запросы вместо multiple queries
 * - Агрегация данных на уровне БД
 * - Кэширование результатов
 * - Пагинация с оптимизацией
 * - Query analysis и performance monitoring
 */

import { Sequelize, QueryTypes, Transaction } from 'sequelize';
import { enhancedDbLogger } from '../logger';
import { PerformanceMonitor } from '../../utils/monitoring/PerformanceMonitor';
import { DatabaseError, ErrorCode } from '../../utils/errors/ErrorTypes';

export interface QueryOptions {
  // Базовые опции
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  
  // Кэширование
  cache?: boolean;
  cacheKey?: string;
  cacheTTL?: number; // секунды
  
  // Производительность
  explain?: boolean;
  timeout?: number;
  
  // Дополнительные параметры
  raw?: boolean;
  transaction?: Transaction;
}

export interface AggregationResult {
  [key: string]: number | string | null;
}

export interface MixRequestStatsResult {
  total: number | string;
  completed: number | string;
  pending: number | string;
  deposited: number | string;
  pooling: number | string;
  mixing: number | string;
  failed: number | string;
  cancelled: number | string;
}

export interface WalletStatsResult {
  total: number | string;
  active_wallets: number | string;
  locked_wallets: number | string;
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

export interface QueryPerformanceStats {
  queryTime: number;
  rowsReturned: number;
  rowsExamined: number;
  indexesUsed: string[];
  cacheHit: boolean;
  optimizationTips: string[];
}

/**
 * Кэш для запросов
 */
class QueryCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private defaultTTL = 300; // 5 минут

  set(key: string, data: any, ttl?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    if (now - item.timestamp > item.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  invalidate(pattern: string): void {
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // TODO: Реализовать подсчет hit rate
    };
  }
}

/**
 * Оптимизированный Query Builder
 */
export class OptimizedQueryBuilder {
  private sequelize: Sequelize;
  private cache: QueryCache;
  private performanceMonitor?: PerformanceMonitor; // Для совместимости, используется через createSpan/finishSpan
  private queryStats = new Map<string, QueryPerformanceStats>();
  private activeSpans = new Map<string, { startTime: number; operation: string }>();

  constructor(sequelize: Sequelize, performanceMonitor?: PerformanceMonitor) {
    this.sequelize = sequelize;
    this.cache = new QueryCache();
    this.performanceMonitor = performanceMonitor;
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
   * Оптимизированная статистика для MixRequest с агрегацией на уровне БД
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
    const span = this.createSpan('db_mix_request_stats', 'database');

    try {
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
        cache: true,
        cacheKey: `mix_stats_${JSON.stringify(filters)}`,
        cacheTTL: 300
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
        cache: true,
        cacheKey: `mix_currency_stats_${JSON.stringify(filters)}`,
        cacheTTL: 300
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

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

      return {
        total,
        byStatus,
        byCurrency,
        totalAmount,
        averageAmount,
        successRate
      };

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
   * Оптимизированная статистика для Wallet с агрегацией
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
    const span = this.createSpan('db_wallet_stats', 'database');

    try {
      // Основная статистика
      const mainStatsResult = await this.executeQuery<WalletStatsResult[]>(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_wallets,
          SUM(CASE WHEN is_locked = true THEN 1 ELSE 0 END) as locked_wallets
        FROM wallets
      `, {}, {
        cache: true,
        cacheKey: 'wallet_main_stats',
        cacheTTL: 600
      });

      // Статистика по типам
      const typeStats = await this.executeQuery<AggregationResult[]>(`
        SELECT 
          type,
          COUNT(*) as count
        FROM wallets 
        GROUP BY type
      `, {}, {
        cache: true,
        cacheKey: 'wallet_type_stats',
        cacheTTL: 600
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
        cache: true,
        cacheKey: 'wallet_currency_stats',
        cacheTTL: 300
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

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

      const mainStats = mainStatsResult[0] as WalletStatsResult;
      
      return {
        total: Number(mainStats?.total || 0),
        byType,
        byCurrency,
        totalBalance,
        activeWallets: Number(mainStats?.active_wallets || 0),
        lockedWallets: Number(mainStats?.locked_wallets || 0)
      };

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
   * Оптимизированный поиск MixRequest с JOIN'ами вместо N+1
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
    const span = this.createSpan('db_mix_request_find', 'database');

    try {
      const page = filters.page || 1;
      const limit = Math.min(filters.limit || 20, 100); // Максимум 100 записей за раз
      const offset = (page - 1) * limit;

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

      // Одиночный JOIN запрос вместо множественных запросов
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

      // Запрос для подсчета общего количества
      const countQuery = `
        SELECT COUNT(DISTINCT mr.id) as total
        FROM mix_requests mr
        LEFT JOIN deposit_addresses da ON mr.id = da.mix_request_id  
        WHERE ${whereClause}
      `;

      // Выполняем запросы параллельно
      const [rows, countResult] = await Promise.all([
        this.executeQuery(query, replacements, {
          cache: false, // Не кэшируем результаты с пагинацией
          explain: process.env.NODE_ENV === 'development'
        }),
        this.executeQuery(countQuery, replacements, {
          cache: true,
          cacheKey: `mix_count_${JSON.stringify(filters)}`,
          cacheTTL: 300
        })
      ]);

      const total = Number(countResult[0]?.total || 0);
      const totalPages = Math.ceil(total / limit);

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

      return {
        rows: rows.map(this.processMixRequestRow),
        count: total,
        totalPages,
        currentPage: page,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit,
        offset
      };

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
   * Оптимизированный поиск кошельков с достаточным балансом
   */
  async findWalletsWithSufficientBalance(
    currency: string,
    minAmount: number,
    limit: number = 10
  ): Promise<any[]> {
    const operationId = await enhancedDbLogger.startOperation('findWalletsWithSufficientBalance');
    const span = this.createSpan('db_wallet_find_balance', 'database');

    try {
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
        cache: true,
        cacheKey: `wallets_balance_${currency}_${minAmount}_${limit}`,
        cacheTTL: 60 // Короткое кэширование для балансов
      });

      this.finishSpan(span);
      await enhancedDbLogger.endOperation(operationId, true);

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
   * Агрегированная статистика производительности БД
   */
  async getDatabasePerformanceStats(): Promise<{
    avgQueryTime: number;
    slowQueries: number;
    totalQueries: number;
    cacheHitRate: number;
    connectionStats: any;
  }> {
    const operationId = await enhancedDbLogger.startOperation('getDatabasePerformanceStats');

    try {
      // Статистика медленных запросов
      const slowQueries = await this.executeQuery(`
        SELECT 
          COUNT(*) as slow_queries_count
        FROM information_schema.processlist 
        WHERE time > 5 AND command != 'Sleep'
      `, {}, { cache: false });

      // Статистика соединений
      const connectionStats = await this.executeQuery(`
        SHOW STATUS LIKE 'Threads_%'
      `, {}, { cache: true, cacheTTL: 30 });

      const stats = Array.from(this.queryStats.values());
      const avgQueryTime = stats.length > 0 
        ? stats.reduce((sum, stat) => sum + stat.queryTime, 0) / stats.length 
        : 0;

      const cacheStats = this.cache.getStats();

      await enhancedDbLogger.endOperation(operationId, true);

      return {
        avgQueryTime,
        slowQueries: Number(slowQueries[0]?.slow_queries_count || 0),
        totalQueries: stats.length,
        cacheHitRate: cacheStats.hitRate,
        connectionStats: connectionStats.reduce((acc: any, stat: any) => {
          acc[stat.Variable_name] = stat.Value;
          return acc;
        }, {} as any)
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

  /**
   * Выполнение оптимизированного запроса с мониторингом
   */
  private async executeQuery<T = any>(
    query: string,
    replacements: any = {},
    options: QueryOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    const queryKey = options.cacheKey || this.generateQueryKey(query, replacements);

    // Проверяем кэш
    if (options.cache) {
      const cached = this.cache.get(queryKey);
      if (cached) {
        enhancedDbLogger.debug('🎯 Cache hit для запроса', { queryKey });
        return cached;
      }
    }

    try {
      // EXPLAIN запрос для анализа в development
      if (options.explain && process.env.NODE_ENV === 'development') {
        try {
          const explainResult = await this.sequelize.query(`EXPLAIN ${query}`, {
            replacements,
            type: QueryTypes.SELECT
          });
          enhancedDbLogger.debug('📊 EXPLAIN результат', { query: query.substring(0, 100), explain: explainResult });
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

      // Сохраняем в кэш
      if (options.cache && result) {
        this.cache.set(queryKey, result, options.cacheTTL);
        enhancedDbLogger.debug('💾 Результат сохранен в кэш', { queryKey, ttl: options.cacheTTL });
      }

      // Сохраняем статистику
      this.queryStats.set(queryKey, {
        queryTime,
        rowsReturned: Array.isArray(result) ? result.length : 1,
        rowsExamined: 0, // TODO: Получать из EXPLAIN
        indexesUsed: [], // TODO: Получать из EXPLAIN
        cacheHit: false,
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
   * Инвалидация кэша по паттерну
   */
  public invalidateCache(pattern: string): void {
    this.cache.invalidate(pattern);
    enhancedDbLogger.info('🗑️ Инвалидация кэша', { pattern });
  }

  /**
   * Очистка всего кэша
   */
  public clearCache(): void {
    this.cache.clear();
    enhancedDbLogger.info('🗑️ Полная очистка кэша');
  }

  /**
   * Получение статистики кэша
   */
  public getCacheStats(): { size: number; hitRate: number } {
    return this.cache.getStats();
  }

  /**
   * Получение статистики запросов
   */
  public getQueryStats(): Map<string, QueryPerformanceStats> {
    return new Map(this.queryStats);
  }

  /**
   * Очистка статистики запросов
   */
  public clearQueryStats(): void {
    this.queryStats.clear();
  }
}

export default OptimizedQueryBuilder;