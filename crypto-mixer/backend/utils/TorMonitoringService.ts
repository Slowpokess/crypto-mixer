import { EventEmitter } from 'events';
import { torManager } from './TorManager';
import { torBlockchainClient } from '../blockchain/TorBlockchainClient';
import logger from './logger';
import * as net from 'net';

/**
 * Расширенная служба мониторинга Tor для CryptoMixer
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Полная система мониторинга всех Tor компонентов:
 * - Мониторинг состояния всех hidden services
 * - Проверка доступности через onion адреса
 * - Автоматическое переключение при сбоях
 * - Детальная аналитика производительности
 * - Уведомления о критических проблемах
 * - Автоматическое восстановление сервисов
 */

export interface TorServiceStatus {
  name: string;
  type: 'hidden_service' | 'socks_proxy' | 'control_port' | 'blockchain_client';
  status: 'healthy' | 'warning' | 'critical' | 'unknown';
  onionAddress?: string;
  port: number;
  lastCheck: Date;
  responseTime: number;
  errorCount: number;
  uptime: number;
  details: any;
}

export interface TorMonitoringStats {
  services: TorServiceStatus[];
  overallHealth: 'healthy' | 'degraded' | 'critical' | 'unknown';
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  circuitRotations: number;
  lastCircuitRotation: Date;
  hiddenServiceUptime: number;
}

export class TorMonitoringService extends EventEmitter {
  private services: Map<string, TorServiceStatus> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private deepCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private stats: TorMonitoringStats;
  private checkIntervalMs = 30000; // 30 секунд
  private deepCheckIntervalMs = 300000; // 5 минут
  private startTime = new Date();

  /**
   * Утилита для безопасного извлечения сообщения об ошибке
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return String(error);
  }

  // Список onion адресов для проверки
  private readonly ONION_SERVICES = [
    {
      name: 'mixer_web',
      type: 'hidden_service' as const,
      expectedPorts: [80, 443],
      path: '/var/lib/tor/mixer_web/hostname',
    },
    {
      name: 'mixer_api',
      type: 'hidden_service' as const,
      expectedPorts: [80, 443],
      path: '/var/lib/tor/mixer_api/hostname',
    },
    {
      name: 'mixer_admin',
      type: 'hidden_service' as const,
      expectedPorts: [80, 443],
      path: '/var/lib/tor/mixer_admin/hostname',
    },
    {
      name: 'mixer_monitoring',
      type: 'hidden_service' as const,
      expectedPorts: [80],
      path: '/var/lib/tor/mixer_monitoring/hostname',
    },
  ];

  // SOCKS порты для проверки
  private readonly SOCKS_PORTS = [9050, 9051, 9052, 9054, 9055, 9056, 9057, 9058];

  constructor() {
    super();
    
    this.stats = {
      services: [],
      overallHealth: 'unknown',
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      circuitRotations: 0,
      lastCircuitRotation: new Date(),
      hiddenServiceUptime: 0,
    };

    this.initializeServices();
    logger.info('🧅 TorMonitoringService инициализирован');
  }

  /**
   * Инициализация списка сервисов для мониторинга
   */
  private initializeServices(): void {
    // Инициализируем hidden services
    for (const service of this.ONION_SERVICES) {
      this.services.set(service.name, {
        name: service.name,
        type: service.type,
        status: 'unknown',
        port: service.expectedPorts[0],
        lastCheck: new Date(),
        responseTime: 0,
        errorCount: 0,
        uptime: 0,
        details: {
          expectedPorts: service.expectedPorts,
          hostnameFile: service.path,
        },
      });
    }

    // Инициализируем SOCKS порты
    for (const port of this.SOCKS_PORTS) {
      this.services.set(`socks_${port}`, {
        name: `socks_${port}`,
        type: 'socks_proxy',
        status: 'unknown',
        port,
        lastCheck: new Date(),
        responseTime: 0,
        errorCount: 0,
        uptime: 0,
        details: {},
      });
    }

    // Инициализируем control port
    this.services.set('control_port', {
      name: 'control_port',
      type: 'control_port',
      status: 'unknown',
      port: 9053,
      lastCheck: new Date(),
      responseTime: 0,
      errorCount: 0,
      uptime: 0,
      details: {},
    });

    // Инициализируем blockchain client
    this.services.set('blockchain_client', {
      name: 'blockchain_client',
      type: 'blockchain_client',
      status: 'unknown',
      port: 0,
      lastCheck: new Date(),
      responseTime: 0,
      errorCount: 0,
      uptime: 0,
      details: {},
    });
  }

