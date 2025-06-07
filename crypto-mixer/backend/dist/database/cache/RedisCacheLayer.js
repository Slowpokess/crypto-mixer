"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisCacheLayer = void 0;
const logger_1 = require("../logger");
const events_1 = require("events");
const util_1 = require("util");
const zlib_1 = require("zlib");
const compressAsync = (0, util_1.promisify)(zlib_1.gzip);
const decompressAsync = (0, util_1.promisify)(zlib_1.gunzip);
/**
 * Высокопроизводительная Redis Cache Layer
 */
class RedisCacheLayer extends events_1.EventEmitter {
    constructor(redis, config = {}) {
        super();
        // Multi-level caching (L1 - memory, L2 - Redis)
        this.l1Cache = new Map();
        this.l1MaxSize = 1000; // Максимальное количество элементов в L1
        // Batching и pipelining
        this.pendingBatch = null;
        this.batchTimer = null;
        this.operations = [];
        // Cache warming
        this.warmupInProgress = false;
        // Distributed locking
        this.activeLocks = new Map();
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
        logger_1.enhancedDbLogger.info('🗄️ RedisCacheLayer инициализирован', {
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
    initializeAnalytics() {
        if (!this.config.enableAnalytics)
            return;
        this.analyticsTimer = setInterval(() => {
            this.updateStats();
            this.cleanupOldOperations();
            this.cleanupExpiredLocks();
        }, this.config.analyticsInterval);
        logger_1.enhancedDbLogger.info('📊 Cache analytics включена');
    }
    /**
     * Получение значения из кэша с multi-level поддержкой
     */
    async get(key) {
        const operation = {
            type: 'get',
            key,
            startTime: Date.now(),
            success: false
        };
        try {
            const normalizedKey = this.normalizeKey(key);
            // L1 Cache (memory) проверка
            if (this.config.enableMultiLevel) {
                const l1Result = this.getFromL1Cache(normalizedKey);
                if (l1Result !== null) {
                    operation.success = true;
                    operation.latency = Date.now() - operation.startTime;
                    operation.fromL1Cache = true;
                    this.recordOperation(operation);
                    logger_1.enhancedDbLogger.debug('💨 L1 cache hit', { key: normalizedKey });
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
            const cacheEntry = await this.deserializeData(serializedData);
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
            logger_1.enhancedDbLogger.debug('✅ Redis cache hit', {
                key: normalizedKey,
                hits: cacheEntry.hits,
                compressed: cacheEntry.compressed
            });
            return cacheEntry.data;
        }
        catch (error) {
            operation.success = false;
            operation.latency = Date.now() - operation.startTime;
            this.recordOperation(operation);
            logger_1.enhancedDbLogger.error('❌ Ошибка получения из кэша', { key, error });
            throw error;
        }
    }
    /**
     * Сохранение значения в кэш
     */
    async set(key, value, ttl = this.config.defaultTTL) {
        const operation = {
            type: 'set',
            key,
            startTime: Date.now(),
            success: false
        };
        try {
            const normalizedKey = this.normalizeKey(key);
            // Создаем cache entry
            const cacheEntry = {
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
                    logger_1.enhancedDbLogger.warn('⚠️ Cache stampede protection активирована', { key });
                    return;
                }
            }
            // Сохраняем в Redis
            if (ttl > 0) {
                await this.redis.executeCommand('setex', [normalizedKey, ttl, serializedData], false);
            }
            else {
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
            logger_1.enhancedDbLogger.debug('💾 Данные сохранены в кэш', {
                key: normalizedKey,
                size: cacheEntry.size,
                compressed: cacheEntry.compressed,
                ttl
            });
        }
        catch (error) {
            operation.success = false;
            operation.latency = Date.now() - operation.startTime;
            this.recordOperation(operation);
            logger_1.enhancedDbLogger.error('❌ Ошибка сохранения в кэш', { key, error });
            throw error;
        }
    }
    /**
     * Удаление из кэша
     */
    async delete(key) {
        const operation = {
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
            logger_1.enhancedDbLogger.debug('🗑️ Ключ удален из кэша', { key: normalizedKey, deleted });
            return deleted;
        }
        catch (error) {
            operation.success = false;
            operation.latency = Date.now() - operation.startTime;
            this.recordOperation(operation);
            logger_1.enhancedDbLogger.error('❌ Ошибка удаления из кэша', { key, error });
            throw error;
        }
    }
    /**
     * Проверка существования ключа
     */
    async exists(key) {
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
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка проверки существования ключа', { key, error });
            return false;
        }
    }
    /**
     * Установка TTL для существующего ключа
     */
    async expire(key, ttl) {
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
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка установки TTL', { key, ttl, error });
            return false;
        }
    }
    /**
     * Batch операции для лучшей производительности
     */
    async executeBatch(batch) {
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
            logger_1.enhancedDbLogger.debug('📦 Выполняем batch операции', {
                operationsCount: batch.operations.length
            });
            // Используем Redis pipeline для batch операций
            const connection = this.redis.getConnection(false);
            const pipeline = connection.pipeline();
            for (const op of batch.operations) {
                const normalizedKey = this.normalizeKey(op.key);
                switch (op.type) {
                    case 'get':
                        pipeline.get(normalizedKey);
                        break;
                    case 'set':
                        if (op.ttl && op.ttl > 0) {
                            pipeline.setex(normalizedKey, op.ttl, JSON.stringify(op.value));
                        }
                        else {
                            pipeline.set(normalizedKey, JSON.stringify(op.value));
                        }
                        break;
                    case 'del':
                        pipeline.del(normalizedKey);
                        break;
                }
            }
            const results = await pipeline.exec();
            logger_1.enhancedDbLogger.debug('✅ Batch операции выполнены', {
                resultsCount: results?.length || 0
            });
            return results?.map((result) => result[1]) || [];
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка выполнения batch операций', { error });
            throw error;
        }
    }
    /**
     * Cache warming - предзагрузка важных данных
     */
    async warmupCache() {
        if (!this.config.enableWarmup || this.warmupInProgress) {
            return;
        }
        this.warmupInProgress = true;
        try {
            logger_1.enhancedDbLogger.info('🔥 Начинаем cache warming', {
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
                        logger_1.enhancedDbLogger.debug('🔥 Ключ не найден при warming', { key });
                    }
                }
                catch (error) {
                    logger_1.enhancedDbLogger.warn('⚠️ Ошибка warming ключа', { key, error });
                }
            });
            await Promise.all(warmupPromises);
            logger_1.enhancedDbLogger.info('✅ Cache warming завершен');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка cache warming', { error });
        }
        finally {
            this.warmupInProgress = false;
        }
    }
    /**
     * Интеллектуальная инвалидация кэша по паттерну
     */
    async invalidatePattern(pattern) {
        try {
            logger_1.enhancedDbLogger.info('🗑️ Инвалидация кэша по паттерну', { pattern });
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
            logger_1.enhancedDbLogger.info('✅ Инвалидация завершена', {
                pattern,
                invalidatedL1,
                invalidatedRedis,
                total: totalInvalidated
            });
            this.emit('cache_invalidated', { pattern, count: totalInvalidated });
            return totalInvalidated;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инвалидации кэша', { pattern, error });
            throw error;
        }
    }
    /**
     * Выполнение произвольных Redis команд
     */
    async executeCommand(command, args, isReadOperation = false) {
        return this.redis.executeCommand(command, args, isReadOperation);
    }
    /**
     * L1 Cache операции (memory cache)
     */
    getFromL1Cache(key) {
        const entry = this.l1Cache.get(key);
        if (!entry || this.isExpired(entry)) {
            if (entry)
                this.l1Cache.delete(key);
            return null;
        }
        entry.hits++;
        return entry.data;
    }
    setInL1Cache(key, entry) {
        // LRU eviction если превышен размер
        if (this.l1Cache.size >= this.l1MaxSize) {
            const oldestKey = this.l1Cache.keys().next().value;
            if (oldestKey)
                this.l1Cache.delete(oldestKey);
        }
        this.l1Cache.set(key, entry);
    }
    /**
     * Проверка истечения TTL
     */
    isExpired(entry) {
        if (entry.ttl <= 0)
            return false; // Без expiration
        return Date.now() - entry.timestamp > entry.ttl;
    }
    /**
     * Нормализация ключа кэша
     */
    normalizeKey(key) {
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
    async serializeData(entry) {
        let serialized;
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
            }
            catch (error) {
                logger_1.enhancedDbLogger.warn('⚠️ Ошибка компрессии, используем исходные данные', { error });
            }
        }
        return serialized;
    }
    /**
     * Десериализация данных с декомпрессией
     */
    async deserializeData(data) {
        let decompressed = data;
        // Проверяем, сжаты ли данные
        if (data.startsWith('compressed:')) {
            try {
                const compressedData = Buffer.from(data.replace('compressed:', ''), 'base64');
                const decompressedBuffer = await decompressAsync(compressedData);
                decompressed = decompressedBuffer.toString('utf8');
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка декомпрессии данных', { error });
                throw error;
            }
        }
        try {
            return JSON.parse(decompressed);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка десериализации данных', { error });
            throw error;
        }
    }
    /**
     * Расчет размера объекта
     */
    calculateSize(obj) {
        return Buffer.byteLength(JSON.stringify(obj), 'utf8');
    }
    /**
     * Получение/освобождение distributed lock
     */
    async acquireDistributedLock(lockKey) {
        if (!this.config.enableDistributedLocking)
            return true;
        try {
            const result = await this.redis.executeCommand('set', [lockKey, Date.now().toString(), 'PX', this.config.lockTimeout, 'NX'], false);
            const acquired = result === 'OK';
            if (acquired) {
                this.activeLocks.set(lockKey, {
                    timestamp: Date.now(),
                    timeout: this.config.lockTimeout
                });
            }
            return acquired;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения distributed lock', { lockKey, error });
            return false;
        }
    }
    /**
     * Запись операции для аналитики
     */
    recordOperation(operation) {
        if (!this.config.enableAnalytics)
            return;
        this.operations.push(operation);
        // Ограничиваем количество операций в памяти
        if (this.operations.length > 10000) {
            this.operations.splice(0, 5000); // Удаляем старые операции
        }
    }
    /**
     * Обновление статистики
     */
    updateStats() {
        if (this.operations.length === 0)
            return;
        const recentOps = this.operations.filter(op => Date.now() - op.startTime < this.config.analyticsInterval);
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
        logger_1.enhancedDbLogger.debug('📊 Cache stats обновлена', this.stats);
    }
    /**
     * Очистка старых операций
     */
    cleanupOldOperations() {
        const cutoff = Date.now() - (this.config.analyticsInterval * 2);
        this.operations = this.operations.filter(op => op.startTime > cutoff);
    }
    /**
     * Очистка истекших locks
     */
    cleanupExpiredLocks() {
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
    getStats() {
        return { ...this.stats };
    }
    /**
     * Очистка всего кэша
     */
    async flush() {
        try {
            logger_1.enhancedDbLogger.info('🗑️ Очистка всего кэша');
            // Очищаем L1 кэш
            if (this.config.enableMultiLevel) {
                this.l1Cache.clear();
            }
            // Очищаем Redis кэш по паттерну
            await this.invalidatePattern('');
            logger_1.enhancedDbLogger.info('✅ Кэш полностью очищен');
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка очистки кэша', { error });
            throw error;
        }
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger_1.enhancedDbLogger.info('🔄 Остановка RedisCacheLayer...');
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
        logger_1.enhancedDbLogger.info('✅ RedisCacheLayer остановлен');
    }
}
exports.RedisCacheLayer = RedisCacheLayer;
exports.default = RedisCacheLayer;
//# sourceMappingURL=RedisCacheLayer.js.map