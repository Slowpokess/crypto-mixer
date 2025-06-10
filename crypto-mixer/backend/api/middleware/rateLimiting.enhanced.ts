import { Request, Response, NextFunction } from 'express';
import { enhancedDbLogger } from '../../utils/logger';

// RUSSIAN: Импорт Redis с fallback для случаев, когда модуль недоступен
let createClient: any = null;
let RedisClientType: any = null;

try {
  const redis = require('redis');
  createClient = redis.createClient;
  RedisClientType = redis.RedisClientType;
} catch (error) {
  enhancedDbLogger.warn('📦 Redis модуль недоступен, используется memory fallback', { error: (error as Error).message });
}

// RUSSIAN: Типы импортируются из отдельного файла типов
import '../../types/express';

/**
 * Расширенная система rate limiting для crypto-mixer
 * 
 * RUSSIAN COMMENTS: Создаем многоуровневую систему защиты от злоупотреблений
 * - Глобальное ограничение по IP
 * - Ограничения по эндпоинтам  
 * - Ограничения по пользователям
 * - Адаптивное throttling при высокой нагрузке
 * - Интеграция с мониторингом для DDoS detection
 */

export interface RateLimitRule {
  windowMs: number;           // Окно времени в миллисекундах
  maxRequests: number;        // Максимальное количество запросов
  skipSuccessfulRequests?: boolean; // Пропускать успешные запросы
  skipFailedRequests?: boolean;     // Пропускать неудачные запросы
  keyGenerator?: (req: Request) => string; // Функция генерации ключа
  onLimitReached?: (req: Request, res: Response) => void; // Callback при превышении
  whitelist?: string[];       // IP адреса в белом списке
  blacklist?: string[];       // IP адреса в черном списке
}

export interface RateLimitConfig {
  // Глобальные ограничения по IP
  global: RateLimitRule;
  
  // Ограничения по эндпоинтам
  endpoints: {
    [endpoint: string]: RateLimitRule;
  };
  
  // Ограничения по пользователям
  user: RateLimitRule;
  
  // Специальные ограничения для критических операций
  critical: RateLimitRule;
  
  // Адаптивное throttling
  adaptive: {
    enabled: boolean;
    cpuThreshold: number;      // При превышении CPU начинаем throttling
    memoryThreshold: number;   // При превышении памяти начинаем throttling
    throttleFactor: number;    // Во сколько раз ужесточать лимиты
  };
  
  // DDoS защита
  ddosProtection: {
    enabled: boolean;
    suspiciousThreshold: number; // Количество запросов для подозрения
    blockDuration: number;       // Время блокировки в секундах
    patternDetection: boolean;   // Определение подозрительных паттернов
  };
  
  // Redis настройки для распределенного rate limiting
  redis: {
    enabled: boolean;
    url: string;
    keyPrefix: string;
  };
  
  // Мониторинг
  monitoring: {
    enabled: boolean;
    alertThreshold: number;  // При превышении отправляем алерт
  };
}

export interface RateLimitInfo {
  total: number;        // Общий лимит
  remaining: number;    // Остающиеся запросы
  resetTime: Date;      // Время сброса
  retryAfter?: number;  // Через сколько секунд можно повторить
}

export interface DDoSMetrics {
  requestsPerSecond: number;
  uniqueIPs: number;
  suspiciousIPs: string[];
  blockedIPs: string[];
  totalBlocked: number;
  patternDetected: boolean;
}

/**
 * Расширенный Rate Limiter с DDoS защитой
 */
export class EnhancedRateLimiter {
  private config: RateLimitConfig;
  private redisClient: any | null = null; // RUSSIAN: Используем any для совместимости с dynamic import
  private memoryStore: Map<string, any> = new Map();
  private ddosMetrics: DDoSMetrics;
  private blockedIPs: Set<string> = new Set();
  private suspiciousActivity: Map<string, number> = new Map();
  
  constructor(config: RateLimitConfig) {
    this.config = config;
    this.ddosMetrics = {
      requestsPerSecond: 0,
      uniqueIPs: 0,
      suspiciousIPs: [],
      blockedIPs: [],
      totalBlocked: 0,
      patternDetected: false
    };
    
    this.initializeRedis();
    this.startDDoSMonitoring();
  }

