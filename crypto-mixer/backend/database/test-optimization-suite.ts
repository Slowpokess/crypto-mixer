/**
 * Тестирование комплексной системы оптимизации базы данных
 * 
 * Проверяет все компоненты:
 * - Connection Pool Management
 * - Query Optimization  
 * - Data Recovery & Integrity
 * - Performance Monitoring
 */

import DatabaseOptimizationSuite from './utils/DatabaseOptimizationSuite';
import { enhancedDbLogger } from './logger';

/**
 * Комплексное тестирование системы оптимизации
 */
async function testDatabaseOptimizations(): Promise<void> {
  let optimizationSuite: DatabaseOptimizationSuite | null = null;

  try {
    enhancedDbLogger.info('🧪 Начинаем тестирование DatabaseOptimizationSuite');

    // Инициализация системы оптимизации
    const databaseUrl = process.env.DATABASE_URL || 'postgresql://mixer:mixer_password@localhost:5432/crypto_mixer';
    
    optimizationSuite = new DatabaseOptimizationSuite(databaseUrl, {
      connectionPool: {
        minConnections: 3,
        maxConnections: 10,
        adaptivePooling: true,
        warmupConnections: true
      },
      recovery: {
        enableIntegrityChecks: true,
        enableAutoRecovery: true,
        enableContinuousMonitoring: true
      },
      enablePerformanceMonitoring: true,
      enableAutomatedMaintenance: false, // Отключаем для тестов
      enableAlerting: true
    });

    // Ждем инициализации
    await new Promise((resolve) => {
      optimizationSuite!.once('initialized', resolve);
    });

    enhancedDbLogger.info('✅ DatabaseOptimizationSuite инициализирован');

    // 1. Тестируем health check
    await testHealthCheck(optimizationSuite);

    // 2. Тестируем оптимизированные репозитории
    await testOptimizedRepositories(optimizationSuite);

    // 3. Тестируем connection pooling
    await testConnectionPooling(optimizationSuite);

    // 4. Тестируем query optimization
    await testQueryOptimization(optimizationSuite);

    // 5. Тестируем data integrity
    await testDataIntegrity(optimizationSuite);

    // 6. Тестируем performance monitoring
    await testPerformanceMonitoring(optimizationSuite);

    // 7. Нагрузочное тестирование
    await testLoadPerformance(optimizationSuite);

    enhancedDbLogger.info('🎉 Все тесты оптимизации успешно пройдены!');

  } catch (error) {
    enhancedDbLogger.error('❌ Ошибка тестирования оптимизаций', { error });
    throw error;
  } finally {
    // Graceful shutdown
    if (optimizationSuite) {
      await optimizationSuite.shutdown();
    }
  }
}

/**
 * Тестирование health check системы
 */
async function testHealthCheck(suite: DatabaseOptimizationSuite): Promise<void> {
  enhancedDbLogger.info('🏥 Тестируем health check...');

  const healthStatus = await suite.performHealthCheck();
  
  enhancedDbLogger.info('Health check результат:', {
    overall: healthStatus.overall,
    components: healthStatus.components,
    lastCheck: healthStatus.lastCheck
  });

  if (healthStatus.overall === 'CRITICAL') {
    throw new Error('Система в критическом состоянии!');
  }

  enhancedDbLogger.info('✅ Health check тест пройден');
}

/**
 * Тестирование оптимизированных репозиториев
 */
async function testOptimizedRepositories(suite: DatabaseOptimizationSuite): Promise<void> {
  enhancedDbLogger.info('📊 Тестируем оптимизированные репозитории...');

  try {
    const { MixRequestRepository, WalletRepository } = suite.getOptimizedRepositories();

    // Тестируем MixRequestRepository
    const startTime = Date.now();
    const mixStats = await MixRequestRepository.getStatistics();
    const mixStatsTime = Date.now() - startTime;

    enhancedDbLogger.info('MixRequest статистика получена за', {
      time: mixStatsTime + 'ms',
      stats: {
        total: mixStats.total,
        successRate: mixStats.successRate
      }
    });

    // Тестируем WalletRepository
    const walletStartTime = Date.now();
    const walletStats = await WalletRepository.getStatistics();
    const walletStatsTime = Date.now() - walletStartTime;

    enhancedDbLogger.info('Wallet статистика получена за', {
      time: walletStatsTime + 'ms',
      stats: {
        total: walletStats.total,
        activeWallets: walletStats.activeWallets
      }
    });

    // Проверяем, что запросы выполняются быстро (благодаря оптимизации)
    if (mixStatsTime > 5000 || walletStatsTime > 5000) {
      enhancedDbLogger.warn('⚠️ Медленные запросы обнаружены', {
        mixStatsTime,
        walletStatsTime
      });
    }

    enhancedDbLogger.info('✅ Тест оптимизированных репозиториев пройден');

  } catch (error) {
    enhancedDbLogger.error('❌ Ошибка тестирования репозиториев', { error });
    throw error;
  }
}

