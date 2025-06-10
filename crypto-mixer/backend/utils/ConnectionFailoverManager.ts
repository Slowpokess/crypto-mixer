import { EventEmitter } from 'events';
import { AxiosInstance } from 'axios';
import { torManager } from './TorManager';
import { torBlockchainClient } from '../blockchain/TorBlockchainClient';
import { torMonitoringService } from './TorMonitoringService';
import { enhancedDbLogger } from './logger';
import axios from 'axios';

/**
 * Менеджер автоматического переключения между Tor и обычными соединениями
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Умная система переключения соединений:
 * - Автоматическое переключение при сбоях Tor
 * - Приоритет Tor соединений для анонимности
 * - Резервные схемы для каждого типа запросов
 * - Адаптивное управление нагрузкой
 * - Восстановление Tor при возобновлении работы
 * - Детальная аналитика переключений
 */

export interface ConnectionStrategy {
  primary: 'tor' | 'direct';
  fallback: 'tor' | 'direct' | 'none';
  timeout: number;
  retries: number;
  healthCheckInterval: number;
  autoRecovery: boolean;
}

export interface ConnectionAttempt {
  timestamp: Date;
  strategy: 'tor' | 'direct';
  success: boolean;
  responseTime: number;
  error?: string;
  endpoint: string;
}

export interface FailoverStats {
  totalAttempts: number;
  torAttempts: number;
  directAttempts: number;
  torSuccessRate: number;
  directSuccessRate: number;
  averageResponseTime: {
    tor: number;
    direct: number;
  };
  currentStrategy: 'tor' | 'direct';
  lastFailover: Date | null;
  failoverCount: number;
  recoveryCount: number;
}

export class ConnectionFailoverManager extends EventEmitter {
  private strategies: Map<string, ConnectionStrategy> = new Map();
  private attempts: ConnectionAttempt[] = [];
  private stats: FailoverStats;
  private currentConnections: Map<string, 'tor' | 'direct'> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private maxAttemptsHistory = 1000; // Максимум записей в истории

  // Предустановленные стратегии для разных типов запросов
  private readonly DEFAULT_STRATEGIES = {
    web: {
      primary: 'tor' as const,
      fallback: 'direct' as const,
      timeout: 30000,
      retries: 3,
      healthCheckInterval: 60000, // 1 минута
      autoRecovery: true,
    },
    api: {
      primary: 'tor' as const,
      fallback: 'direct' as const,
      timeout: 15000,
      retries: 2,
      healthCheckInterval: 30000, // 30 секунд
      autoRecovery: true,
    },
    blockchain: {
      primary: 'tor' as const,
      fallback: 'direct' as const,
      timeout: 45000,
      retries: 3,
      healthCheckInterval: 120000, // 2 минуты
      autoRecovery: true,
    },
    admin: {
      primary: 'tor' as const,
      fallback: 'none' as const, // Админ панель только через Tor
      timeout: 20000,
      retries: 5,
      healthCheckInterval: 30000,
      autoRecovery: true,
    },
    monitoring: {
      primary: 'direct' as const, // Мониторинг может идти напрямую
      fallback: 'tor' as const,
      timeout: 10000,
      retries: 2,
      healthCheckInterval: 15000,
      autoRecovery: false,
    },
  };

  constructor() {
    super();

    this.stats = {
      totalAttempts: 0,
      torAttempts: 0,
      directAttempts: 0,
      torSuccessRate: 100,
      directSuccessRate: 100,
      averageResponseTime: { tor: 0, direct: 0 },
      currentStrategy: 'tor',
      lastFailover: null,
      failoverCount: 0,
      recoveryCount: 0,
    };

    this.initializeStrategies();
    this.setupEventListeners();
    this.startHealthChecking();

    enhancedDbLogger.info('🔄 ConnectionFailoverManager инициализирован');
  }