  /**
   * RUSSIAN: Инициализация Redis для распределенного rate limiting
   */
  private async initializeRedis(): Promise<void> {
    if (!this.config.redis.enabled || !createClient) {
      enhancedDbLogger.info('🔒 Rate Limiting: Redis отключен или недоступен, используется локальное хранилище');
      return;
    }

    try {
      this.redisClient = createClient({
        url: this.config.redis.url,
        socket: {
          connectTimeout: 5000,
          commandTimeout: 3000,
          reconnectDelay: 1000
        }
      });

      this.redisClient.on('error', (error: Error) => {
        enhancedDbLogger.error('❌ Redis Rate Limiter ошибка', { error: error.message });
        // RUSSIAN: При ошибке Redis переключаемся на локальное хранилище
        this.redisClient = null;
      });

      this.redisClient.on('connect', () => {
        enhancedDbLogger.info('✅ Redis Rate Limiter подключен');
      });

      await this.redisClient.connect();
    } catch (error) {
      enhancedDbLogger.error('❌ Не удалось подключиться к Redis для Rate Limiting', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.redisClient = null;
    }
  }

  /**
   * RUSSIAN: Запуск мониторинга DDoS атак
   */
  private startDDoSMonitoring(): void {
    if (!this.config.ddosProtection.enabled) {
      return;
    }

    // Обновляем метрики каждую секунду
    setInterval(() => {
      this.updateDDoSMetrics();
      this.detectSuspiciousPatterns();
      this.cleanupExpiredBlocks();
    }, 1000);

    enhancedDbLogger.info('🛡️ DDoS мониторинг активирован');
  }

  /**
   * RUSSIAN: Главный middleware для rate limiting
   */
  public middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const clientIP = this.getClientIP(req);
        const userAgent = req.get('User-Agent') || 'unknown';
        
        enhancedDbLogger.debug('🔍 Rate Limiting проверка', {
          ip: clientIP,
          method: req.method,
          path: req.path,
          userAgent
        });

        // RUSSIAN: Проверяем черный список IP
        if (this.isBlacklisted(clientIP)) {
          enhancedDbLogger.warn('🚫 IP в черном списке', { ip: clientIP });
          return this.handleBlocked(req, res, 'IP в черном списке');
        }

        // RUSSIAN: Проверяем заблокированные IP от DDoS защиты
        if (this.blockedIPs.has(clientIP)) {
          enhancedDbLogger.warn('🛡️ IP заблокирован DDoS защитой', { ip: clientIP });
          return this.handleBlocked(req, res, 'IP временно заблокирован');
        }

        // RUSSIAN: Проверяем белый список IP (пропускаем проверки)
        if (this.isWhitelisted(clientIP)) {
          enhancedDbLogger.debug('✅ IP в белом списке, пропускаем', { ip: clientIP });
          return next();
        }

        // RUSSIAN: Определяем применимые правила rate limiting
        const rules = this.getApplicableRules(req);
        
        // RUSSIAN: Проверяем каждое правило
        for (const rule of rules) {
          const result = await this.checkRateLimit(req, rule);
          
          if (!result.allowed) {
            enhancedDbLogger.warn('⚠️ Rate limit превышен', {
              ip: clientIP,
              rule: rule.name,
              remaining: result.info.remaining,
              resetTime: result.info.resetTime
            });

            // RUSSIAN: Записываем подозрительную активность
            this.recordSuspiciousActivity(clientIP);
            
            return this.handleRateLimitExceeded(req, res, result.info, rule);
          }
        }

        // RUSSIAN: Записываем успешный запрос для мониторинга
        this.recordRequest(req);
        
        // RUSSIAN: Добавляем заголовки с информацией о лимитах
        this.addRateLimitHeaders(res, rules[0] ? await this.checkRateLimit(req, rules[0]) : null);
        
        next();
        
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка в Rate Limiting middleware', { error });
        // RUSSIAN: При ошибке пропускаем запрос (fail-open для доступности)
        next();
      }
    };
  }

  /**
   * RUSSIAN: Проверка rate limit для конкретного правила
   */
  private async checkRateLimit(req: Request, rule: RateLimitRule): Promise<{
    allowed: boolean;
    info: RateLimitInfo;
  }> {
    const key = this.generateKey(req, rule);
    const now = Date.now();
    const windowStart = now - rule.windowMs;

    try {
      // RUSSIAN: Используем Redis если доступен, иначе локальное хранилище
      const data = await this.getStoredData(key);
      
      // RUSSIAN: Фильтруем запросы в текущем окне
      const requestsInWindow = data.requests.filter((timestamp: number) => timestamp > windowStart);
      
      // RUSSIAN: Применяем адаптивное throttling если включено
      const effectiveMaxRequests = this.getEffectiveLimit(rule.maxRequests);
      
      const allowed = requestsInWindow.length < effectiveMaxRequests;
      const remaining = Math.max(0, effectiveMaxRequests - requestsInWindow.length);
      const resetTime = new Date(windowStart + rule.windowMs);

      if (allowed) {
        // RUSSIAN: Записываем новый запрос
        requestsInWindow.push(now);
        await this.storeData(key, {
          requests: requestsInWindow,
          lastReset: now
        }, rule.windowMs);
      }

      return {
        allowed,
        info: {
          total: effectiveMaxRequests,
          remaining,
          resetTime,
          retryAfter: allowed ? undefined : Math.ceil((resetTime.getTime() - now) / 1000)
        }
      };

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки rate limit', { error, key });
      // RUSSIAN: При ошибке разрешаем запрос (fail-open)
      return {
        allowed: true,
        info: {
          total: rule.maxRequests,
          remaining: rule.maxRequests,
          resetTime: new Date(now + rule.windowMs)
        }
      };
    }
  }

  /**
   * RUSSIAN: Получение применимых правил для запроса
   */
  private getApplicableRules(req: Request): Array<RateLimitRule & { name: string }> {
    const rules: Array<RateLimitRule & { name: string }> = [];

    // RUSSIAN: Глобальное ограничение
    rules.push({ ...this.config.global, name: 'global' });

    // RUSSIAN: Ограничение по эндпоинту
    const endpoint = this.getEndpointPattern(req.path);
    if (this.config.endpoints[endpoint]) {
      rules.push({ ...this.config.endpoints[endpoint], name: `endpoint:${endpoint}` });
    }

    // RUSSIAN: Ограничение по пользователю (если авторизован)
    if (req.user) {
      rules.push({ ...this.config.user, name: 'user' });
    }

    // RUSSIAN: Критические операции
    if (this.isCriticalEndpoint(req.path)) {
      rules.push({ ...this.config.critical, name: 'critical' });
    }

    return rules;
  }

  /**
   * RUSSIAN: Генерация ключа для хранения
   */
  private generateKey(req: Request, rule: RateLimitRule): string {
    if (rule.keyGenerator) {
      return `${this.config.redis.keyPrefix}:${rule.keyGenerator(req)}`;
    }

    const ip = this.getClientIP(req);
    const user = req.user && 'id' in req.user ? `user:${req.user.id}` : `ip:${ip}`;
    const endpoint = this.getEndpointPattern(req.path);
    
    return `${this.config.redis.keyPrefix}:${user}:${endpoint}`;
  }

  /**
   * RUSSIAN: Получение IP адреса клиента с учетом прокси
   */
  private getClientIP(req: Request): string {
    const forwarded = req.get('X-Forwarded-For');
    const realIP = req.get('X-Real-IP');
    const cfConnectingIP = req.get('CF-Connecting-IP'); // Cloudflare
    
    if (forwarded) {
      // RUSSIAN: Берем первый IP из списка (оригинальный клиент)
      return forwarded.split(',')[0].trim();
    }
    
    if (realIP) {
      return realIP.trim();
    }
    
    if (cfConnectingIP) {
      return cfConnectingIP.trim();
    }
    
    return req.socket.remoteAddress || 'unknown';
  }

  /**
   * RUSSIAN: Проверка IP в белом списке
   */
  private isWhitelisted(ip: string): boolean {
    // RUSSIAN: Проверяем глобальный белый список
    const globalWhitelist = this.config.global.whitelist || [];
    
    return globalWhitelist.some(whiteIP => {
      if (whiteIP.includes('/')) {
        // RUSSIAN: CIDR подсеть
        return this.isIPInCIDR(ip, whiteIP);
      }
      return ip === whiteIP;
    });
  }

  /**
   * RUSSIAN: Проверка IP в черном списке
   */
  private isBlacklisted(ip: string): boolean {
    const globalBlacklist = this.config.global.blacklist || [];
    
    return globalBlacklist.some(blackIP => {
      if (blackIP.includes('/')) {
        return this.isIPInCIDR(ip, blackIP);
      }
      return ip === blackIP;
    });
  }

  /**
   * RUSSIAN: Проверка попадания IP в CIDR подсеть
   */
  private isIPInCIDR(ip: string, cidr: string): boolean {
    try {
      const [network, prefixLength] = cidr.split('/');
      const ipNum = this.ipToNumber(ip);
      const networkNum = this.ipToNumber(network);
      const mask = -1 << (32 - parseInt(prefixLength));
      
      return (ipNum & mask) === (networkNum & mask);
    } catch {
      return false;
    }
  }

  /**
   * RUSSIAN: Конвертация IP в число
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
  }

  /**
   * RUSSIAN: Получение паттерна эндпоинта
   */
  private getEndpointPattern(path: string): string {
    // RUSSIAN: Нормализуем путь для группировки схожих эндпоинтов
    return path
      .replace(/\/\d+/g, '/:id')        // /users/123 -> /users/:id
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid') // UUID параметры
      .replace(/\/[a-f0-9]{64}/g, '/:hash')  // Hash параметры
      .toLowerCase();
  }

  /**
   * RUSSIAN: Проверка критического эндпоинта
   */
  private isCriticalEndpoint(path: string): boolean {
    const criticalPatterns = [
      '/api/v1/mix',
      '/api/v1/withdraw',
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/wallet/create'
    ];

    return criticalPatterns.some(pattern => path.startsWith(pattern));
  }

  /**
   * RUSSIAN: Получение эффективного лимита с учетом адаптивного throttling
   */
  private getEffectiveLimit(baseLimit: number): number {
    if (!this.config.adaptive.enabled) {
      return baseLimit;
    }

    // RUSSIAN: Получаем текущую нагрузку системы
    const cpuUsage = process.cpuUsage();
    const memoryUsage = process.memoryUsage();
    
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Примерный расчет
    const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    let throttleFactor = 1;

    if (cpuPercent > this.config.adaptive.cpuThreshold) {
      throttleFactor *= this.config.adaptive.throttleFactor;
      enhancedDbLogger.debug('⚡ Адаптивное throttling: высокая CPU нагрузка', { cpuPercent });
    }

    if (memoryPercent > this.config.adaptive.memoryThreshold) {
      throttleFactor *= this.config.adaptive.throttleFactor;
      enhancedDbLogger.debug('⚡ Адаптивное throttling: высокое потребление памяти', { memoryPercent });
    }

    const effectiveLimit = Math.max(1, Math.floor(baseLimit / throttleFactor));
    
    if (effectiveLimit < baseLimit) {
      enhancedDbLogger.info('🎚️ Адаптивное ограничение активировано', {
        baseLimit,
        effectiveLimit,
        throttleFactor
      });
    }

    return effectiveLimit;
  }

  /**
   * RUSSIAN: Запись подозрительной активности
   */
  private recordSuspiciousActivity(ip: string): void {
    if (!this.config.ddosProtection.enabled) {
      return;
    }

    const current = this.suspiciousActivity.get(ip) || 0;
    const newCount = current + 1;
    this.suspiciousActivity.set(ip, newCount);

    if (newCount >= this.config.ddosProtection.suspiciousThreshold) {
      this.blockIP(ip, 'Превышен порог подозрительной активности');
    }

    enhancedDbLogger.debug('📊 Подозрительная активность записана', { ip, count: newCount });
  }

  /**
   * RUSSIAN: Блокировка IP адреса
   */
  private blockIP(ip: string, reason: string): void {
    this.blockedIPs.add(ip);
    this.ddosMetrics.blockedIPs.push(ip);
    this.ddosMetrics.totalBlocked++;

    enhancedDbLogger.warn('🚫 IP заблокирован', { ip, reason });

    // RUSSIAN: Автоматическая разблокировка через заданное время
    setTimeout(() => {
      this.unblockIP(ip);
    }, this.config.ddosProtection.blockDuration * 1000);

    // RUSSIAN: Отправляем алерт в систему мониторинга
    if (this.config.monitoring.enabled) {
      this.sendDDoSAlert({
        type: 'ip_blocked',
        ip,
        reason,
        timestamp: new Date()
      });
    }
  }

  /**
   * RUSSIAN: Разблокировка IP адреса
   */
  private unblockIP(ip: string): void {
    if (this.blockedIPs.has(ip)) {
      this.blockedIPs.delete(ip);
      this.suspiciousActivity.delete(ip);
      
      const index = this.ddosMetrics.blockedIPs.indexOf(ip);
      if (index > -1) {
        this.ddosMetrics.blockedIPs.splice(index, 1);
      }

      enhancedDbLogger.info('✅ IP разблокирован', { ip });
    }
  }

  /**
   * RUSSIAN: Обновление метрик DDoS
   */
  private updateDDoSMetrics(): void {
    // RUSSIAN: Здесь собираем статистику за последнюю секунду
    // В реальной реализации это будет более сложная логика
    this.ddosMetrics.uniqueIPs = this.memoryStore.size;
    this.ddosMetrics.suspiciousIPs = Array.from(this.suspiciousActivity.keys());
  }

  /**
   * RUSSIAN: Обнаружение подозрительных паттернов
   */
  private detectSuspiciousPatterns(): void {
    if (!this.config.ddosProtection.patternDetection) {
      return;
    }

    // RUSSIAN: Простая эвристика для обнаружения DDoS
    const suspiciousIPCount = this.ddosMetrics.suspiciousIPs.length;
    const blockedIPCount = this.ddosMetrics.blockedIPs.length;

    if (suspiciousIPCount > 10 || blockedIPCount > 5) {
      this.ddosMetrics.patternDetected = true;
      
      enhancedDbLogger.warn('🚨 Обнаружен подозрительный паттерн DDoS', {
        suspiciousIPs: suspiciousIPCount,
        blockedIPs: blockedIPCount
      });

      if (this.config.monitoring.enabled) {
        this.sendDDoSAlert({
          type: 'pattern_detected',
          suspiciousIPCount,
          blockedIPCount,
          timestamp: new Date()
        });
      }
    } else {
      this.ddosMetrics.patternDetected = false;
    }
  }

  /**
   * RUSSIAN: Очистка истекших блокировок
   */
  private cleanupExpiredBlocks(): void {
    // RUSSIAN: Очищаем старые записи подозрительной активности (старше 1 часа)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    for (const [ip, timestamp] of this.suspiciousActivity.entries()) {
      if (timestamp < oneHourAgo) {
        this.suspiciousActivity.delete(ip);
      }
    }
  }

  /**
   * RUSSIAN: Запись запроса для мониторинга
   */
  private recordRequest(req: Request): void {
    const ip = this.getClientIP(req);
    
    // RUSSIAN: Простая статистика запросов в секунду
    if (!this.memoryStore.has('requests_per_second')) {
      this.memoryStore.set('requests_per_second', []);
    }
    
    const requests = this.memoryStore.get('requests_per_second');
    requests.push({ timestamp: Date.now(), ip });
    
    // RUSSIAN: Оставляем только запросы за последнюю секунду
    const oneSecondAgo = Date.now() - 1000;
    const recentRequests = requests.filter((r: any) => r.timestamp > oneSecondAgo);
    this.memoryStore.set('requests_per_second', recentRequests);
    
    this.ddosMetrics.requestsPerSecond = recentRequests.length;
  }

  /**
   * RUSSIAN: Добавление заголовков rate limit в ответ
   */
  private addRateLimitHeaders(res: Response, result: any): void {
    if (!result) return;

    res.set({
      'X-RateLimit-Limit': result.info.total.toString(),
      'X-RateLimit-Remaining': result.info.remaining.toString(),
      'X-RateLimit-Reset': result.info.resetTime.toISOString(),
      'X-RateLimit-Policy': 'enhanced-multi-tier'
    });

    if (result.info.retryAfter) {
      res.set('Retry-After', result.info.retryAfter.toString());
    }
  }

  /**
   * RUSSIAN: Обработка превышения rate limit
   */
  private handleRateLimitExceeded(
    req: Request, 
    res: Response, 
    info: RateLimitInfo, 
    rule: RateLimitRule & { name: string }
  ): void {
    this.addRateLimitHeaders(res, { info });
    
    const response = {
      error: 'Too Many Requests',
      message: 'Превышен лимит запросов. Попробуйте позже.',
      details: {
        limit: info.total,
        remaining: info.remaining,
        resetTime: info.resetTime,
        retryAfter: info.retryAfter,
        rule: rule.name
      },
      timestamp: new Date().toISOString()
    };

    // RUSSIAN: Вызываем callback если определен
    if (rule.onLimitReached) {
      rule.onLimitReached(req, res);
    }

    res.status(429).json(response);
  }

  /**
   * RUSSIAN: Обработка заблокированного IP
   */
  private handleBlocked(req: Request, res: Response, reason: string): void {
    const response = {
      error: 'Access Denied',
      message: 'Доступ запрещен',
      reason,
      timestamp: new Date().toISOString()
    };

    res.status(403).json(response);
  }

  /**
   * RUSSIAN: Отправка DDoS алерта в систему мониторинга
   */
  private sendDDoSAlert(alertData: any): void {
    // RUSSIAN: Интеграция с системой мониторинга будет добавлена
    enhancedDbLogger.warn('🚨 DDoS Alert', alertData);
  }

  /**
   * RUSSIAN: Получение данных из хранилища
   */
  private async getStoredData(key: string): Promise<any> {
    if (this.redisClient) {
      try {
        const data = await this.redisClient.get(key);
        return data ? JSON.parse(data) : { requests: [], lastReset: Date.now() };
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка чтения из Redis', { error, key });
      }
    }

    // RUSSIAN: Локальное хранилище как fallback
    return this.memoryStore.get(key) || { requests: [], lastReset: Date.now() };
  }

  /**
   * RUSSIAN: Сохранение данных в хранилище
   */
  private async storeData(key: string, data: any, ttl: number): Promise<void> {
    if (this.redisClient) {
      try {
        await this.redisClient.setEx(key, Math.ceil(ttl / 1000), JSON.stringify(data));
        return;
      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка записи в Redis', { error, key });
      }
    }

    // RUSSIAN: Локальное хранилище как fallback
    this.memoryStore.set(key, data);
    
    // RUSSIAN: Автоматическое удаление через TTL
    setTimeout(() => {
      this.memoryStore.delete(key);
    }, ttl);
  }

  /**
   * RUSSIAN: Получение текущих метрик DDoS
   */
  public getDDoSMetrics(): DDoSMetrics {
    return { ...this.ddosMetrics };
  }

  /**
   * RUSSIAN: Получение статистики rate limiting
   */
  public getStatistics(): {
    totalRequests: number;
    blockedRequests: number;
    activeBlocks: number;
    suspiciousIPs: number;
    requestsPerSecond: number;
  } {
    return {
      totalRequests: this.memoryStore.get('total_requests') || 0,
      blockedRequests: this.ddosMetrics.totalBlocked,
      activeBlocks: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousActivity.size,
      requestsPerSecond: this.ddosMetrics.requestsPerSecond
    };
  }

  /**
   * RUSSIAN: Ручная блокировка IP
   */
  public async blockIPManually(ip: string, reason: string, duration?: number): Promise<void> {
    this.blockIP(ip, reason);
    
    if (duration && duration !== this.config.ddosProtection.blockDuration) {
      // RUSSIAN: Переопределяем время блокировки
      setTimeout(() => {
        this.unblockIP(ip);
      }, duration * 1000);
    }

    enhancedDbLogger.info('👮 IP заблокирован вручную', { ip, reason, duration });
  }

  /**
   * RUSSIAN: Ручная разблокировка IP
   */
  public async unblockIPManually(ip: string): Promise<void> {
    this.unblockIP(ip);
    enhancedDbLogger.info('👮 IP разблокирован вручную', { ip });
  }

  /**
   * RUSSIAN: Очистка всех блокировок
   */
  public async clearAllBlocks(): Promise<void> {
    const blockedCount = this.blockedIPs.size;
    this.blockedIPs.clear();
    this.suspiciousActivity.clear();
    this.ddosMetrics.blockedIPs = [];
    this.ddosMetrics.suspiciousIPs = [];

    enhancedDbLogger.info('🧹 Все блокировки очищены', { clearedCount: blockedCount });
  }

  /**
   * RUSSIAN: Закрытие соединений и очистка ресурсов
   */
  public async shutdown(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }

    this.memoryStore.clear();
    this.blockedIPs.clear();
    this.suspiciousActivity.clear();

    enhancedDbLogger.info('🔒 Rate Limiter остановлен');
  }
}

