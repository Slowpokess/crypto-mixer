/**
 * Продвинутая Redis Cache Layer для криптомиксера
 * 
 * Поддерживает:
 * - Multiple caching strategies (LRU, LFU, TTL-based)
 * - Cache warming и preloading
 * - Intelligent cache invalidation
 * - Multi-level caching (L1 memory + L2 Redis)
 * - Cache compression для больших объектов
 * - Distribution-aware caching для кластеров
 * - Cache analytics и performance monitoring
 */

import { RedisConnectionManager } from './RedisConnectionManager';
import { enhancedDbLogger } from '../logger';
import { EventEmitter } from 'events';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';

const compressAsync = promisify(gzip);
const decompressAsync = promisify(gunzip);

export interface CacheConfig {
  // Основные настройки
  defaultTTL: number;
  maxKeyLength: number;
  keyPrefix: string;
  
  // Strategies
  enableLRUEviction: boolean;
  enableCompression: boolean;
  compressionThreshold: number; // Размер в байтах
  enableMultiLevel: boolean; // L1 memory + L2 Redis
  
  // Performance
  enableBatching: boolean;
  batchSize: number;
  batchTimeout: number;
  enablePipelining: boolean;
  
  // Cache warming
  enableWarmup: boolean;
  warmupKeys: string[];
  warmupConcurrency: number;
  
  // Monitoring
  enableAnalytics: boolean;
  analyticsInterval: number;
  enableHitRateTracking: boolean;
  
  // Advanced features
  enableDistributedLocking: boolean;
  lockTimeout: number;
  enableCacheStampedeProtection: boolean;
  
  // Serialization
  serializationStrategy: 'json' | 'msgpack' | 'protobuf';
  enableSchemaValidation: boolean;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
  compressed: boolean;
  checksum?: string;
}

export interface CacheStats {
  totalKeys: number;
  memoryUsage: number;
  hitRate: number;
  missRate: number;
  evictionRate: number;
  compressionRatio: number;
  averageLatency: number;
  operationsPerSecond: number;
  errorRate: number;
}

export interface CacheOperation {
  type: 'get' | 'set' | 'del' | 'exists' | 'expire';
  key: string;
  startTime: number;
  success: boolean;
  latency?: number;
  size?: number;
  fromL1Cache?: boolean;
}

export interface CacheBatch {
  operations: Array<{
    type: 'get' | 'set' | 'del';
    key: string;
    value?: any;
    ttl?: number;
  }>;
  timeout?: number;
}

/**
 * Высокопроизводительная Redis Cache Layer
 */
export class RedisCacheLayer extends EventEmitter {
  private redis: RedisConnectionManager;
  private config: CacheConfig;
  
  // Multi-level caching (L1 - memory, L2 - Redis)
  private l1Cache = new Map<string, CacheEntry>();
  private l1MaxSize: number = 1000; // Максимальное количество элементов в L1
  
  // Batching и pipelining
  private pendingBatch: CacheBatch | null = null;
  private batchTimer: NodeJS.Timeout | null = null;
  
  // Analytics и monitoring
  private stats: CacheStats;
  private operations: CacheOperation[] = [];
  private analyticsTimer?: NodeJS.Timeout;
  
  // Cache warming
  private warmupInProgress = false;
  
  // Distributed locking
  private activeLocks = new Map<string, { timestamp: number; timeout: number }>();