  /**
   * Инициализация стратегий соединений
   */
  private initializeStrategies(): void {
    for (const [type, strategy] of Object.entries(this.DEFAULT_STRATEGIES)) {
      this.strategies.set(type, strategy);
      this.currentConnections.set(type, strategy.primary);
    }

    enhancedDbLogger.info('✅ Стратегии соединений инициализированы:', 
      Object.keys(this.DEFAULT_STRATEGIES));
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(): void {
    // Слушаем события от Tor мониторинга
    torMonitoringService.on('serviceFailed', (event) => {
      this.handleTorServiceFailure(event);
    });

    torMonitoringService.on('serviceRecovered', (event) => {
      this.handleTorServiceRecovery(event);
    });

    torMonitoringService.on('alert', (alert) => {
      if (alert.level === 'critical') {
        this.handleCriticalTorAlert(alert);
      }
    });

    // Слушаем события от TorManager
    torManager.on('disconnected', () => {
      this.handleTorDisconnection();
    });

    torManager.on('connected', () => {
      this.handleTorReconnection();
    });
  }

  /**
   * Запуск периодической проверки здоровья соединений
   */
  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000); // Каждые 30 секунд

    enhancedDbLogger.info('🔍 Запущена периодическая проверка здоровья соединений');
  }

  /**
   * Получение оптимального axios instance с автоматическим переключением
   */
  public async getAxiosInstance(
    requestType: string = 'web',
    endpoint?: string
  ): Promise<{ instance: AxiosInstance; connectionType: 'tor' | 'direct' }> {
    const strategy = this.strategies.get(requestType) || this.strategies.get('web')!;
    const currentConnection = this.currentConnections.get(requestType) || strategy.primary;

    // Пытаемся использовать текущую стратегию
    try {
      const instance = await this.createAxiosInstance(currentConnection, requestType);
      
      // Проверяем работоспособность соединения
      if (endpoint) {
        await this.testConnection(instance, endpoint, currentConnection);
      }

      return { instance, connectionType: currentConnection };

    } catch (error) {
      // Правильная типизация error для безопасного доступа к message
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToPass = error instanceof Error ? error : new Error(String(error));
      
      enhancedDbLogger.warn(`⚠️ ${requestType} соединение через ${currentConnection} неудачно:`, { 
        error: errorMessage, 
        requestType, 
        currentConnection 
      });
      
      // Пытаемся переключиться на fallback
      return await this.attemptFailover(requestType, endpoint, errorToPass);
    }
  }

  /**
   * Создание axios instance для определенного типа соединения
   */
  private async createAxiosInstance(connectionType: 'tor' | 'direct', requestType: string): Promise<AxiosInstance> {
    const strategy = this.strategies.get(requestType)!;

    if (connectionType === 'tor') {
      // Проверяем доступность Tor
      const torStats = torManager.getStats();
      if (!torStats.isInitialized || !torStats.connectionInfo.isConnected) {
        throw new Error('Tor недоступен');
      }

      return torManager.getAxiosInstance(requestType as any);
    } else {
      // Создаем обычный axios instance
      return axios.create({
        timeout: strategy.timeout,
        headers: {
          'User-Agent': this.generateUserAgent(),
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    }
  }

  /**
   * Попытка переключения на резервную схему
   */
  private async attemptFailover(
    requestType: string,
    endpoint?: string,
    originalError?: Error
  ): Promise<{ instance: AxiosInstance; connectionType: 'tor' | 'direct' }> {
    const strategy = this.strategies.get(requestType)!;
    const currentConnection = this.currentConnections.get(requestType)!;
    
    if (strategy.fallback === 'none') {
      throw new Error(`Fallback недоступен для ${requestType}: ${originalError?.message}`);
    }

    const fallbackConnection = strategy.fallback;
    
    enhancedDbLogger.warn(`🔄 Переключаемся с ${currentConnection} на ${fallbackConnection} для ${requestType}`);

    try {
      const instance = await this.createAxiosInstance(fallbackConnection, requestType);
      
      // Тестируем fallback соединение
      if (endpoint) {
        await this.testConnection(instance, endpoint, fallbackConnection);
      }

      // Обновляем текущую стратегию
      this.currentConnections.set(requestType, fallbackConnection);
      this.stats.failoverCount++;
      this.stats.lastFailover = new Date();
      this.stats.currentStrategy = fallbackConnection;

      enhancedDbLogger.info(`✅ Успешно переключились на ${fallbackConnection} для ${requestType}`);
      this.emit('failover', {
        requestType,
        from: currentConnection,
        to: fallbackConnection,
        reason: originalError?.message,
      });

      return { instance, connectionType: fallbackConnection };

    } catch (fallbackError) {
      // Правильная типизация fallbackError
      const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      const fallbackErrorToThrow = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
      
      enhancedDbLogger.error(`❌ Fallback соединение также неудачно для ${requestType}:`, {
        error: fallbackErrorMessage,
        requestType,
        primaryError: originalError?.message
      });
      
      this.emit('failoverFailed', {
        requestType,
        primaryError: originalError?.message,
        fallbackError: fallbackErrorMessage,
        fullError: fallbackErrorToThrow
      });

      // Используем fallbackErrorToThrow для передачи полной информации об ошибке
      const consolidatedError = new Error(`Все соединения неудачны для ${requestType}: ${fallbackErrorMessage}`);
      // Добавляем информацию о причине ошибки в stack trace вместо использования cause (ES2022)
      if (fallbackErrorToThrow.stack) {
        consolidatedError.stack = `${consolidatedError.stack}\nCaused by: ${fallbackErrorToThrow.stack}`;
      }
      // Добавляем дополнительную информацию в message
      (consolidatedError as any).originalError = fallbackErrorToThrow;
      
      throw consolidatedError;
    }
  }

  /**
   * Тестирование соединения
   */
  private async testConnection(
    instance: AxiosInstance,
    endpoint: string,
    connectionType: 'tor' | 'direct'
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Простой GET запрос для проверки
      await instance.get(endpoint, {
        timeout: 5000,
        validateStatus: (status) => status < 500, // Принимаем 4xx как успех
      });

      const responseTime = Date.now() - startTime;
      this.recordAttempt(endpoint, connectionType, true, responseTime);

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordAttempt(endpoint, connectionType, false, responseTime, errorMessage);
      throw error;
    }
  }

  /**
   * Запись попытки соединения в статистику
   */
  private recordAttempt(
    endpoint: string,
    strategy: 'tor' | 'direct',
    success: boolean,
    responseTime: number,
    error?: string
  ): void {
    const attempt: ConnectionAttempt = {
      timestamp: new Date(),
      strategy,
      success,
      responseTime,
      error,
      endpoint,
    };

    this.attempts.push(attempt);
    
    // Ограничиваем размер истории
    if (this.attempts.length > this.maxAttemptsHistory) {
      this.attempts.shift();
    }

    // Обновляем статистику
    this.updateStats();
  }

  /**
   * Обновление статистики
   */
  private updateStats(): void {
    this.stats.totalAttempts = this.attempts.length;
    
    const torAttempts = this.attempts.filter(a => a.strategy === 'tor');
    const directAttempts = this.attempts.filter(a => a.strategy === 'direct');
    
    this.stats.torAttempts = torAttempts.length;
    this.stats.directAttempts = directAttempts.length;

    // Вычисляем успешность
    const torSuccessful = torAttempts.filter(a => a.success).length;
    const directSuccessful = directAttempts.filter(a => a.success).length;

    this.stats.torSuccessRate = torAttempts.length > 0 ? 
      (torSuccessful / torAttempts.length) * 100 : 100;
    this.stats.directSuccessRate = directAttempts.length > 0 ? 
      (directSuccessful / directAttempts.length) * 100 : 100;

    // Вычисляем среднее время отклика
    const torResponseTimes = torAttempts.map(a => a.responseTime);
    const directResponseTimes = directAttempts.map(a => a.responseTime);

    this.stats.averageResponseTime.tor = torResponseTimes.length > 0 ?
      torResponseTimes.reduce((sum, time) => sum + time, 0) / torResponseTimes.length : 0;
    this.stats.averageResponseTime.direct = directResponseTimes.length > 0 ?
      directResponseTimes.reduce((sum, time) => sum + time, 0) / directResponseTimes.length : 0;
  }

  /**
   * Обработка сбоя Tor сервиса
   */
  private handleTorServiceFailure(event: any): void {
    enhancedDbLogger.warn('🚨 Обнаружен сбой Tor сервиса:', event.serviceName);

    // Переключаем критически важные соединения на direct
    const criticalTypes = ['web', 'api', 'blockchain'];
    
    for (const type of criticalTypes) {
      const strategy = this.strategies.get(type);
      const currentConnection = this.currentConnections.get(type);
      
      if (strategy && currentConnection === 'tor' && strategy.fallback !== 'none') {
        this.currentConnections.set(type, strategy.fallback);
        enhancedDbLogger.info(`🔄 Переключили ${type} с tor на ${strategy.fallback}`);
        
        this.emit('automaticFailover', {
          requestType: type,
          reason: `Tor service failure: ${event.serviceName}`,
        });
      }
    }
  }

  /**
   * Обработка восстановления Tor сервиса
   */
  private handleTorServiceRecovery(event: any): void {
    enhancedDbLogger.info('✅ Tor сервис восстановлен:', event.serviceName);

    // Возвращаемся к Tor для соединений с autoRecovery
    for (const [type, strategy] of this.strategies) {
      if (strategy.autoRecovery && strategy.primary === 'tor') {
        const currentConnection = this.currentConnections.get(type);
        
        if (currentConnection !== 'tor') {
          this.currentConnections.set(type, 'tor');
          this.stats.recoveryCount++;
          
          enhancedDbLogger.info(`🔄 Восстановили ${type} соединение на tor`);
          
          this.emit('automaticRecovery', {
            requestType: type,
            reason: `Tor service recovered: ${event.serviceName}`,
          });
        }
      }
    }
  }

  /**
   * Обработка критических алертов Tor
   */
  private handleCriticalTorAlert(alert: any): void {
    enhancedDbLogger.error('🚨 Критический алерт Tor:', alert.message);

    // Экстренное переключение всех соединений на direct
    if (alert.service === 'multiple_failures' || alert.service === 'essential_failures') {
      this.emergencyFailoverAll();
    }
  }

  /**
   * Экстренное переключение всех соединений
   */
  private emergencyFailoverAll(): void {
    enhancedDbLogger.warn('🚨 ЭКСТРЕННОЕ ПЕРЕКЛЮЧЕНИЕ всех соединений на direct');

    for (const [type, strategy] of this.strategies) {
      if (strategy.fallback !== 'none') {
        this.currentConnections.set(type, 'direct');
      }
    }

    this.emit('emergencyFailover', {
      reason: 'Critical Tor infrastructure failure',
      timestamp: new Date(),
    });
  }

  /**
   * Обработка отключения Tor
   */
  private handleTorDisconnection(): void {
    enhancedDbLogger.warn('🔌 Tor соединение потеряно');
    
    // Переключаем все на direct где возможно
    for (const [type, strategy] of this.strategies) {
      if (strategy.fallback === 'direct') {
        this.currentConnections.set(type, 'direct');
      }
    }
  }

  /**
   * Обработка переподключения Tor
   */
  private handleTorReconnection(): void {
    enhancedDbLogger.info('🔌 Tor соединение восстановлено');
    
    // Возвращаемся к Tor где включено autoRecovery
    for (const [type, strategy] of this.strategies) {
      if (strategy.autoRecovery && strategy.primary === 'tor') {
        this.currentConnections.set(type, 'tor');
      }
    }
  }

  /**
   * Периодическая проверка здоровья соединений
   */
  private async performHealthCheck(): Promise<void> {
    try {
      enhancedDbLogger.debug('🔍 Выполняем проверку здоровья соединений...');

      // Тестируем текущие соединения
      for (const [type, connectionType] of this.currentConnections) {
        try {
          const instance = await this.createAxiosInstance(connectionType, type);
          
          // Простой тест - запрос к google.com или другому надежному хосту
          const testUrl = connectionType === 'tor' ? 
            'https://check.torproject.org/api/ip' : 
            'https://httpbin.org/ip';
          
          await this.testConnection(instance, testUrl, connectionType);
          
          // Дополнительная проверка блокчейн соединений для типа 'blockchain'
          if (type === 'blockchain' && connectionType === 'tor') {
            await this.performBlockchainHealthCheck();
          }
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          enhancedDbLogger.warn(`⚠️ Health check неудачен для ${type}:${connectionType}:`, {
            error: errorMessage,
            type,
            connectionType
          });
          
          // Если текущее соединение не работает, пытаемся переключиться
          const strategy = this.strategies.get(type);
          if (strategy && strategy.fallback !== 'none' && connectionType !== strategy.fallback) {
            this.currentConnections.set(type, strategy.fallback);
            enhancedDbLogger.info(`🔄 Health check переключил ${type} на ${strategy.fallback}`);
          }
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      enhancedDbLogger.error('❌ Ошибка health check:', { error: errorMessage });
    }
  }

  /**
   * Проверка здоровья блокчейн соединений через Tor
   */
  private async performBlockchainHealthCheck(): Promise<void> {
    try {
      enhancedDbLogger.debug('🔗 Проверяем блокчейн соединения через Tor...');
      
      // Получаем статус всех блокчейн соединений через доступный healthCheck метод
      const blockchainHealthResults = await torBlockchainClient.healthCheck();
      
      // Преобразуем результаты healthCheck в формат connected/disconnected
      const blockchainStatus: Record<string, { connected: boolean; status?: string; error?: string }> = {};
      
      for (const [currency, healthData] of Object.entries(blockchainHealthResults)) {
        blockchainStatus[currency] = {
          connected: healthData.status === 'healthy',
          status: healthData.status,
          error: healthData.error
        };
      }
      
      // Проверяем критически важные блокчейны
      const criticalBlockchains = ['bitcoin', 'ethereum'];
      let criticalFailures = 0;
      
      for (const blockchain of criticalBlockchains) {
        if (blockchainStatus[blockchain] && !blockchainStatus[blockchain].connected) {
          criticalFailures++;
          enhancedDbLogger.warn(`⚠️ Блокчейн ${blockchain} недоступен через Tor`, {
            blockchain,
            status: blockchainStatus[blockchain]
          });
        }
      }
      
      // Если критически важные блокчейны недоступны, инициируем переключение
      if (criticalFailures > 0) {
        enhancedDbLogger.error(`🚨 ${criticalFailures} критически важных блокчейнов недоступны через Tor`, {
          criticalFailures,
          totalCritical: criticalBlockchains.length
        });
        
        // Переключаем блокчейн соединения на direct если возможно
        const blockchainStrategy = this.strategies.get('blockchain');
        if (blockchainStrategy && blockchainStrategy.fallback !== 'none') {
          this.currentConnections.set('blockchain', blockchainStrategy.fallback);
          
          this.emit('blockchainFailover', {
            reason: `${criticalFailures} critical blockchain connections failed via Tor`,
            failedBlockchains: criticalBlockchains.filter(bc => 
              blockchainStatus[bc] && !blockchainStatus[bc].connected
            ),
            newConnection: blockchainStrategy.fallback
          });
        }
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      enhancedDbLogger.error('❌ Ошибка проверки блокчейн соединений:', { error: errorMessage });
    }
  }

  /**
   * Генерация случайного User-Agent
   */
  private generateUserAgent(): string {
    const agents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    ];
    return agents[Math.floor(Math.random() * agents.length)];
  }

  /**
   * Принудительное переключение типа соединения
   */
  public forceConnectionType(requestType: string, connectionType: 'tor' | 'direct'): void {
    const strategy = this.strategies.get(requestType);
    if (!strategy) {
      throw new Error(`Неизвестный тип запроса: ${requestType}`);
    }

    if (connectionType === 'direct' && strategy.fallback === 'none') {
      throw new Error(`Direct соединения запрещены для ${requestType}`);
    }

    this.currentConnections.set(requestType, connectionType);
    enhancedDbLogger.info(`🔧 Принудительно установлено ${connectionType} для ${requestType}`);

    this.emit('manualOverride', { requestType, connectionType });
  }

  /**
   * Получение текущих стратегий
   */
  public getCurrentConnections(): Map<string, 'tor' | 'direct'> {
    return new Map(this.currentConnections);
  }

  /**
   * Получение статистики
   */
  public getStats(): FailoverStats {
    return { ...this.stats };
  }

  /**
   * Получение истории попыток
   */
  public getAttemptHistory(limit: number = 100): ConnectionAttempt[] {
    return this.attempts.slice(-limit);
  }

  /**
   * Остановка менеджера
   */
  public shutdown(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    enhancedDbLogger.info('🛑 ConnectionFailoverManager остановлен');
    this.emit('shutdown');
  }
}

// Создаем глобальный экземпляр
export const connectionFailoverManager = new ConnectionFailoverManager();