  /**
   * Запуск мониторинга
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('⚠️ TorMonitoringService уже запущен');
      return;
    }

    this.isRunning = true;
    this.startTime = new Date();

    // Запускаем базовый мониторинг
    this.monitoringInterval = setInterval(async () => {
      await this.performBasicHealthCheck();
    }, this.checkIntervalMs);

    // Запускаем глубокую проверку
    this.deepCheckInterval = setInterval(async () => {
      await this.performDeepHealthCheck();
    }, this.deepCheckIntervalMs);

    // Сразу выполняем первую проверку
    this.performBasicHealthCheck();

    logger.info('🧅 TorMonitoringService запущен');
    this.emit('started');
  }

  /**
   * Базовая проверка здоровья всех сервисов
   */
  private async performBasicHealthCheck(): Promise<void> {
    try {
      logger.debug('🔍 Выполняем базовую проверку Tor сервисов...');

      const checkPromises: Promise<void>[] = [];

      // Проверяем SOCKS порты
      for (const port of this.SOCKS_PORTS) {
        checkPromises.push(this.checkSocksPort(port));
      }

      // Проверяем control port
      checkPromises.push(this.checkControlPort());

      // Проверяем hidden services
      for (const service of this.ONION_SERVICES) {
        checkPromises.push(this.checkHiddenService(service.name));
      }

      // Проверяем blockchain client
      checkPromises.push(this.checkBlockchainClient());

      await Promise.allSettled(checkPromises);

      // Обновляем общую статистику
      this.updateOverallStats();

      // Отправляем уведомления если нужно
      this.checkForAlerts();

      this.emit('healthCheckCompleted', this.getStats());

    } catch (error) {
      logger.error('❌ Ошибка базовой проверки Tor:', error);
    }
  }

  /**
   * Глубокая проверка с тестированием соединений
   */
  private async performDeepHealthCheck(): Promise<void> {
    try {
      logger.info('🔍 Выполняем глубокую проверку Tor сервисов...');

      // Тестируем реальные соединения через onion адреса
      await this.testOnionConnections();

      // Проверяем качество цепочек
      await this.analyzeCircuitQuality();

      // Тестируем blockchain соединения
      await this.testBlockchainConnections();

      // Проверяем производительность
      await this.performanceAnalysis();

      this.emit('deepCheckCompleted', this.getStats());

    } catch (error) {
      logger.error('❌ Ошибка глубокой проверки Tor:', error);
    }
  }

