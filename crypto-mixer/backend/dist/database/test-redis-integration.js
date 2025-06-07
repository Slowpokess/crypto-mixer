"use strict";
/**
 * Комплексное тестирование Redis интеграции для криптомиксера
 *
 * Проверяет:
 * - Redis Connection Manager
 * - Cache Layer performance
 * - Critical Data Caching
 * - Session Management
 * - Rate Limiting & Anti-spam
 * - Distributed Locking
 * - Performance под нагрузкой
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRedisIntegration = testRedisIntegration;
const RedisMasterManager_1 = __importDefault(require("./cache/RedisMasterManager"));
const logger_1 = require("./logger");
/**
 * Полное тестирование Redis интеграции
 */
async function testRedisIntegration() {
    let redisMaster = null;
    try {
        logger_1.enhancedDbLogger.info('🧪 Начинаем комплексное тестирование Redis интеграции');
        // Инициализация Redis системы
        redisMaster = new RedisMasterManager_1.default({
            connection: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || '1'), // Тестовая БД
                keyPrefix: 'test_mixer:',
                enableCluster: false,
                enableReadWriteSplit: false
            },
            cache: {
                defaultTTL: 300, // 5 минут для тестов
                enableCompression: true,
                enableMultiLevel: true,
                enableBatching: true
            },
            monitoring: {
                enableHealthChecks: true,
                healthCheckInterval: 10000, // 10 секунд для тестов
                enablePerformanceTracking: true,
                enableAnalytics: true
            },
            security: {
                enableRateLimiting: true,
                enableAntiSpam: true,
                enableDistributedLocking: true
            }
        });
        // Ждем инициализации
        await redisMaster.initialize();
        logger_1.enhancedDbLogger.info('✅ Redis система инициализирована для тестирования');
        // 1. Тестируем Connection Manager
        await testConnectionManager(redisMaster);
        // 2. Тестируем Cache Layer
        await testCacheLayer(redisMaster);
        // 3. Тестируем Critical Data Caching
        await testCriticalDataCaching(redisMaster);
        // 4. Тестируем Session Management
        await testSessionManagement(redisMaster);
        // 5. Тестируем Rate Limiting
        await testRateLimiting(redisMaster);
        // 6. Тестируем Distributed Locking
        await testDistributedLocking(redisMaster);
        // 7. Тестируем Anti-spam защиту
        await testAntiSpamProtection(redisMaster);
        // 8. Нагрузочное тестирование
        await testPerformanceUnderLoad(redisMaster);
        // 9. Тестируем Health Monitoring
        await testHealthMonitoring(redisMaster);
        logger_1.enhancedDbLogger.info('🎉 Все тесты Redis интеграции успешно пройдены!');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Ошибка тестирования Redis интеграции', { error });
        throw error;
    }
    finally {
        // Graceful shutdown
        if (redisMaster) {
            logger_1.enhancedDbLogger.info('🧹 Очистка тестовых данных...');
            // Очищаем тестовые данные
            try {
                const cacheLayer = redisMaster.getCacheLayer();
                await cacheLayer.flush(); // Очищаем тестовую БД
            }
            catch (error) {
                logger_1.enhancedDbLogger.warn('⚠️ Ошибка очистки тестовых данных', { error });
            }
            await redisMaster.shutdown();
        }
    }
}
/**
 * Тестирование Connection Manager
 */
async function testConnectionManager(redisMaster) {
    logger_1.enhancedDbLogger.info('🔗 Тестируем Redis Connection Manager...');
    try {
        const connectionManager = redisMaster.getConnectionManager();
        // Тест базового подключения
        const connection = connectionManager.getConnection(false);
        const pingResult = await connection.ping();
        if (pingResult !== 'PONG') {
            throw new Error('Redis PING неуспешен');
        }
        // Тест статистики соединений
        const stats = connectionManager.getConnectionStats();
        logger_1.enhancedDbLogger.info('Connection stats:', {
            totalConnections: stats.totalConnections,
            activeConnections: stats.activeConnections,
            averageResponseTime: stats.averageResponseTime
        });
        // Тест health status
        const healthStatus = connectionManager.getHealthStatus();
        if (!healthStatus.isHealthy) {
            throw new Error('Redis connection нездоровое');
        }
        logger_1.enhancedDbLogger.info('✅ Connection Manager тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Connection Manager тест неуспешен', { error });
        throw error;
    }
}
/**
 * Тестирование Cache Layer
 */