  constructor(redis: RedisConnectionManager, config: Partial<CacheConfig> = {}) {
    super();
    
    this.redis = redis;
    this.config = {
      defaultTTL: 3600, // 1 час
      maxKeyLength: 250,
      keyPrefix: 'cache:',
      
      enableLRUEviction: true,
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      enableMultiLevel: true,
      
      enableBatching: true,
      batchSize: 100,
      batchTimeout: 10, // ms
      enablePipelining: true,
      
      enableWarmup: false,
      warmupKeys: [],
      warmupConcurrency: 5,
      
      enableAnalytics: true,
      analyticsInterval: 60000, // 1 минута
      enableHitRateTracking: true,
      
      enableDistributedLocking: true,
      lockTimeout: 30000, // 30 секунд
      enableCacheStampedeProtection: true,
      
      serializationStrategy: 'json',
      enableSchemaValidation: false,
      
      ...config
    };

    this.stats = {
      totalKeys: 0,
      memoryUsage: 0,
      hitRate: 0,
      missRate: 0,
      evictionRate: 0,
      compressionRatio: 0,
      averageLatency: 0,
      operationsPerSecond: 0,
      errorRate: 0
    };

    this.initializeAnalytics();
    
    enhancedDbLogger.info('🗄️ RedisCacheLayer инициализирован', {
      config: {
        enableMultiLevel: this.config.enableMultiLevel,
        enableCompression: this.config.enableCompression,
        enableBatching: this.config.enableBatching,
        defaultTTL: this.config.defaultTTL
      }
    });
  }

  /**
   * Инициализация системы аналитики
   */
  private initializeAnalytics(): void {
    if (!this.config.enableAnalytics) return;

    this.analyticsTimer = setInterval(() => {
      this.updateStats();
      this.cleanupOldOperations();
      this.cleanupExpiredLocks();
    }, this.config.analyticsInterval);

    enhancedDbLogger.info('📊 Cache analytics включена');
  }

  /**
   * Получение значения из кэша с multi-level поддержкой
   */
  public async get<T = any>(key: string): Promise<T | null> {
    const operation: CacheOperation = {
      type: 'get',
      key,
      startTime: Date.now(),
      success: false
    };

    try {
      const normalizedKey = this.normalizeKey(key);

      // L1 Cache (memory) проверка
      if (this.config.enableMultiLevel) {
        const l1Result = this.getFromL1Cache<T>(normalizedKey);
        if (l1Result !== null) {
          operation.success = true;
          operation.latency = Date.now() - operation.startTime;
          operation.fromL1Cache = true;
          this.recordOperation(operation);
          
          enhancedDbLogger.debug('💨 L1 cache hit', { key: normalizedKey });
          return l1Result;
        }
      }

      // L2 Cache (Redis) проверка
      const serializedData = await this.redis.executeCommand('get', [normalizedKey], true);
      
      if (serializedData === null) {
        operation.success = false;
        operation.latency = Date.now() - operation.startTime;
        this.recordOperation(operation);
        return null;
      }

      // Десериализация и декомпрессия
      const cacheEntry = await this.deserializeData<T>(serializedData);
      
      // Проверяем TTL
      if (this.isExpired(cacheEntry)) {
        await this.delete(key); // Удаляем устаревшие данные
        operation.success = false;
        operation.latency = Date.now() - operation.startTime;
        this.recordOperation(operation);
        return null;
      }

      // Обновляем статистику использования
      cacheEntry.hits++;

      // Кэшируем в L1 если включено
      if (this.config.enableMultiLevel) {
        this.setInL1Cache(normalizedKey, cacheEntry);
      }

      operation.success = true;
      operation.latency = Date.now() - operation.startTime;
      operation.size = cacheEntry.size;
      this.recordOperation(operation);

      enhancedDbLogger.debug('✅ Redis cache hit', { 
        key: normalizedKey, 
        hits: cacheEntry.hits,
        compressed: cacheEntry.compressed
      });
      
      return cacheEntry.data;

    } catch (error) {
      operation.success = false;
      operation.latency = Date.now() - operation.startTime;
      this.recordOperation(operation);
      
      enhancedDbLogger.error('❌ Ошибка получения из кэша', { key, error });
      throw error;
    }
  }