/**
 * Тестирование connection pooling
 */
async function testConnectionPooling(suite: DatabaseOptimizationSuite): Promise<void> {
  enhancedDbLogger.info('🏊‍♂️ Тестируем connection pooling...');

  try {
    // Получаем пулы для разных типов операций
    const readPool = suite.getSequelize(true);
    const writePool = suite.getSequelize(false);

    // Тестируем параллельные запросы
    const queries = [];
    for (let i = 0; i < 5; i++) {
      queries.push(readPool.query('SELECT 1 as test'));
      queries.push(writePool.query('SELECT 2 as test'));
    }

    const startTime = Date.now();
    await Promise.all(queries);
    const executionTime = Date.now() - startTime;

    enhancedDbLogger.info('Параллельные запросы выполнены за', {
      time: executionTime + 'ms',
      queriesCount: queries.length
    });

    enhancedDbLogger.info('✅ Тест connection pooling пройден');

  } catch (error) {
    enhancedDbLogger.error('❌ Ошибка тестирования connection pooling', { error });
    throw error;
  }
}

/**
 * Тестирование query optimization
 */
async function testQueryOptimization(suite: DatabaseOptimizationSuite): Promise<void> {
  enhancedDbLogger.info('⚡ Тестируем query optimization...');

  try {
    const queryBuilder = suite.getQueryBuilder();

    // Тестируем кэширование
    const cacheKey = 'test_cache_query';
    
    // Первый запрос (без кэша)
    const startTime1 = Date.now();
    await queryBuilder.getMixRequestStatistics();
    const time1 = Date.now() - startTime1;

    // Второй запрос (с кэшем)
    const startTime2 = Date.now();
    await queryBuilder.getMixRequestStatistics();
    const time2 = Date.now() - startTime2;

    enhancedDbLogger.info('Тестирование кэширования:', {
      firstQuery: time1 + 'ms',
      secondQuery: time2 + 'ms',
      improvement: time1 > time2 ? `${Math.round((1 - time2/time1) * 100)}%` : 'no improvement'
    });

    // Тестируем статистику кэша
    const cacheStats = queryBuilder.getCacheStats();
    enhancedDbLogger.info('Cache статистика:', cacheStats);

    enhancedDbLogger.info('✅ Тест query optimization пройден');

  } catch (error) {
    enhancedDbLogger.error('❌ Ошибка тестирования query optimization', { error });
    throw error;
  }
}

/**
 * Тестирование data integrity
 */
async function testDataIntegrity(suite: DatabaseOptimizationSuite): Promise<void> {
  enhancedDbLogger.info('🛡️ Тестируем data integrity...');

  try {
    const recoveryManager = suite.getRecoveryManager();

    // Запускаем проверку целостности
    const startTime = Date.now();
    const integrityReport = await recoveryManager.performIntegrityCheck();
    const checkTime = Date.now() - startTime;

    enhancedDbLogger.info('Integrity check завершен за', {
      time: checkTime + 'ms',
      report: {
        totalChecks: integrityReport.totalChecks,
        passedChecks: integrityReport.passedChecks,
        failedChecks: integrityReport.failedChecks,
        issuesCount: integrityReport.issues.length,
        criticalIssues: integrityReport.issues.filter(i => i.severity === 'CRITICAL').length
      }
    });

    // Проверяем рекомендации
    if (integrityReport.recommendedActions.length > 0) {
      enhancedDbLogger.info('Рекомендации по улучшению:', {
        recommendations: integrityReport.recommendedActions
      });
    }

    enhancedDbLogger.info('✅ Тест data integrity пройден');

  } catch (error) {
    enhancedDbLogger.error('❌ Ошибка тестирования data integrity', { error });
    throw error;
  }
}