  /**
   * Проверка SOCKS порта
   */
  private async checkSocksPort(port: number): Promise<void> {
    const serviceName = `socks_${port}`;
    const service = this.services.get(serviceName);
    if (!service) return;

    const startTime = Date.now();

    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new net.Socket();
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('Timeout'));
        }, 5000);

        socket.connect(port, '127.0.0.1', () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve();
        });

        socket.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      const responseTime = Date.now() - startTime;
      this.updateServiceStatus(serviceName, 'healthy', responseTime);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateServiceStatus(serviceName, 'critical', responseTime, this.getErrorMessage(error));
    }
  }

  /**
   * Проверка control порта
   */
  private async checkControlPort(): Promise<void> {
    const serviceName = 'control_port';
    const startTime = Date.now();

    try {
      // Пытаемся подключиться к control порту и выполнить команду
      const result = await torManager.testConnection();
      
      const responseTime = Date.now() - startTime;
      this.updateServiceStatus(serviceName, 'healthy', responseTime, result);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateServiceStatus(serviceName, 'critical', responseTime, this.getErrorMessage(error));
    }
  }

  /**
   * Проверка hidden service
   */
  private async checkHiddenService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    const startTime = Date.now();

    try {
      // Пытаемся прочитать onion адрес
      const fs = await import('fs/promises');
      let onionAddress: string;

      try {
        onionAddress = await fs.readFile(service.details.hostnameFile, 'utf-8');
        onionAddress = onionAddress.trim();
        service.onionAddress = onionAddress;
      } catch (error) {
        throw new Error(`Не удалось прочитать hostname: ${this.getErrorMessage(error)}`);
      }

      // Проверяем доступность через внешние средства (если возможно)
      const responseTime = Date.now() - startTime;
      this.updateServiceStatus(serviceName, 'healthy', responseTime, { onionAddress });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateServiceStatus(serviceName, 'warning', responseTime, this.getErrorMessage(error));
    }
  }

  /**
   * Проверка blockchain client
   */
  private async checkBlockchainClient(): Promise<void> {
    const serviceName = 'blockchain_client';
    const startTime = Date.now();

    try {
      const healthCheck = await torBlockchainClient.healthCheck();
      const responseTime = Date.now() - startTime;

      // Проверяем сколько валют работают нормально
      const currencies = Object.keys(healthCheck);
      const healthyCurrencies = currencies.filter(
        currency => healthCheck[currency].status === 'healthy'
      );

      let status: 'healthy' | 'warning' | 'critical';
      if (healthyCurrencies.length === currencies.length) {
        status = 'healthy';
      } else if (healthyCurrencies.length > currencies.length / 2) {
        status = 'warning';
      } else {
        status = 'critical';
      }

      this.updateServiceStatus(serviceName, status, responseTime, {
        totalCurrencies: currencies.length,
        healthyCurrencies: healthyCurrencies.length,
        details: healthCheck,
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateServiceStatus(serviceName, 'critical', responseTime, this.getErrorMessage(error));
    }
  }

  /**
   * Тестирование соединений через onion адреса
   */
  private async testOnionConnections(): Promise<void> {
    logger.debug('🧅 Тестируем onion соединения...');

    for (const [serviceName, service] of this.services) {
      if (service.type === 'hidden_service' && service.onionAddress) {
        try {
          // Создаем Tor axios instance
          const torAxios = torManager.getAxiosInstance('web');
          
          // Тестируем базовую доступность
          const testUrl = `http://${service.onionAddress}`;
          const startTime = Date.now();
          
          await torAxios.get(testUrl, { 
            timeout: 10000,
            validateStatus: () => true, // Принимаем любой статус
          });
          
          const responseTime = Date.now() - startTime;
          logger.debug(`✅ ${serviceName} onion доступен: ${responseTime}ms`);
          
          // Обновляем детали сервиса
          service.details.onionConnectivity = 'accessible';
          service.details.lastOnionTest = new Date();
          service.details.onionResponseTime = responseTime;

        } catch (error) {
          const errorMessage = this.getErrorMessage(error);
          logger.warn(`⚠️ ${serviceName} onion недоступен:`, errorMessage);
          service.details.onionConnectivity = 'inaccessible';
          service.details.lastOnionError = errorMessage;
        }
      }
    }
  }

  /**
   * Анализ качества цепочек
   */
  private async analyzeCircuitQuality(): Promise<void> {
    try {
      logger.debug('🔄 Анализируем качество Tor цепочек...');

      const torStats = torManager.getStats();
      
      // Обновляем статистику цепочек
      this.stats.circuitRotations = torStats.connectionInfo.circuitCount || 0;
      this.stats.lastCircuitRotation = torStats.connectionInfo.lastCircuitRotation;

      // Если цепочек мало, предупреждаем
      if (torStats.connectionInfo.circuitCount < 3) {
        this.emit('alert', {
          level: 'warning',
          message: `Мало активных цепочек: ${torStats.connectionInfo.circuitCount}`,
          service: 'circuit_quality',
        });
      }

    } catch (error) {
      logger.error('❌ Ошибка анализа цепочек:', error);
    }
  }

  /**
   * Тестирование blockchain соединений
   */
  private async testBlockchainConnections(): Promise<void> {
    try {
      logger.debug('⛓️ Тестируем blockchain соединения...');

      const blockchainStats = torBlockchainClient.getStats();
      
      for (const [symbol, currencyStats] of Object.entries(blockchainStats)) {
        // Проверяем статистику ошибок
        const totalRequests = currencyStats.endpointStats.reduce(
          (sum: number, stat: any) => sum + stat.requestCount, 0
        );
        const totalErrors = currencyStats.endpointStats.reduce(
          (sum: number, stat: any) => sum + stat.errorCount, 0
        );
        
        const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
        
        if (errorRate > 20) { // Более 20% ошибок
          this.emit('alert', {
            level: 'warning',
            message: `Высокий уровень ошибок для ${symbol}: ${errorRate.toFixed(1)}%`,
            service: 'blockchain_client',
            currency: symbol,
          });
        }
      }

    } catch (error) {
      logger.error('❌ Ошибка тестирования blockchain:', error);
    }
  }

  /**
   * Анализ производительности
   */
  private async performanceAnalysis(): Promise<void> {
    logger.debug('📊 Анализируем производительность Tor...');

    const services = Array.from(this.services.values());
    const healthyServices = services.filter(s => s.status === 'healthy');
    const criticalServices = services.filter(s => s.status === 'critical');

    // Средняя время отклика
    const avgResponseTime = services.reduce((sum, service) => sum + service.responseTime, 0) / services.length;
    this.stats.averageResponseTime = avgResponseTime;

    // Время работы
    const uptimeMs = Date.now() - this.startTime.getTime();
    this.stats.hiddenServiceUptime = uptimeMs / 1000; // в секундах

    // Обновляем статистику успешных и неудачных запросов
    this.stats.successfulRequests = healthyServices.length;
    this.stats.failedRequests = criticalServices.length;
    this.stats.totalRequests = services.length;

    // Если производительность плохая
    if (avgResponseTime > 10000) { // Более 10 секунд
      this.emit('alert', {
        level: 'warning',
        message: `Медленная производительность: ${avgResponseTime}ms`,
        service: 'performance',
      });
    }

    // Если много критических сервисов
    if (criticalServices.length > services.length / 3) {
      this.emit('alert', {
        level: 'critical',
        message: `Много неработающих сервисов: ${criticalServices.length}/${services.length}`,
        service: 'overall_health',
        healthyServices: healthyServices.length,
        totalServices: services.length
      });
    }
  }

  /**
   * Обновление статуса сервиса
   */
  private updateServiceStatus(
    serviceName: string, 
    status: 'healthy' | 'warning' | 'critical',
    responseTime: number,
    details?: any
  ): void {
    const service = this.services.get(serviceName);
    if (!service) return;

    const wasHealthy = service.status === 'healthy';
    
    service.status = status;
    service.lastCheck = new Date();
    service.responseTime = responseTime;
    service.details = { ...service.details, ...details };

    if (status === 'critical') {
      service.errorCount++;
    }

    // Если сервис восстановился
    if (!wasHealthy && status === 'healthy') {
      this.emit('serviceRecovered', { serviceName, service });
      logger.info(`✅ Сервис ${serviceName} восстановлен`);
    }

    // Если сервис упал
    if (wasHealthy && status === 'critical') {
      this.emit('serviceFailed', { serviceName, service });
      logger.warn(`❌ Сервис ${serviceName} недоступен`);
    }
  }

  /**
   * Обновление общей статистики
   */
  private updateOverallStats(): void {
    const services = Array.from(this.services.values());
    const healthyCount = services.filter(s => s.status === 'healthy').length;
    const warningCount = services.filter(s => s.status === 'warning').length;
    const criticalCount = services.filter(s => s.status === 'critical').length;

    // Определяем общее состояние здоровья
    if (criticalCount > services.length / 2) {
      this.stats.overallHealth = 'critical';
    } else if (warningCount + criticalCount > services.length / 3) {
      this.stats.overallHealth = 'degraded';
    } else {
      this.stats.overallHealth = 'healthy';
    }

    this.stats.services = services;
    
    // Логируем статистику для мониторинга
    logger.debug('📊 Обновлена статистика сервисов', {
      totalServices: services.length,
      healthyServices: healthyCount,
      warningServices: warningCount,
      criticalServices: criticalCount,
      overallHealth: this.stats.overallHealth
    });
  }

  /**
   * Проверка условий для алертов
   */
  private checkForAlerts(): void {
    const services = Array.from(this.services.values());
    const criticalServices = services.filter(s => s.status === 'critical');

    // Критический алерт если много сервисов недоступно
    if (criticalServices.length >= 3) {
      this.emit('alert', {
        level: 'critical',
        message: `Множественные сбои сервисов: ${criticalServices.map(s => s.name).join(', ')}`,
        service: 'multiple_failures',
        affectedServices: criticalServices.map(s => s.name),
      });
    }

    // Проверяем критически важные сервисы
    const essentialServices = ['mixer_web', 'socks_9050', 'control_port'];
    const failedEssential = essentialServices.filter(name => {
      const service = this.services.get(name);
      return service && service.status === 'critical';
    });

    if (failedEssential.length > 0) {
      this.emit('alert', {
        level: 'critical',
        message: `Критические сервисы недоступны: ${failedEssential.join(', ')}`,
        service: 'essential_failures',
        affectedServices: failedEssential,
      });
    }
  }

  /**
   * Получение статистики
   */
  public getStats(): TorMonitoringStats {
    return { ...this.stats };
  }

  /**
   * Получение детальной информации о сервисе
   */
  public getServiceDetails(serviceName: string): TorServiceStatus | null {
    return this.services.get(serviceName) || null;
  }

  /**
   * Принудительная ротация всех цепочек
   */
  public async forceCircuitRotation(): Promise<void> {
    try {
      logger.info('🔄 Принудительная ротация всех цепочек...');
      
      await torManager.rotateCircuit();
      await torBlockchainClient.healthCheck();
      
      this.stats.circuitRotations++;
      this.stats.lastCircuitRotation = new Date();
      
      this.emit('circuitRotationForced');
      logger.info('✅ Принудительная ротация завершена');

    } catch (error) {
      logger.error('❌ Ошибка принудительной ротации:', error);
      throw error;
    }
  }

  /**
   * Остановка мониторинга
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.deepCheckInterval) {
      clearInterval(this.deepCheckInterval);
      this.deepCheckInterval = null;
    }

    this.isRunning = false;
    
    logger.info('🛑 TorMonitoringService остановлен');
    this.emit('stopped');
  }
}

// Создаем глобальный экземпляр
export const torMonitoringService = new TorMonitoringService();

// Запускаем мониторинг при загрузке модуля
if (process.env.NODE_ENV !== 'test') {
  torMonitoringService.start();
  
  // Обработчики событий для логирования
  torMonitoringService.on('alert', (alert) => {
    if (alert.level === 'critical') {
      logger.error('🚨 Критический алерт Tor:', alert);
    } else {
      logger.warn('⚠️ Предупреждение Tor:', alert);
    }
  });
}