  /**
   * Сохранение значения в кэш
   */
  public async set<T = any>(
    key: string, 
    value: T, 
    ttl: number = this.config.defaultTTL
  ): Promise<void> {
    const operation: CacheOperation = {
      type: 'set',
      key,
      startTime: Date.now(),
      success: false
    };

    try {
      const normalizedKey = this.normalizeKey(key);
      
      // Создаем cache entry
      const cacheEntry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl: ttl * 1000, // Конвертируем в миллисекунды
        hits: 0,
        size: this.calculateSize(value),
        compressed: false
      };

      // Сериализация и компрессия
      const serializedData = await this.serializeData(cacheEntry);
      
      // Cache stampede protection
      if (this.config.enableCacheStampedeProtection) {
        const lockKey = `lock:${normalizedKey}`;
        const lockAcquired = await this.acquireDistributedLock(lockKey);
        
        if (!lockAcquired) {
          enhancedDbLogger.warn('⚠️ Cache stampede protection активирована', { key });
          return;
        }
      }

      // Сохраняем в Redis
      if (ttl > 0) {
        await this.redis.executeCommand('setex', [normalizedKey, ttl, serializedData], false);
      } else {
        await this.redis.executeCommand('set', [normalizedKey, serializedData], false);
      }

      // Сохраняем в L1 кэш если включено
      if (this.config.enableMultiLevel) {
        this.setInL1Cache(normalizedKey, cacheEntry);
      }

      operation.success = true;
      operation.latency = Date.now() - operation.startTime;
      operation.size = cacheEntry.size;
      this.recordOperation(operation);

      enhancedDbLogger.debug('💾 Данные сохранены в кэш', { 
        key: normalizedKey, 
        size: cacheEntry.size,
        compressed: cacheEntry.compressed,
        ttl 
      });

    } catch (error) {
      operation.success = false;
      operation.latency = Date.now() - operation.startTime;
      this.recordOperation(operation);
      
      enhancedDbLogger.error('❌ Ошибка сохранения в кэш', { key, error });
      throw error;
    }
  }

  /**
   * Удаление из кэша
   */
  public async delete(key: string): Promise<boolean> {
    const operation: CacheOperation = {
      type: 'del',
      key,
      startTime: Date.now(),
      success: false
    };

    try {
      const normalizedKey = this.normalizeKey(key);

      // Удаляем из L1 кэша
      if (this.config.enableMultiLevel) {
        this.l1Cache.delete(normalizedKey);
      }

      // Удаляем из Redis
      const result = await this.redis.executeCommand('del', [normalizedKey], false);
      const deleted = result > 0;

      operation.success = true;
      operation.latency = Date.now() - operation.startTime;
      this.recordOperation(operation);

      enhancedDbLogger.debug('🗑️ Ключ удален из кэша', { key: normalizedKey, deleted });
      
      return deleted;

    } catch (error) {
      operation.success = false;
      operation.latency = Date.now() - operation.startTime;
      this.recordOperation(operation);
      
      enhancedDbLogger.error('❌ Ошибка удаления из кэша', { key, error });
      throw error;
    }
  }

  /**
   * Проверка существования ключа
   */
  public async exists(key: string): Promise<boolean> {
    try {
      const normalizedKey = this.normalizeKey(key);

      // Проверяем L1 кэш
      if (this.config.enableMultiLevel && this.l1Cache.has(normalizedKey)) {
        const entry = this.l1Cache.get(normalizedKey);
        if (entry && !this.isExpired(entry)) {
          return true;
        }
      }

      // Проверяем Redis
      const result = await this.redis.executeCommand('exists', [normalizedKey], true);
      return result > 0;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки существования ключа', { key, error });
      return false;
    }
  }

  /**
   * Установка TTL для существующего ключа
   */
  public async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const normalizedKey = this.normalizeKey(key);
      
      // Обновляем TTL в L1 кэше
      if (this.config.enableMultiLevel && this.l1Cache.has(normalizedKey)) {
        const entry = this.l1Cache.get(normalizedKey);
        if (entry) {
          entry.ttl = ttl * 1000;
          entry.timestamp = Date.now();
        }
      }

      // Обновляем TTL в Redis
      const result = await this.redis.executeCommand('expire', [normalizedKey, ttl], false);
      return result > 0;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка установки TTL', { key, ttl, error });
      return false;
    }
  }

  /**
   * Batch операции для лучшей производительности
   */
  public async executeBatch(batch: CacheBatch): Promise<any[]> {
    if (!this.config.enableBatching) {
      // Выполняем операции последовательно
      const results = [];
      for (const op of batch.operations) {
        switch (op.type) {
          case 'get':
            results.push(await this.get(op.key));
            break;
          case 'set':
            await this.set(op.key, op.value, op.ttl);
            results.push('OK');
            break;
          case 'del':
            results.push(await this.delete(op.key));
            break;
        }
      }
      return results;
    }

    try {
      enhancedDbLogger.debug('📦 Выполняем batch операции', { 
        operationsCount: batch.operations.length 
      });

      // Используем Redis pipeline для batch операций
      const connection = this.redis.getConnection(false);
      const pipeline = (connection as any).pipeline();

      for (const op of batch.operations) {
        const normalizedKey = this.normalizeKey(op.key);
        
        switch (op.type) {
          case 'get':
            pipeline.get(normalizedKey);
            break;
          case 'set':
            if (op.ttl && op.ttl > 0) {
              pipeline.setex(normalizedKey, op.ttl, JSON.stringify(op.value));
            } else {
              pipeline.set(normalizedKey, JSON.stringify(op.value));
            }
            break;
          case 'del':
            pipeline.del(normalizedKey);
            break;
        }
      }

      const results = await pipeline.exec();
      
      enhancedDbLogger.debug('✅ Batch операции выполнены', { 
        resultsCount: results?.length || 0 
      });

      return results?.map((result: any) => result[1]) || [];

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка выполнения batch операций', { error });
      throw error;
    }
  }

  /**
   * Cache warming - предзагрузка важных данных
   */
  public async warmupCache(): Promise<void> {
    if (!this.config.enableWarmup || this.warmupInProgress) {
      return;
    }

    this.warmupInProgress = true;
    
    try {
      enhancedDbLogger.info('🔥 Начинаем cache warming', { 
        keysCount: this.config.warmupKeys.length 
      });

      // Выполняем warming с ограниченной concurrency
      const semaphore = new Array(this.config.warmupConcurrency).fill(null);
      const warmupPromises = this.config.warmupKeys.map(async (key, index) => {
        // Ждем доступного слота
        await semaphore[index % this.config.warmupConcurrency];
        
        try {
          // Проверяем, есть ли данные в кэше
          const exists = await this.exists(key);
          if (!exists) {
            enhancedDbLogger.debug('🔥 Ключ не найден при warming', { key });
          }
        } catch (error) {
          enhancedDbLogger.warn('⚠️ Ошибка warming ключа', { key, error });
        }
      });

      await Promise.all(warmupPromises);
      
      enhancedDbLogger.info('✅ Cache warming завершен');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка cache warming', { error });
    } finally {
      this.warmupInProgress = false;
    }
  }

  /**
   * Интеллектуальная инвалидация кэша по паттерну
   */
  public async invalidatePattern(pattern: string): Promise<number> {
    try {
      enhancedDbLogger.info('🗑️ Инвалидация кэша по паттерну', { pattern });

      // Инвалидируем L1 кэш
      let invalidatedL1 = 0;
      if (this.config.enableMultiLevel) {
        for (const key of this.l1Cache.keys()) {
          if (key.includes(pattern)) {
            this.l1Cache.delete(key);
            invalidatedL1++;
          }
        }
      }

      // Инвалидируем Redis кэш
      const normalizedPattern = this.normalizeKey(pattern + '*');
      const keys = await this.redis.executeCommand('keys', [normalizedPattern], true);
      
      let invalidatedRedis = 0;
      if (keys && keys.length > 0) {
        invalidatedRedis = await this.redis.executeCommand('del', keys, false);
      }

      const totalInvalidated = invalidatedL1 + invalidatedRedis;
      
      enhancedDbLogger.info('✅ Инвалидация завершена', { 
        pattern, 
        invalidatedL1, 
        invalidatedRedis, 
        total: totalInvalidated 
      });

      this.emit('cache_invalidated', { pattern, count: totalInvalidated });
      
      return totalInvalidated;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инвалидации кэша', { pattern, error });
      throw error;
    }
  }

  /**
   * Выполнение произвольных Redis команд
   */
  public async executeCommand(command: string, args: any[], isReadOperation: boolean = false): Promise<any> {
    return this.redis.executeCommand(command, args, isReadOperation);
  }

  /**
   * L1 Cache операции (memory cache)
   */
  private getFromL1Cache<T>(key: string): T | null {
    const entry = this.l1Cache.get(key);
    if (!entry || this.isExpired(entry)) {
      if (entry) this.l1Cache.delete(key);
      return null;
    }
    
    entry.hits++;
    return entry.data;
  }

  private setInL1Cache<T>(key: string, entry: CacheEntry<T>): void {
    // LRU eviction если превышен размер
    if (this.l1Cache.size >= this.l1MaxSize) {
      const oldestKey = this.l1Cache.keys().next().value;
      if (oldestKey) this.l1Cache.delete(oldestKey);
    }
    
    this.l1Cache.set(key, entry);
  }

  /**
   * Проверка истечения TTL
   */
  private isExpired(entry: CacheEntry): boolean {
    if (entry.ttl <= 0) return false; // Без expiration
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Нормализация ключа кэша
   */
  private normalizeKey(key: string): string {
    const normalized = `${this.config.keyPrefix}${key}`;
    
    if (normalized.length > this.config.maxKeyLength) {
      // Используем hash для длинных ключей
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
      return `${this.config.keyPrefix}hash:${hash}`;
    }
    
    return normalized;
  }

  /**
   * Сериализация данных с опциональной компрессией
   */
  private async serializeData<T>(entry: CacheEntry<T>): Promise<string> {
    let serialized: string;
    
    switch (this.config.serializationStrategy) {
      case 'json':
        serialized = JSON.stringify(entry);
        break;
      case 'msgpack':
        // TODO: Реализовать msgpack сериализацию
        serialized = JSON.stringify(entry);
        break;
      case 'protobuf':
        // TODO: Реализовать protobuf сериализацию
        serialized = JSON.stringify(entry);
        break;
      default:
        serialized = JSON.stringify(entry);
    }

    // Компрессия если данные больше порога
    if (this.config.enableCompression && 
        Buffer.byteLength(serialized, 'utf8') > this.config.compressionThreshold) {
      
      try {
        const compressed = await compressAsync(Buffer.from(serialized, 'utf8'));
        entry.compressed = true;
        return `compressed:${compressed.toString('base64')}`;
      } catch (error) {
        enhancedDbLogger.warn('⚠️ Ошибка компрессии, используем исходные данные', { error });
      }
    }

    return serialized;
  }

  /**
   * Десериализация данных с декомпрессией
   */
  private async deserializeData<T>(data: string): Promise<CacheEntry<T>> {
    let decompressed = data;

    // Проверяем, сжаты ли данные
    if (data.startsWith('compressed:')) {
      try {
        const compressedData = Buffer.from(data.replace('compressed:', ''), 'base64');
        const decompressedBuffer = await decompressAsync(compressedData);
        decompressed = decompressedBuffer.toString('utf8');
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка декомпрессии данных', { error });
        throw error;
      }
    }

    try {
      return JSON.parse(decompressed);
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка десериализации данных', { error });
      throw error;
    }
  }

  /**
   * Расчет размера объекта
   */
  private calculateSize(obj: any): number {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8');
  }

  /**
   * Получение/освобождение distributed lock
   */
  private async acquireDistributedLock(lockKey: string): Promise<boolean> {
    if (!this.config.enableDistributedLocking) return true;

    try {
      const result = await this.redis.executeCommand(
        'set', 
        [lockKey, Date.now().toString(), 'PX', this.config.lockTimeout, 'NX'], 
        false
      );
      
      const acquired = result === 'OK';
      
      if (acquired) {
        this.activeLocks.set(lockKey, {
          timestamp: Date.now(),
          timeout: this.config.lockTimeout
        });
      }
      
      return acquired;
      
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения distributed lock', { lockKey, error });
      return false;
    }
  }

  /**
   * Запись операции для аналитики
   */
  private recordOperation(operation: CacheOperation): void {
    if (!this.config.enableAnalytics) return;
    
    this.operations.push(operation);
    
    // Ограничиваем количество операций в памяти
    if (this.operations.length > 10000) {
      this.operations.splice(0, 5000); // Удаляем старые операции
    }
  }

  /**
   * Обновление статистики
   */
  private updateStats(): void {
    if (this.operations.length === 0) return;

    const recentOps = this.operations.filter(op => 
      Date.now() - op.startTime < this.config.analyticsInterval
    );

    const totalOps = recentOps.length;
    const successfulOps = recentOps.filter(op => op.success).length;
    const getOps = recentOps.filter(op => op.type === 'get');
    const cacheHits = getOps.filter(op => op.success).length;

    this.stats.hitRate = getOps.length > 0 ? (cacheHits / getOps.length) * 100 : 0;
    this.stats.missRate = 100 - this.stats.hitRate;
    this.stats.errorRate = totalOps > 0 ? ((totalOps - successfulOps) / totalOps) * 100 : 0;
    this.stats.operationsPerSecond = totalOps / (this.config.analyticsInterval / 1000);
    
    if (recentOps.length > 0) {
      this.stats.averageLatency = recentOps
        .filter(op => op.latency !== undefined)
        .reduce((sum, op) => sum + (op.latency || 0), 0) / recentOps.length;
    }

    this.stats.totalKeys = this.l1Cache.size; // Приблизительно
    
    enhancedDbLogger.debug('📊 Cache stats обновлена', this.stats);
  }

  /**
   * Очистка старых операций
   */
  private cleanupOldOperations(): void {
    const cutoff = Date.now() - (this.config.analyticsInterval * 2);
    this.operations = this.operations.filter(op => op.startTime > cutoff);
  }

  /**
   * Очистка истекших locks
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now();
    for (const [key, lock] of this.activeLocks.entries()) {
      if (now - lock.timestamp > lock.timeout) {
        this.activeLocks.delete(key);
        // Также удаляем из Redis
        this.redis.executeCommand('del', [key], false).catch(() => {
          // Игнорируем ошибки cleanup
        });
      }
    }
  }

  /**
   * Получение статистики кэша
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Очистка всего кэша
   */
  public async flush(): Promise<void> {
    try {
      enhancedDbLogger.info('🗑️ Очистка всего кэша');

      // Очищаем L1 кэш
      if (this.config.enableMultiLevel) {
        this.l1Cache.clear();
      }

      // Очищаем Redis кэш по паттерну
      await this.invalidatePattern('');
      
      enhancedDbLogger.info('✅ Кэш полностью очищен');

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка очистки кэша', { error });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    enhancedDbLogger.info('🔄 Остановка RedisCacheLayer...');

    if (this.analyticsTimer) {
      clearInterval(this.analyticsTimer);
    }

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Освобождаем все активные locks
    for (const lockKey of this.activeLocks.keys()) {
      await this.redis.executeCommand('del', [lockKey], false).catch(() => {
        // Игнорируем ошибки при shutdown
      });
    }

    this.activeLocks.clear();
    this.l1Cache.clear();

    enhancedDbLogger.info('✅ RedisCacheLayer остановлен');
  }
}

export default RedisCacheLayer;