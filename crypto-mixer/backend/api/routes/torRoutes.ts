import express from 'express';
import { torManager } from '../../utils/TorManager';
import { torMonitoringService } from '../../utils/TorMonitoringService';
import { connectionFailoverManager } from '../../utils/ConnectionFailoverManager';
import { torBlockchainClient } from '../../blockchain/TorBlockchainClient';
import { logger } from '../../utils/logger';

/**
 * API маршруты для управления и мониторинга Tor
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Полный API для Tor функциональности:
 * - Получение статуса всех Tor сервисов
 * - Принудительная ротация цепочек
 * - Переключение типов соединений
 * - Детальная статистика производительности
 * - Управление failover стратегиями
 */

const router = express.Router();

/**
 * GET /api/tor/status
 * Получение общего статуса Tor
 */
router.get('/status', async (req, res) => {
  try {
    logger.debug('📊 Запрос статуса Tor');

    // Получаем статистику от всех компонентов
    const torStats = torManager.getStats();
    const monitoringStats = torMonitoringService.getStats();
    const failoverStats = connectionFailoverManager.getStats();
    const blockchainStats = torBlockchainClient.getStats();

    // Формируем ответ
    const status = {
      // Основная информация
      isConnected: torStats.isInitialized && torStats.connectionInfo.isConnected,
      connectionType: failoverStats.currentStrategy,
      
      // Информация о цепочках
      circuitCount: torStats.connectionInfo.circuitCount,
      lastCircuitRotation: torStats.connectionInfo.lastCircuitRotation,
      
      // Hidden service информация
      onionAddress: torStats.connectionInfo.onionAddress,
      
      // Производительность
      averageResponseTime: Math.round(
        (failoverStats.averageResponseTime.tor + failoverStats.averageResponseTime.direct) / 2
      ),
      
      // Общее здоровье
      overallHealth: monitoringStats.overallHealth,
      healthyServices: monitoringStats.services.filter(s => s.status === 'healthy').length,
      totalServices: monitoringStats.services.length,
      
      // Статистика запросов
      requestStats: {
        total: failoverStats.totalAttempts,
        torAttempts: failoverStats.torAttempts,
        directAttempts: failoverStats.directAttempts,
        torSuccessRate: Math.round(failoverStats.torSuccessRate),
        directSuccessRate: Math.round(failoverStats.directSuccessRate),
      },
      
      // Ошибки
      errors: torStats.connectionInfo.errors.slice(-3), // Последние 3 ошибки
      
      // Временные метки
      lastUpdate: new Date().toISOString(),
      uptime: monitoringStats.hiddenServiceUptime,
      
      // Детали по сервисам
      services: monitoringStats.services.map(service => ({
        name: service.name,
        type: service.type,
        status: service.status,
        responseTime: service.responseTime,
        lastCheck: service.lastCheck,
      })),
      
      // Blockchain статус
      blockchainHealth: Object.keys(blockchainStats).reduce((acc, symbol) => {
        const currencyStats = blockchainStats[symbol];
        const healthyEndpoints = currencyStats.endpoints.filter(ep => ep.errorCount < 5).length;
        acc[symbol] = {
          healthyEndpoints,
          totalEndpoints: currencyStats.endpoints.length,
          isHealthy: healthyEndpoints > 0,
        };
        return acc;
      }, {}),
    };

    res.json(status);

  } catch (error) {
    logger.error('❌ Ошибка получения статуса Tor:', error);
    res.status(500).json({
      error: 'Failed to get Tor status',
      message: error.message,
    });
  }
});

/**
 * GET /api/tor/detailed
 * Получение детального статуса всех компонентов
 */
router.get('/detailed', async (req, res) => {
  try {
    logger.debug('📊 Запрос детального статуса Tor');

    const response = {
      torManager: torManager.getStats(),
      monitoring: torMonitoringService.getStats(),
      failover: {
        ...connectionFailoverManager.getStats(),
        currentConnections: Object.fromEntries(connectionFailoverManager.getCurrentConnections()),
        recentAttempts: connectionFailoverManager.getAttemptHistory(20),
      },
      blockchain: torBlockchainClient.getStats(),
      timestamp: new Date().toISOString(),
    };

    res.json(response);

  } catch (error) {
    logger.error('❌ Ошибка получения детального статуса:', error);
    res.status(500).json({
      error: 'Failed to get detailed status',
      message: error.message,
    });
  }
});