/**
 * Тестирование performance monitoring
 */
async function testPerformanceMonitoring(suite: DatabaseOptimizationSuite): Promise<void> {
  enhancedDbLogger.info('📈 Тестируем performance monitoring...');

  try {
    // Запускаем анализ производительности
    const perfAnalysis = await suite.triggerPerformanceAnalysis();

    enhancedDbLogger.info('Performance analysis результат:', {
      poolStats: {
        totalConnections: perfAnalysis.poolStats.totalConnections,
        activeConnections: perfAnalysis.poolStats.activeConnections,
        poolUtilization: perfAnalysis.poolStats.poolUtilization + '%',
        averageAcquireTime: perfAnalysis.poolStats.averageAcquireTime + 'ms'
      },
      databaseStats: {
        avgQueryTime: perfAnalysis.databaseStats.avgQueryTime + 'ms',
        slowQueries: perfAnalysis.databaseStats.slowQueries,
        totalQueries: perfAnalysis.databaseStats.totalQueries,
        cacheHitRate: perfAnalysis.databaseStats.cacheHitRate + '%'
      },
      cacheStats: perfAnalysis.cacheStats
    });

    enhancedDbLogger.info('✅ Тест performance monitoring пройден');

  } catch (error) {
    enhancedDbLogger.error('❌ Ошибка тестирования performance monitoring', { error });
    throw error;
  }
}

/**
 * Нагрузочное тестирование
 */
async function testLoadPerformance(suite: DatabaseOptimizationSuite): Promise<void> {
  enhancedDbLogger.info('🚀 Тестируем производительность под нагрузкой...');

  try {
    const { MixRequestRepository, WalletRepository } = suite.getOptimizedRepositories();

    // Создаем много параллельных запросов
    const concurrentRequests = 50;
    const requests = [];

    const startTime = Date.now();

    for (let i = 0; i < concurrentRequests; i++) {
      // Чередуем разные типы запросов
      if (i % 3 === 0) {
        requests.push(MixRequestRepository.getStatistics());
      } else if (i % 3 === 1) {
        requests.push(WalletRepository.getStatistics());
      } else {
        requests.push(suite.getSequelize(true).query('SELECT COUNT(*) as count FROM mix_requests'));
      }
    }

    const results = await Promise.allSettled(requests);
    const endTime = Date.now();

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    const totalTime = endTime - startTime;
    const avgTime = totalTime / concurrentRequests;

    enhancedDbLogger.info('Нагрузочное тестирование завершено:', {
      concurrentRequests,
      successful,
      failed,
      totalTime: totalTime + 'ms',
      avgTimePerRequest: avgTime.toFixed(2) + 'ms',
      requestsPerSecond: Math.round(concurrentRequests / (totalTime / 1000))
    });

    // Проверяем, что большинство запросов прошло успешно
    if (failed > concurrentRequests * 0.1) { // Более 10% неудач
      throw new Error(`Слишком много неудачных запросов: ${failed}/${concurrentRequests}`);
    }

    // Проверяем разумное время ответа
    if (avgTime > 1000) { // Более 1 секунды в среднем
      enhancedDbLogger.warn('⚠️ Медленное время ответа под нагрузкой', { avgTime });
    }

    enhancedDbLogger.info('✅ Нагрузочное тестирование пройдено');

  } catch (error) {
    enhancedDbLogger.error('❌ Ошибка нагрузочного тестирования', { error });
    throw error;
  }
}

// Запуск тестирования если файл выполняется напрямую
if (require.main === module) {
  testDatabaseOptimizations()
    .then(() => {
      enhancedDbLogger.info('🎉 Все тесты успешно завершены!');
      process.exit(0);
    })
    .catch((error) => {
      enhancedDbLogger.error('💥 Тестирование завершилось с ошибкой:', { error });
      process.exit(1);
    });
}

export { testDatabaseOptimizations };