/**
 * RUSSIAN: Дефолтная конфигурация для crypto-mixer
 */
export const defaultRateLimitConfig: RateLimitConfig = {
  global: {
    windowMs: 15 * 60 * 1000,  // 15 минут
    maxRequests: 1000,         // 1000 запросов на IP
    whitelist: [
      '127.0.0.1',
      '::1',
      '10.0.0.0/8',    // Локальная сеть
      '172.16.0.0/12', // Локальная сеть
      '192.168.0.0/16' // Локальная сеть
    ],
    blacklist: []
  },
  
  endpoints: {
    '/api/v1/mix': {
      windowMs: 10 * 60 * 1000,  // 10 минут
      maxRequests: 5,            // Только 5 операций микширования
      skipSuccessfulRequests: false,
      skipFailedRequests: true
    },
    '/api/v1/auth/login': {
      windowMs: 15 * 60 * 1000,  // 15 минут
      maxRequests: 10,           // 10 попыток входа
      skipSuccessfulRequests: true,
      skipFailedRequests: false
    },
    '/api/v1/auth/register': {
      windowMs: 60 * 60 * 1000,  // 1 час
      maxRequests: 3,            // 3 регистрации с IP
      skipSuccessfulRequests: false,
      skipFailedRequests: false
    },
    '/api/v1/wallet/create': {
      windowMs: 60 * 60 * 1000,  // 1 час
      maxRequests: 10,           // 10 новых кошельков
      skipSuccessfulRequests: false,
      skipFailedRequests: true
    }
  },
  
  user: {
    windowMs: 60 * 1000,       // 1 минута
    maxRequests: 100,          // 100 запросов на пользователя
    keyGenerator: (req) => `user:${req.user && 'id' in req.user ? req.user.id : 'anonymous'}`
  },
  
  critical: {
    windowMs: 5 * 60 * 1000,   // 5 минут
    maxRequests: 3,            // Только 3 критические операции
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  
  adaptive: {
    enabled: true,
    cpuThreshold: 80,          // При CPU > 80%
    memoryThreshold: 85,       // При памяти > 85%
    throttleFactor: 0.5        // Уменьшаем лимиты в 2 раза
  },
  
  ddosProtection: {
    enabled: true,
    suspiciousThreshold: 50,   // 50 блокировок = подозрение
    blockDuration: 300,        // 5 минут блокировки
    patternDetection: true
  },
  
  redis: {
    enabled: process.env.REDIS_URL ? true : false,
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'crypto_mixer:rate_limit'
  },
  
  monitoring: {
    enabled: true,
    alertThreshold: 10         // Алерт при 10+ блокировках в минуту
  }
};