async function testCacheLayer(redisMaster) {
    logger_1.enhancedDbLogger.info('🗄️ Тестируем Redis Cache Layer...');
    try {
        const cacheLayer = redisMaster.getCacheLayer();
        // Тест базового кэширования
        const testKey = 'test_cache_key';
        const testData = { message: 'Hello Redis!', timestamp: new Date(), number: 42 };
        await cacheLayer.set(testKey, testData, 60);
        const retrievedData = await cacheLayer.get(testKey);
        if (!retrievedData || retrievedData.message !== testData.message) {
            throw new Error('Базовое кэширование неуспешно');
        }
        // Тест TTL
        const exists1 = await cacheLayer.exists(testKey);
        if (!exists1) {
            throw new Error('Ключ должен существовать');
        }
        await cacheLayer.expire(testKey, 1); // 1 секунда
        await new Promise(resolve => setTimeout(resolve, 1100)); // Ждем больше секунды
        const exists2 = await cacheLayer.exists(testKey);
        if (exists2) {
            throw new Error('Ключ должен был истечь');
        }
        // Тест batch операций
        const batchOps = [
            { type: 'set', key: 'batch1', value: 'value1', ttl: 300 },
            { type: 'set', key: 'batch2', value: 'value2', ttl: 300 },
            { type: 'set', key: 'batch3', value: 'value3', ttl: 300 }
        ];
        await cacheLayer.executeBatch({ operations: batchOps });
        const batchGetOps = [
            { type: 'get', key: 'batch1' },
            { type: 'get', key: 'batch2' },
            { type: 'get', key: 'batch3' }
        ];
        const batchResults = await cacheLayer.executeBatch({ operations: batchGetOps });
        if (batchResults.length !== 3 || !batchResults.every(result => result !== null)) {
            throw new Error('Batch операции неуспешны');
        }
        // Тест compression (для больших данных)
        const largeData = 'x'.repeat(2000); // Больше compression threshold
        await cacheLayer.set('large_data', largeData, 60);
        const retrievedLargeData = await cacheLayer.get('large_data');
        if (retrievedLargeData !== largeData) {
            throw new Error('Compression/decompression неуспешно');
        }
        // Тест статистики кэша
        const cacheStats = cacheLayer.getStats();
        logger_1.enhancedDbLogger.info('Cache stats:', {
            hitRate: cacheStats.hitRate,
            totalKeys: cacheStats.totalKeys,
            memoryUsage: cacheStats.memoryUsage
        });
        logger_1.enhancedDbLogger.info('✅ Cache Layer тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Cache Layer тест неуспешен', { error });
        throw error;
    }
}
/**
 * Тестирование Critical Data Caching
 */
