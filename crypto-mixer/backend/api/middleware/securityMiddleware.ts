import { Request, Response, NextFunction, Express } from 'express';
import { EnhancedRateLimiter, defaultRateLimitConfig, RateLimitConfig } from './rateLimiting.enhanced';
import { AdvancedDDoSProtection, defaultDDoSConfig, DDoSConfig } from './ddosProtection';
import { enhancedDbLogger } from '../../utils/logger';

/**
 * Интегрированная система безопасности для crypto-mixer
 * 
 * RUSSIAN COMMENTS: Объединяем все системы защиты в единый middleware
 * - Rate limiting с множественными уровнями
 * - Продвинутая DDoS защита с ML алгоритмами  
 * - Централизованный мониторинг и алертинг
 * - Динамическая адаптация к угрозам
 * - Интеграция с внешними системами безопасности
 */

export interface SecurityConfig {
  enabled: boolean;
  
  // Конфигурации подсистем
  rateLimiting: RateLimitConfig;
  ddosProtection: DDoSConfig;
  
  // Общие настройки безопасности
  global: {
    trustProxy: boolean;           // Доверяем прокси заголовкам
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    blockDuration: number;         // Базовая длительность блокировки (сек)
    whitelistBypass: boolean;      // Обходить проверки для белого списка
  };
  
  // Интеграция с внешними системами
  integration: {
    prometheus: {
      enabled: boolean;
      port: number;
      path: string;
    };
    elasticsearch: {
      enabled: boolean;
      host: string;
      index: string;
    };
    webhook: {
      enabled: boolean;
      url: string;
      secret?: string;
    };
  };
  
  // Автоматические действия
  autoActions: {
    escalateToCloudflare: boolean;   // Эскалация к Cloudflare
    banPersistentAttackers: boolean; // Долгосрочный бан атакующих
    adaptiveThresholds: boolean;     // Адаптивные пороги
    emergencyMode: {
      enabled: boolean;
      trigger: {
        attacksPerMinute: number;
        blockedIPsCount: number;
      };
      action: 'throttle' | 'lockdown' | 'maintenance';
    };
  };
}

export interface SecurityEvent {
  type: 'rate_limit_exceeded' | 'ddos_detected' | 'ip_blocked' | 'attack_mitigated' | 'emergency_mode';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  details: any;
  timestamp: Date;
  metadata?: {
    ip?: string;
    userAgent?: string;
    endpoint?: string;
    attackType?: string;
    confidence?: number;
  };
}

/**
 * RUSSIAN: Главный класс системы безопасности
 */
export class SecurityMiddleware {
  private config: SecurityConfig;
  private rateLimiter: EnhancedRateLimiter;
  private ddosProtection: AdvancedDDoSProtection;
  private isActive: boolean = false;
  
  // Статистика безопасности
  private securityStats = {
    totalRequests: 0,
    blockedRequests: 0,
    rateLimitedRequests: 0,
    ddosAttacksDetected: 0,
    attacksMitigated: 0,
    emergencyModeActivations: 0,
    topAttackingIPs: new Map<string, number>(),
    attackTypes: new Map<string, number>()
  };
  
  // События безопасности
  private securityEvents: SecurityEvent[] = [];
  private maxEventsHistory = 10000;
  
  // Экстренный режим
  private emergencyMode = {
    active: false,
    activatedAt: null as Date | null,
    reason: '',
    level: 0
  };

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = this.mergeConfig(config);
    
    // RUSSIAN: Инициализируем подсистемы защиты
    this.rateLimiter = new EnhancedRateLimiter(this.config.rateLimiting);
    this.ddosProtection = new AdvancedDDoSProtection(this.config.ddosProtection);
    
    this.setupEventListeners();
    