/**
 * POST /api/tor/rotate
 * Принудительная ротация Tor цепочек
 */
router.post('/rotate', async (req, res) => {
  try {
    logger.info('🔄 Запрос принудительной ротации цепочек');

    // Ротируем цепочки в TorManager
    await torManager.rotateCircuit();
    
    // Принудительная ротация в мониторинге
    await torMonitoringService.forceCircuitRotation();
    
    res.json({
      success: true,
      message: 'Circuit rotation initiated',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('❌ Ошибка ротации цепочек:', error);
    res.status(500).json({
      error: 'Failed to rotate circuits',
      message: error.message,
    });
  }
});

/**
 * POST /api/tor/connection/:type
 * Принудительное переключение типа соединения
 */
router.post('/connection/:requestType/:connectionType', async (req, res) => {
  try {
    const { requestType, connectionType } = req.params;
    
    logger.info(`🔧 Принудительное переключение ${requestType} на ${connectionType}`);

    if (!['tor', 'direct'].includes(connectionType)) {
      return res.status(400).json({
        error: 'Invalid connection type',
        message: 'Connection type must be "tor" or "direct"',
      });
    }

    connectionFailoverManager.forceConnectionType(requestType, connectionType as 'tor' | 'direct');

    res.json({
      success: true,
      message: `Connection type changed to ${connectionType} for ${requestType}`,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('❌ Ошибка переключения соединения:', error);
    res.status(500).json({
      error: 'Failed to change connection type',
      message: error.message,
    });
  }
});

/**
 * GET /api/tor/health
 * Проверка здоровья всех Tor компонентов
 */
router.get('/health', async (req, res) => {
  try {
    logger.debug('🔍 Проверка здоровья Tor компонентов');

    // Выполняем health check для blockchain клиентов
    const blockchainHealth = await torBlockchainClient.healthCheck();
    
    // Получаем статистику мониторинга
    const monitoringStats = torMonitoringService.getStats();
    
    // Тестируем Tor соединение
    let torConnectionTest = null;
    try {
      torConnectionTest = await torManager.testConnection();
    } catch (error) {
      torConnectionTest = { error: error.message };
    }

    const healthReport = {
      overall: monitoringStats.overallHealth,
      components: {
        torManager: {
          status: torManager.getStats().isInitialized ? 'healthy' : 'unhealthy',
          details: torManager.getStats(),
        },
        monitoring: {
          status: monitoringStats.overallHealth,
          services: monitoringStats.services.length,
          healthyServices: monitoringStats.services.filter(s => s.status === 'healthy').length,
        },
        blockchain: {
          status: Object.values(blockchainHealth).every(h => h.status === 'healthy') ? 'healthy' : 'degraded',
          details: blockchainHealth,
        },
        connectionTest: {
          status: torConnectionTest.error ? 'failed' : 'passed',
          details: torConnectionTest,
        },
      },
      timestamp: new Date().toISOString(),
    };

    // Устанавливаем соответствующий HTTP статус
    const httpStatus = healthReport.overall === 'critical' ? 503 : 
                       healthReport.overall === 'degraded' ? 207 : 200;

    res.status(httpStatus).json(healthReport);

  } catch (error) {
    logger.error('❌ Ошибка проверки здоровья:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/tor/metrics
 * Получение метрик производительности
 */
router.get('/metrics', async (req, res) => {
  try {
    const { timeframe = '1h' } = req.query;
    
    logger.debug(`📈 Запрос метрик Tor за ${timeframe}`);

    const failoverStats = connectionFailoverManager.getStats();
    const monitoringStats = torMonitoringService.getStats();
    
    // Получаем историю попыток соединения
    const recentAttempts = connectionFailoverManager.getAttemptHistory(100);
    
    // Вычисляем метрики
    const now = Date.now();
    const timeframes = {
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
    };
    
    const timeframeMs = timeframes[timeframe] || timeframes['1h'];
    const cutoffTime = new Date(now - timeframeMs);
    
    const relevantAttempts = recentAttempts.filter(
      attempt => attempt.timestamp >= cutoffTime
    );

    const metrics = {
      timeframe,
      totalRequests: relevantAttempts.length,
      successfulRequests: relevantAttempts.filter(a => a.success).length,
      failedRequests: relevantAttempts.filter(a => !a.success).length,
      
      byStrategy: {
        tor: {
          requests: relevantAttempts.filter(a => a.strategy === 'tor').length,
          successful: relevantAttempts.filter(a => a.strategy === 'tor' && a.success).length,
          averageResponseTime: relevantAttempts
            .filter(a => a.strategy === 'tor')
            .reduce((sum, a) => sum + a.responseTime, 0) / 
            Math.max(relevantAttempts.filter(a => a.strategy === 'tor').length, 1),
        },
        direct: {
          requests: relevantAttempts.filter(a => a.strategy === 'direct').length,
          successful: relevantAttempts.filter(a => a.strategy === 'direct' && a.success).length,
          averageResponseTime: relevantAttempts
            .filter(a => a.strategy === 'direct')
            .reduce((sum, a) => sum + a.responseTime, 0) / 
            Math.max(relevantAttempts.filter(a => a.strategy === 'direct').length, 1),
        },
      },
      
      failovers: failoverStats.failoverCount,
      recoveries: failoverStats.recoveryCount,
      lastFailover: failoverStats.lastFailover,
      
      serviceHealth: monitoringStats.services.reduce((acc, service) => {
        acc[service.name] = {
          status: service.status,
          responseTime: service.responseTime,
          uptime: service.uptime,
          errorCount: service.errorCount,
        };
        return acc;
      }, {}),
      
      timestamp: new Date().toISOString(),
    };

    res.json(metrics);

  } catch (error) {
    logger.error('❌ Ошибка получения метрик:', error);
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error.message,
    });
  }
});

/**
 * POST /api/tor/emergency-failover
 * Экстренное переключение всех соединений на direct
 */
router.post('/emergency-failover', async (req, res) => {
  try {
    logger.warn('🚨 Экстренное переключение всех соединений на direct');

    // Принудительно переключаем все на direct
    const connectionTypes = ['web', 'api', 'blockchain', 'monitoring'];
    
    for (const type of connectionTypes) {
      try {
        connectionFailoverManager.forceConnectionType(type, 'direct');
      } catch (error) {
        logger.warn(`Не удалось переключить ${type}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: 'Emergency failover executed',
      affectedConnections: connectionTypes,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('❌ Ошибка экстренного переключения:', error);
    res.status(500).json({
      error: 'Emergency failover failed',
      message: error.message,
    });
  }
});

/**
 * GET /api/tor/onion-address
 * Получение onion адреса сервиса
 */
router.get('/onion-address', async (req, res) => {
  try {
    logger.debug('🧅 Запрос onion адреса');

    const torStats = torManager.getStats();
    const monitoringStats = torMonitoringService.getStats();
    
    // Собираем все onion адреса
    const onionAddresses = {
      web: null,
      api: null,
      admin: null,
      monitoring: null,
    };

    // Извлекаем onion адреса из статистики мониторинга
    for (const service of monitoringStats.services) {
      if (service.type === 'hidden_service' && service.onionAddress) {
        const serviceName = service.name.replace('mixer_', '');
        onionAddresses[serviceName] = service.onionAddress;
      }
    }

    res.json({
      onionAddresses,
      primaryAddress: torStats.connectionInfo.onionAddress,
      isAvailable: Object.values(onionAddresses).some(addr => addr !== null),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('❌ Ошибка получения onion адреса:', error);
    res.status(500).json({
      error: 'Failed to get onion address',
      message: error.message,
    });
  }
});

export default router;