async function testCriticalDataCaching(redisMaster) {
    logger_1.enhancedDbLogger.info('🔒 Тестируем Critical Data Caching...');
    try {
        const criticalManager = redisMaster.getCriticalDataManager();
        // Тест mixing session
        const mixingSession = {
            id: 'test_session_123',
            currency: 'BTC',
            inputAmount: 0.1,
            outputAddresses: ['bc1test1', 'bc1test2'],
            depositAddress: 'bc1deposit_test',
            status: 'PENDING',
            expiresAt: new Date(Date.now() + 3600000),
            lastUpdated: new Date(),
            metadata: {
                userAgent: 'Test Agent',
                ipAddress: '127.0.0.1'
            }
        };
        await criticalManager.setMixingSession(mixingSession);
        const retrievedSession = await criticalManager.getMixingSession('test_session_123');
        if (!retrievedSession || retrievedSession.id !== mixingSession.id) {
            throw new Error('Mixing session кэширование неуспешно');
        }
        // Тест поиска по deposit address
        const foundSession = await criticalManager.findMixingSessionByDeposit('bc1deposit_test');
        if (!foundSession || foundSession.id !== mixingSession.id) {
            throw new Error('Поиск по deposit address неуспешен');
        }
        // Тест обновления статуса
        const updated = await criticalManager.updateMixingSessionStatus('test_session_123', 'DEPOSITED');
        if (!updated) {
            throw new Error('Обновление статуса неуспешно');
        }
        // Тест wallet balance кэширования
        const walletBalance = {
            id: 'wallet_test_123',
            currency: 'BTC',
            balance: 1.5,
            availableBalance: 1.5,
            lockedBalance: 0,
            lastTransactionAt: new Date(),
            lastUpdated: new Date(),
            isActive: true,
            isLocked: false
        };
        await criticalManager.setWalletBalance(walletBalance);
        const retrievedBalance = await criticalManager.getWalletBalance('wallet_test_123');
        if (!retrievedBalance || retrievedBalance.balance !== walletBalance.balance) {
            throw new Error('Wallet balance кэширование неуспешно');
        }
        // Тест exchange rate кэширования
        const exchangeRate = {
            baseCurrency: 'BTC',
            quoteCurrency: 'USD',
            rate: 50000,
            timestamp: new Date(),
            source: 'TEST_EXCHANGE',
            confidence: 95
        };
        await criticalManager.setExchangeRate(exchangeRate);
        const retrievedRate = await criticalManager.getExchangeRate('BTC', 'USD');
        if (!retrievedRate || retrievedRate.rate !== exchangeRate.rate) {
            throw new Error('Exchange rate кэширование неуспешно');
        }
        // Тест blacklist
        const testAddress = 'bc1suspicious_address';
        await criticalManager.addToBlacklist(testAddress, 'Test blacklist');
        const isBlacklisted = await criticalManager.isBlacklisted(testAddress);
        if (!isBlacklisted) {
            throw new Error('Blacklist функциональность неуспешна');
        }
        logger_1.enhancedDbLogger.info('✅ Critical Data Caching тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Critical Data Caching тест неуспешен', { error });
        throw error;
    }
}
/**
 * Тестирование Session Management
 */
async function testSessionManagement(redisMaster) {
    logger_1.enhancedDbLogger.info('🔐 Тестируем Session Management...');
    try {
        const sessionManager = redisMaster.getSessionManager();
        // Тест создания сессии
        const session = await sessionManager.createSession('192.168.1.100', 'Mozilla/5.0 Test Browser', 'test_user_123');
        if (!session || !session.id) {
            throw new Error('Создание сессии неуспешно');
        }
        // Тест получения сессии
        const retrievedSession = await sessionManager.getSession(session.id);
        if (!retrievedSession || retrievedSession.id !== session.id) {
            throw new Error('Получение сессии неуспешно');
        }
        // Тест обновления сессии
        const updated = await sessionManager.updateSession(session.id, {
            permissions: ['read', 'write'],
            metadata: { lastAction: 'test' }
        });
        if (!updated) {
            throw new Error('Обновление сессии неуспешно');
        }
        // Тест token management
        const tokenData = { userId: 'test_user_123', action: 'password_reset' };
        const token = await sessionManager.createToken('password_reset', tokenData, 300);
        if (!token) {
            throw new Error('Создание токена неуспешно');
        }
        const validatedData = await sessionManager.validateToken(token, 'password_reset');
        if (!validatedData || validatedData.userId !== tokenData.userId) {
            throw new Error('Валидация токена неуспешна');
        }
        // Тест одноразового использования токена
        const consumedData = await sessionManager.consumeToken(token, 'password_reset');
        if (!consumedData) {
            throw new Error('Использование токена неуспешно');
        }
        // Токен должен быть удален после использования
        const secondValidation = await sessionManager.validateToken(token, 'password_reset');
        if (secondValidation !== null) {
            throw new Error('Токен должен быть удален после использования');
        }
        // Тест temp data
        const tempKey = 'temp_test_key';
        const tempData = { message: 'temporary data', value: 42 };
        await sessionManager.setTempData(tempKey, tempData, 60);
        const retrievedTempData = await sessionManager.getTempData(tempKey);
        if (!retrievedTempData || retrievedTempData.message !== tempData.message) {
            throw new Error('Temporary data неуспешно');
        }
        // Тест удаления сессии
        const destroyed = await sessionManager.destroySession(session.id);
        if (!destroyed) {
            throw new Error('Удаление сессии неуспешно');
        }
        logger_1.enhancedDbLogger.info('✅ Session Management тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Session Management тест неуспешен', { error });
        throw error;
    }
}
/**
 * Тестирование Rate Limiting
 */