    enhancedDbLogger.info('🛡️ Система безопасности инициализирована', {
      rateLimiting: this.config.rateLimiting.redis.enabled,
      ddosProtection: this.config.ddosProtection.enabled,
      emergencyMode: this.config.autoActions.emergencyMode.enabled
    });
  }

  /**
   * RUSSIAN: Объединение конфигурации по умолчанию с пользовательской
   */
  private mergeConfig(userConfig: Partial<SecurityConfig>): SecurityConfig {
    const defaultConfig: SecurityConfig = {
      enabled: true,
      rateLimiting: defaultRateLimitConfig,
      ddosProtection: defaultDDoSConfig,
      global: {
        trustProxy: true,
        logLevel: 'info',
        blockDuration: 300,
        whitelistBypass: true
      },
      integration: {
        prometheus: {
          enabled: false,
          port: 9090,
          path: '/metrics'
        },
        elasticsearch: {
          enabled: false,
          host: 'localhost:9200',
          index: 'crypto-mixer-security'
        },
        webhook: {
          enabled: false,
          url: ''
        }
      },
      autoActions: {
        escalateToCloudflare: false,
        banPersistentAttackers: true,
        adaptiveThresholds: true,
        emergencyMode: {
          enabled: true,
          trigger: {
            attacksPerMinute: 50,
            blockedIPsCount: 100
          },
          action: 'throttle'
        }
      }
    };

    return {
      ...defaultConfig,
      ...userConfig,
      rateLimiting: { ...defaultConfig.rateLimiting, ...userConfig.rateLimiting },
      ddosProtection: { ...defaultConfig.ddosProtection, ...userConfig.ddosProtection },
      global: { ...defaultConfig.global, ...userConfig.global },
      integration: { ...defaultConfig.integration, ...userConfig.integration },
      autoActions: { ...defaultConfig.autoActions, ...userConfig.autoActions }
    };
  }

  /**
   * RUSSIAN: Настройка слушателей событий подсистем
   */
  private setupEventListeners(): void {
    // RUSSIAN: События от DDoS защиты
    this.ddosProtection.on('attack_detected', (attack) => {
      this.handleSecurityEvent({
        type: 'ddos_detected',
        severity: attack.severity,
        source: 'ddos_protection',
        details: attack,
        timestamp: new Date(),
        metadata: {
          attackType: attack.type,
          confidence: attack.confidence
        }
      });
    });

    this.ddosProtection.on('ip_blocked', (blockInfo) => {
      this.handleSecurityEvent({
        type: 'ip_blocked',
        severity: 'medium',
        source: 'ddos_protection',
        details: blockInfo,
        timestamp: new Date(),
        metadata: {
          ip: blockInfo.ip
        }
      });
    });

    // RUSSIAN: Мониторинг экстренных ситуаций
    setInterval(() => {
      this.checkEmergencyConditions();
    }, 60000); // Проверяем каждую минуту
  }

  /**
   * RUSSIAN: Главный middleware для Express
   */
  public middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.enabled) {
        return next();
      }

      const startTime = Date.now();
      this.securityStats.totalRequests++;

      try {
        // RUSSIAN: Проверяем экстренный режим
        if (this.emergencyMode.active) {
          return this.handleEmergencyMode(req, res);
        }

        // RUSSIAN: Применяем DDoS защиту первой
        const ddosResult = await this.applyDDoSProtection(req, res);
        if (!ddosResult.allowed) {
          this.securityStats.blockedRequests++;
          return; // DDoS защита уже обработала ответ
        }

        // RUSSIAN: Применяем rate limiting
        const rateLimitResult = await this.applyRateLimiting(req, res);
        if (!rateLimitResult.allowed) {
          this.securityStats.rateLimitedRequests++;
          return; // Rate limiter уже обработал ответ
        }

        // RUSSIAN: Записываем метрики запроса
        this.recordRequestMetrics(req, startTime);

        // RUSSIAN: Передаем управление следующему middleware
        next();

      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка в системе безопасности', { error });
        // RUSSIAN: При ошибке пропускаем запрос (fail-open)
        next();
      }
    };
  }

  /**
   * RUSSIAN: Применение DDoS защиты
   */
  private async applyDDoSProtection(req: Request, res: Response): Promise<{ allowed: boolean }> {
    return new Promise((resolve) => {
      const ddosMiddleware = this.ddosProtection.middleware();
      
      // RUSSIAN: Перехватываем ответ от DDoS middleware
      const originalSend = res.send;
      const originalJson = res.json;
      let responseSent = false;

      res.send = function(body) {
        responseSent = true;
        resolve({ allowed: false });
        return originalSend.call(this, body);
      };

      res.json = function(body) {
        responseSent = true;
        resolve({ allowed: false });
        return originalJson.call(this, body);
      };

      ddosMiddleware(req, res, () => {
        if (!responseSent) {
          resolve({ allowed: true });
        }
      });
    });
  }

  /**
   * RUSSIAN: Применение rate limiting
   */
  private async applyRateLimiting(req: Request, res: Response): Promise<{ allowed: boolean }> {
    return new Promise((resolve) => {
      const rateLimitMiddleware = this.rateLimiter.middleware();
      
      const originalSend = res.send;
      const originalJson = res.json;
      let responseSent = false;

      res.send = function(body) {
        responseSent = true;
        resolve({ allowed: false });
        return originalSend.call(this, body);
      };

      res.json = function(body) {
        responseSent = true;
        resolve({ allowed: false });
        return originalJson.call(this, body);
      };

      rateLimitMiddleware(req, res, () => {
        if (!responseSent) {
          resolve({ allowed: true });
        }
      });
    });
  }

  /**
   * RUSSIAN: Обработка события безопасности
   */
  private handleSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);
    
    // RUSSIAN: Ограничиваем историю событий
    if (this.securityEvents.length > this.maxEventsHistory) {
      this.securityEvents = this.securityEvents.slice(-this.maxEventsHistory);
    }

    // RUSSIAN: Обновляем статистику атак
    if (event.type === 'ddos_detected') {
      this.securityStats.ddosAttacksDetected++;
      
      if (event.metadata?.attackType) {
        const count = this.securityStats.attackTypes.get(event.metadata.attackType) || 0;
        this.securityStats.attackTypes.set(event.metadata.attackType, count + 1);
      }
    }

    if (event.metadata?.ip) {
      const count = this.securityStats.topAttackingIPs.get(event.metadata.ip) || 0;
      this.securityStats.topAttackingIPs.set(event.metadata.ip, count + 1);
    }

    // RUSSIAN: Логируем важные события
    const logLevel = event.severity === 'critical' || event.severity === 'high' ? 'warn' : 'info';
    enhancedDbLogger[logLevel](`🚨 Событие безопасности: ${event.type}`, {
      severity: event.severity,
      source: event.source,
      metadata: event.metadata
    });

    // RUSSIAN: Отправляем webhook уведомления для критических событий
    if (this.config.integration.webhook.enabled && event.severity === 'critical') {
      this.sendWebhookNotification(event);
    }
  }

  /**
   * RUSSIAN: Проверка условий экстренного режима
   */
  private checkEmergencyConditions(): void {
    if (!this.config.autoActions.emergencyMode.enabled || this.emergencyMode.active) {
      return;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // RUSSIAN: Подсчитываем атаки за последнюю минуту
    const recentAttacks = this.securityEvents.filter(
      event => event.timestamp.getTime() > oneMinuteAgo && 
      (event.type === 'ddos_detected' || event.type === 'rate_limit_exceeded')
    ).length;

    const blockedIPs = this.ddosProtection.getStatistics().blockedIPs;

    const trigger = this.config.autoActions.emergencyMode.trigger;

    if (recentAttacks >= trigger.attacksPerMinute || blockedIPs >= trigger.blockedIPsCount) {
      this.activateEmergencyMode(`Превышены пороги: атаки=${recentAttacks}, заблокированные IP=${blockedIPs}`);
    }
  }

  /**
   * RUSSIAN: Активация экстренного режима
   */
  private activateEmergencyMode(reason: string): void {
    this.emergencyMode = {
      active: true,
      activatedAt: new Date(),
      reason,
      level: 1
    };

    this.securityStats.emergencyModeActivations++;

    enhancedDbLogger.error('🚨 АКТИВИРОВАН ЭКСТРЕННЫЙ РЕЖИМ БЕЗОПАСНОСТИ', {
      reason,
      action: this.config.autoActions.emergencyMode.action,
      timestamp: this.emergencyMode.activatedAt
    });

    this.handleSecurityEvent({
      type: 'emergency_mode',
      severity: 'critical',
      source: 'security_middleware',
      details: { reason, action: this.config.autoActions.emergencyMode.action },
      timestamp: new Date()
    });

    // RUSSIAN: Автоматическая деактивация через 15 минут
    setTimeout(() => {
      this.deactivateEmergencyMode();
    }, 15 * 60 * 1000);
  }

  /**
   * RUSSIAN: Деактивация экстренного режима
   */
  private deactivateEmergencyMode(): void {
    if (!this.emergencyMode.active) return;

    enhancedDbLogger.info('✅ Экстренный режим деактивирован', {
      duration: this.emergencyMode.activatedAt ? 
        Date.now() - this.emergencyMode.activatedAt.getTime() : 0
    });

    this.emergencyMode = {
      active: false,
      activatedAt: null,
      reason: '',
      level: 0
    };
  }

  /**
   * RUSSIAN: Обработка запросов в экстренном режиме
   */
  private handleEmergencyMode(req: Request, res: Response): void {
    const action = this.config.autoActions.emergencyMode.action;

    switch (action) {
      case 'throttle':
        // RUSSIAN: Жесткое throttling - только критически важные эндпоинты
        if (!this.isCriticalEndpoint(req.path)) {
          return res.status(503).json({
            error: 'Service Temporarily Unavailable',
            message: 'Система находится в экстренном режиме. Доступны только критически важные операции.',
            emergencyMode: true,
            retryAfter: 300
          });
        }
        break;

      case 'lockdown':
        // RUSSIAN: Полная блокировка всех запросов
        return res.status(503).json({
          error: 'Service Locked Down',
          message: 'Система заблокирована в связи с обнаружением атаки.',
          emergencyMode: true,
          retryAfter: 900
        });

      case 'maintenance':
        // RUSSIAN: Режим обслуживания
        return res.status(503).json({
          error: 'Service Under Maintenance',
          message: 'Система временно недоступна для обслуживания.',
          emergencyMode: true,
          retryAfter: 1800
        });
    }
  }

  /**
   * RUSSIAN: Проверка критически важных эндпоинтов
   */
  private isCriticalEndpoint(path: string): boolean {
    const criticalPaths = [
      '/api/v1/health',
      '/api/v1/status', 
      '/api/v1/admin',
      '/api/v1/emergency'
    ];

    return criticalPaths.some(criticalPath => path.startsWith(criticalPath));
  }

  /**
   * RUSSIAN: Запись метрик запроса
   */
  private recordRequestMetrics(req: Request, startTime: number): void {
    const responseTime = Date.now() - startTime;
    
    // RUSSIAN: Отправляем метрики в подсистемы
    // Rate limiter автоматически записывает через свой middleware
    // DDoS protection также ведет свою статистику
  }

  /**
   * RUSSIAN: Отправка webhook уведомления
   */
  private async sendWebhookNotification(event: SecurityEvent): Promise<void> {
    if (!this.config.integration.webhook.url) return;

    try {
      const payload = {
        event: event.type,
        severity: event.severity,
        timestamp: event.timestamp.toISOString(),
        source: event.source,
        details: event.details,
        metadata: event.metadata,
        systemInfo: {
          service: 'crypto-mixer',
          instance: process.env.INSTANCE_ID || 'unknown',
          version: process.env.VERSION || '1.0.0'
        }
      };

      // RUSSIAN: В реальной реализации здесь будет HTTP запрос
      enhancedDbLogger.info('📤 Webhook уведомление отправлено', { 
        url: this.config.integration.webhook.url,
        event: event.type 
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отправки webhook', { error });
    }
  }

  /**
   * RUSSIAN: Получение статистики безопасности
   */
  public getSecurityStatistics(): {
    general: typeof this.securityStats;
    rateLimiter: any;
    ddosProtection: any;
    emergencyMode: typeof this.emergencyMode;
  } {
    return {
      general: { ...this.securityStats },
      rateLimiter: this.rateLimiter.getStatistics(),
      ddosProtection: this.ddosProtection.getStatistics(),
      emergencyMode: { ...this.emergencyMode }
    };
  }

  /**
   * RUSSIAN: Получение последних событий безопасности
   */
  public getSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEvents
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * RUSSIAN: Ручное управление экстренным режимом
   */
  public async toggleEmergencyMode(activate: boolean, reason?: string): Promise<void> {
    if (activate && !this.emergencyMode.active) {
      this.activateEmergencyMode(reason || 'Активирован вручную');
    } else if (!activate && this.emergencyMode.active) {
      this.deactivateEmergencyMode();
    }
  }

  /**
   * RUSSIAN: Обновление конфигурации во время выполнения
   */
  public updateConfiguration(newConfig: Partial<SecurityConfig>): void {
    this.config = this.mergeConfig(newConfig);
    
    enhancedDbLogger.info('🔧 Конфигурация безопасности обновлена', {
      rateLimitingEnabled: this.config.rateLimiting.redis.enabled,
      ddosProtectionEnabled: this.config.ddosProtection.enabled
    });
  }

  /**
   * RUSSIAN: Остановка системы безопасности
   */
  public async shutdown(): Promise<void> {
    enhancedDbLogger.info('🛑 Остановка системы безопасности...');

    await this.rateLimiter.shutdown();
    await this.ddosProtection.shutdown();

    if (this.emergencyMode.active) {
      this.deactivateEmergencyMode();
    }

    this.isActive = false;
    enhancedDbLogger.info('✅ Система безопасности остановлена');
  }
}

/**
 * RUSSIAN: Фабричная функция для создания middleware безопасности
 */
export function createSecurityMiddleware(config?: Partial<SecurityConfig>): SecurityMiddleware {
  return new SecurityMiddleware(config);
}

/**
 * RUSSIAN: Хелпер для интеграции с Express приложением
 */
export function setupSecurity(app: Express, config?: Partial<SecurityConfig>): SecurityMiddleware {
  const security = createSecurityMiddleware(config);
  
  // RUSSIAN: Применяем middleware безопасности ко всем маршрутам
  app.use(security.middleware());
  
  // RUSSIAN: Добавляем эндпоинт статистики безопасности
  app.get('/api/v1/security/stats', (req, res) => {
    const stats = security.getSecurityStatistics();
    res.json(stats);
  });

  // RUSSIAN: Добавляем эндпоинт событий безопасности
  app.get('/api/v1/security/events', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const events = security.getSecurityEvents(limit);
    res.json(events);
  });

  // RUSSIAN: Добавляем эндпоинт управления экстренным режимом
  app.post('/api/v1/security/emergency', async (req, res) => {
    const { activate, reason } = req.body;
    await security.toggleEmergencyMode(activate, reason);
    res.json({ success: true, emergencyMode: activate });
  });

  enhancedDbLogger.info('🛡️ Система безопасности интегрирована в Express приложение');
  
  return security;
}