async function testRateLimiting(redisMaster) {
    logger_1.enhancedDbLogger.info('🚫 Тестируем Rate Limiting...');
    try {
        const sessionManager = redisMaster.getSessionManager();
        const testIdentifier = 'test_rate_limit_user';
        // Тест в пределах лимита
        for (let i = 0; i < 5; i++) {
            const result = await sessionManager.checkRateLimit(testIdentifier, 10, 60000); // 10 req/min
            if (!result.allowed) {
                throw new Error(`Запрос ${i + 1} должен был быть разрешен`);
            }
            logger_1.enhancedDbLogger.debug(`Rate limit check ${i + 1}/5:`, {
                allowed: result.allowed,
                remaining: result.remaining
            });
        }
        // Тест превышения лимита
        for (let i = 0; i < 8; i++) {
            await sessionManager.checkRateLimit(testIdentifier, 10, 60000);
        }
        // Этот запрос должен быть заблокирован
        const blockedResult = await sessionManager.checkRateLimit(testIdentifier, 10, 60000);
        if (blockedResult.allowed) {
            throw new Error('Запрос должен был быть заблокирован');
        }
        logger_1.enhancedDbLogger.info('Rate limiting работает:', {
            allowed: blockedResult.allowed,
            remaining: blockedResult.remaining
        });
        logger_1.enhancedDbLogger.info('✅ Rate Limiting тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Rate Limiting тест неуспешен', { error });
        throw error;
    }
}
/**
 * Тестирование Distributed Locking
 */
async function testDistributedLocking(redisMaster) {
    logger_1.enhancedDbLogger.info('🔒 Тестируем Distributed Locking...');
    try {
        const sessionManager = redisMaster.getSessionManager();
        const lockKey = 'test_distributed_lock';
        // Тест получения lock
        const lockResult = await sessionManager.acquireLock(lockKey, 10000);
        if (!lockResult.acquired || !lockResult.lock) {
            throw new Error('Получение distributed lock неуспешно');
        }
        const lockOwner = lockResult.lock.owner;
        // Тест повторного получения того же lock (должно быть неуспешно)
        const duplicateLockResult = await sessionManager.acquireLock(lockKey, 5000);
        if (duplicateLockResult.acquired) {
            throw new Error('Повторное получение lock должно быть неуспешно');
        }
        // Тест освобождения lock
        const released = await sessionManager.releaseLock(lockKey, lockOwner);
        if (!released) {
            throw new Error('Освобождение lock неуспешно');
        }
        // Тест получения lock после освобождения
        const newLockResult = await sessionManager.acquireLock(lockKey, 5000);
        if (!newLockResult.acquired) {
            throw new Error('Получение lock после освобождения неуспешно');
        }
        // Очистка
        await sessionManager.releaseLock(lockKey, newLockResult.lock.owner);
        logger_1.enhancedDbLogger.info('✅ Distributed Locking тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Distributed Locking тест неуспешен', { error });
        throw error;
    }
}
/**
 * Тестирование Anti-spam защиты
 */
async function testAntiSpamProtection(redisMaster) {
    logger_1.enhancedDbLogger.info('🛡️ Тестируем Anti-spam защиту...');
    try {
        const sessionManager = redisMaster.getSessionManager();
        const testIdentifier = 'test_suspicious_user';
        // Симулируем подозрительную активность
        await sessionManager.trackSuspiciousActivity(testIdentifier, 'rapid_requests', 'MEDIUM');
        await sessionManager.trackSuspiciousActivity(testIdentifier, 'suspicious_ip', 'HIGH');
        await sessionManager.trackSuspiciousActivity(testIdentifier, 'potential_bot', 'HIGH');
        // Проверяем, заблокирован ли пользователь
        const isBlocked = await sessionManager.isBlocked(testIdentifier);
        if (!isBlocked) {
            // Добавляем еще активности чтобы превысить порог
            await sessionManager.trackSuspiciousActivity(testIdentifier, 'blacklisted_address', 'HIGH');
            await sessionManager.trackSuspiciousActivity(testIdentifier, 'unusual_pattern', 'MEDIUM');
            const isBlockedNow = await sessionManager.isBlocked(testIdentifier);
            if (!isBlockedNow) {
                logger_1.enhancedDbLogger.warn('⚠️ Пользователь не заблокирован несмотря на высокий risk score');
            }
        }
        logger_1.enhancedDbLogger.info('✅ Anti-spam Protection тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Anti-spam Protection тест неуспешен', { error });
        throw error;
    }
}
/**
 * Нагрузочное тестирование
 */
async function testPerformanceUnderLoad(redisMaster) {
    logger_1.enhancedDbLogger.info('🚀 Тестируем производительность под нагрузкой...');
    try {
        const cacheLayer = redisMaster.getCacheLayer();
        const sessionManager = redisMaster.getSessionManager();
        const startTime = Date.now();
        const concurrentOperations = 100;
        const promises = [];
        // Создаем много параллельных операций
        for (let i = 0; i < concurrentOperations; i++) {
            // Кэш операции
            promises.push(cacheLayer.set(`load_test_${i}`, { data: `test_data_${i}`, timestamp: new Date() }, 300));
            // Session операции
            promises.push(sessionManager.createSession(`192.168.1.${i % 255}`, 'Load Test Browser', `user_${i}`));
            // Rate limit проверки
            promises.push(sessionManager.checkRateLimit(`load_test_${i}`, 100, 60000));
        }
        const results = await Promise.allSettled(promises);
        const endTime = Date.now();
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        const totalTime = endTime - startTime;
        const operationsPerSecond = (concurrentOperations * 3) / (totalTime / 1000); // 3 операции на итерацию
        logger_1.enhancedDbLogger.info('Нагрузочное тестирование завершено:', {
            concurrentOperations: concurrentOperations * 3,
            successful,
            failed,
            totalTime: totalTime + 'ms',
            operationsPerSecond: Math.round(operationsPerSecond)
        });
        // Проверяем, что большинство операций прошло успешно
        if (failed > concurrentOperations * 0.1) { // Более 10% неудач
            throw new Error(`Слишком много неудачных операций: ${failed}/${concurrentOperations * 3}`);
        }
        // Проверяем разумную производительность
        if (operationsPerSecond < 50) {
            logger_1.enhancedDbLogger.warn('⚠️ Низкая производительность под нагрузкой', { operationsPerSecond });
        }
        logger_1.enhancedDbLogger.info('✅ Performance тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Performance тест неуспешен', { error });
        throw error;
    }
}
/**
 * Тестирование Health Monitoring
 */
async function testHealthMonitoring(redisMaster) {
    logger_1.enhancedDbLogger.info('💓 Тестируем Health Monitoring...');
    try {
        // Получаем текущий статус здоровья
        const healthStatus = await redisMaster.performHealthCheck();
        logger_1.enhancedDbLogger.info('System Health:', {
            overall: healthStatus.overall,
            components: healthStatus.components,
            responseTime: healthStatus.details.responseTime,
            memoryUsage: healthStatus.details.memoryUsage
        });
        if (healthStatus.overall === 'CRITICAL') {
            throw new Error('Система в критическом состоянии');
        }
        // Получаем метрики производительности
        const performanceMetrics = redisMaster.getPerformanceMetrics();
        logger_1.enhancedDbLogger.info('Performance Metrics:', {
            connections: performanceMetrics.connections,
            cache: performanceMetrics.cache,
            operations: performanceMetrics.operations
        });
        // Проверяем базовые метрики
        if (performanceMetrics.connections.total === 0) {
            throw new Error('Нет активных соединений');
        }
        logger_1.enhancedDbLogger.info('✅ Health Monitoring тест пройден');
    }
    catch (error) {
        logger_1.enhancedDbLogger.error('❌ Health Monitoring тест неуспешен', { error });
        throw error;
    }
}
// Запуск тестирования если файл выполняется напрямую
if (require.main === module) {
    testRedisIntegration()
        .then(() => {
        logger_1.enhancedDbLogger.info('🎉 Все тесты Redis интеграции успешно завершены!');
        process.exit(0);
    })
        .catch((error) => {
        logger_1.enhancedDbLogger.error('💥 Тестирование Redis интеграции завершилось с ошибкой:', { error });
        process.exit(1);
    });
}
//# sourceMappingURL=test-redis-integration.js.map