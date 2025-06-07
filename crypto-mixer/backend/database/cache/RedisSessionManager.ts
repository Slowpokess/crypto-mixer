/**
 * Redis Session Manager для криптомиксера
 * 
 * Управляет:
 * - Пользовательские сессии и временные токены
 * - Rate limiting и anti-spam защита
 * - Distributed locks для критических операций
 * - Временные данные и промежуточные результаты
 * - User fingerprinting и fraud detection
 */

import { RedisCacheLayer } from './RedisCacheLayer';
import { enhancedDbLogger } from '../logger';
import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';

export interface UserSession {
  id: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  fingerprint: string;
  createdAt: Date;
  lastActivity: Date;
  isAuthenticated: boolean;
  permissions: string[];
  metadata: Record<string, any>;
}

export interface RateLimitData {
  key: string;
  requests: number;
  resetTime: Date;
  blocked: boolean;
  firstRequest: Date;
}

export interface DistributedLock {
  key: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export interface AntiSpamData {
  identifier: string; // IP, fingerprint, etc.
  requestCount: number;
  suspiciousActivity: string[];
  riskScore: number;
  lastRequest: Date;
  blocked: boolean;
  blockReason?: string;
}

/**
 * Высокопроизводительный Session Manager на Redis
 */
export class RedisSessionManager extends EventEmitter {
  private cache: RedisCacheLayer;

  // Prefixes для разных типов данных
  private readonly PREFIXES = {
    SESSION: 'session:',
    RATE_LIMIT: 'rate_limit:',
    LOCK: 'lock:',
    ANTI_SPAM: 'anti_spam:',
    TEMP_DATA: 'temp_data:',
    TOKEN: 'token:',
    FINGERPRINT: 'fingerprint:',
    IP_TRACKING: 'ip_track:'
  };

  // TTL константы
  private readonly TTL = {
    SESSION: 3600 * 2, // 2 часа
    RATE_LIMIT: 3600, // 1 час
    LOCK: 300, // 5 минут
    ANTI_SPAM: 3600 * 24, // 24 часа
    TEMP_DATA: 1800, // 30 минут
    TOKEN: 3600, // 1 час
    FINGERPRINT: 3600 * 24 * 7, // 1 неделя
    IP_TRACKING: 3600 * 24 // 24 часа
  };

  constructor(cache: RedisCacheLayer) {
    super();
    this.cache = cache;
    
    enhancedDbLogger.info('🔐 RedisSessionManager инициализирован');
  }

  /**
   * SESSION MANAGEMENT
   */

  /**
   * Создание новой пользовательской сессии
   */
  async createSession(
    ipAddress: string,
    userAgent: string,
    userId?: string
  ): Promise<UserSession> {
    try {
      const sessionId = this.generateSecureId();
      const fingerprint = this.generateFingerprint(ipAddress, userAgent);
      
      const session: UserSession = {
        id: sessionId,
        userId,
        ipAddress,
        userAgent,
        fingerprint,
        createdAt: new Date(),
        lastActivity: new Date(),
        isAuthenticated: !!userId,
        permissions: [],
        metadata: {}
      };

      const key = `${this.PREFIXES.SESSION}${sessionId}`;
      await this.cache.set(key, session, this.TTL.SESSION);

      // Индексируем по fingerprint для fraud detection
      const fingerprintKey = `${this.PREFIXES.FINGERPRINT}${fingerprint}`;
      const existingSessions = await this.cache.get<string[]>(fingerprintKey) || [];
      existingSessions.push(sessionId);
      await this.cache.set(fingerprintKey, existingSessions, this.TTL.FINGERPRINT);

      enhancedDbLogger.debug('🔑 Новая сессия создана', { 
        sessionId, 
        fingerprint: fingerprint.substring(0, 16),
        isAuthenticated: session.isAuthenticated 
      });

      this.emit('session_created', session);
      return session;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка создания сессии', { ipAddress, error });
      throw error;
    }
  }

  /**
   * Получение сессии
   */
  async getSession(sessionId: string): Promise<UserSession | null> {
    try {
      const key = `${this.PREFIXES.SESSION}${sessionId}`;
      const session = await this.cache.get<UserSession>(key);

      if (session) {
        // Обновляем время последней активности
        session.lastActivity = new Date();
        await this.cache.set(key, session, this.TTL.SESSION);
      }

      return session;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения сессии', { sessionId, error });
      return null;
    }
  }

  /**
   * Обновление сессии
   */
  async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return false;

      const updatedSession: UserSession = {
        ...session,
        ...updates,
        lastActivity: new Date()
      };

      const key = `${this.PREFIXES.SESSION}${sessionId}`;
      await this.cache.set(key, updatedSession, this.TTL.SESSION);

      enhancedDbLogger.debug('🔄 Сессия обновлена', { sessionId });
      this.emit('session_updated', updatedSession);

      return true;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка обновления сессии', { sessionId, error });
      return false;
    }
  }

  /**
   * Удаление сессии (logout)
   */
  async destroySession(sessionId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return false;

      const key = `${this.PREFIXES.SESSION}${sessionId}`;
      const deleted = await this.cache.delete(key);

      if (deleted) {
        enhancedDbLogger.debug('🗑️ Сессия удалена', { sessionId });
        this.emit('session_destroyed', { sessionId, userId: session.userId });
      }

      return deleted;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка удаления сессии', { sessionId, error });
      return false;
    }
  }

  /**
   * RATE LIMITING
   */

  /**
   * Проверка и обновление rate limit
   */
  async checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    try {
      const key = `${this.PREFIXES.RATE_LIMIT}${identifier}`;
      const now = new Date();
      
      let rateLimitData = await this.cache.get<RateLimitData>(key);
      
      if (!rateLimitData) {
        // Первый запрос
        rateLimitData = {
          key: identifier,
          requests: 1,
          resetTime: new Date(now.getTime() + windowMs),
          blocked: false,
          firstRequest: now
        };
        
        await this.cache.set(key, rateLimitData, Math.ceil(windowMs / 1000));
        
        return {
          allowed: true,
          remaining: maxRequests - 1,
          resetTime: rateLimitData.resetTime
        };
      }

      // Проверяем, не истек ли window
      if (now >= rateLimitData.resetTime) {
        // Сбрасываем счетчик
        rateLimitData = {
          key: identifier,
          requests: 1,
          resetTime: new Date(now.getTime() + windowMs),
          blocked: false,
          firstRequest: now
        };
        
        await this.cache.set(key, rateLimitData, Math.ceil(windowMs / 1000));
        
        return {
          allowed: true,
          remaining: maxRequests - 1,
          resetTime: rateLimitData.resetTime
        };
      }

      // Увеличиваем счетчик
      rateLimitData.requests++;
      
      const allowed = rateLimitData.requests <= maxRequests;
      const remaining = Math.max(0, maxRequests - rateLimitData.requests);

      if (!allowed && !rateLimitData.blocked) {
        rateLimitData.blocked = true;
        enhancedDbLogger.warn('🚫 Rate limit превышен', { 
          identifier: identifier.substring(0, 16) + '...',
          requests: rateLimitData.requests,
          maxRequests 
        });
        
        this.emit('rate_limit_exceeded', { identifier, requests: rateLimitData.requests });
      }

      await this.cache.set(key, rateLimitData, Math.ceil(windowMs / 1000));

      return {
        allowed,
        remaining,
        resetTime: rateLimitData.resetTime
      };

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки rate limit', { identifier, error });
      // В случае ошибки разрешаем запрос
      return {
        allowed: true,
        remaining: maxRequests,
        resetTime: new Date(Date.now() + windowMs)
      };
    }
  }

  /**
   * DISTRIBUTED LOCKING
   */

  /**
   * Получение distributed lock
   */
  async acquireLock(
    lockKey: string,
    timeoutMs: number = 30000,
    owner?: string
  ): Promise<{ acquired: boolean; lock?: DistributedLock }> {
    try {
      const lockOwner = owner || this.generateSecureId();
      const key = `${this.PREFIXES.LOCK}${lockKey}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + timeoutMs);

      // Пытаемся получить lock с помощью SET NX EX
      const acquired = await this.cache.executeCommand('set', [
        key,
        lockOwner,
        'PX',
        timeoutMs,
        'NX'
      ], false);

      if (acquired === 'OK') {
        const lock: DistributedLock = {
          key: lockKey,
          owner: lockOwner,
          acquiredAt: now,
          expiresAt
        };

        enhancedDbLogger.debug('🔒 Distributed lock получен', { 
          lockKey, 
          owner: lockOwner.substring(0, 16) 
        });

        this.emit('lock_acquired', lock);

        return { acquired: true, lock };
      }

      return { acquired: false };

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения distributed lock', { lockKey, error });
      return { acquired: false };
    }
  }

  /**
   * Освобождение distributed lock
   */
  async releaseLock(lockKey: string, owner: string): Promise<boolean> {
    try {
      const key = `${this.PREFIXES.LOCK}${lockKey}`;
      
      // Lua script для atomic check and delete
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.cache.executeCommand('eval', [
        luaScript,
        1,
        key,
        owner
      ], false);

      const released = result === 1;

      if (released) {
        enhancedDbLogger.debug('🔓 Distributed lock освобожден', { 
          lockKey, 
          owner: owner.substring(0, 16) 
        });
        
        this.emit('lock_released', { lockKey, owner });
      }

      return released;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка освобождения distributed lock', { lockKey, error });
      return false;
    }
  }

  /**
   * ANTI-SPAM & FRAUD DETECTION
   */

  /**
   * Отслеживание подозрительной активности
   */
  async trackSuspiciousActivity(
    identifier: string,
    activity: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  ): Promise<AntiSpamData> {
    try {
      const key = `${this.PREFIXES.ANTI_SPAM}${identifier}`;
      
      let antiSpamData = await this.cache.get<AntiSpamData>(key);
      
      if (!antiSpamData) {
        antiSpamData = {
          identifier,
          requestCount: 1,
          suspiciousActivity: [activity],
          riskScore: this.calculateRiskScore(activity, severity),
          lastRequest: new Date(),
          blocked: false
        };
      } else {
        antiSpamData.requestCount++;
        antiSpamData.suspiciousActivity.push(activity);
        antiSpamData.riskScore += this.calculateRiskScore(activity, severity);
        antiSpamData.lastRequest = new Date();

        // Блокируем если risk score слишком высокий
        if (antiSpamData.riskScore >= 100 && !antiSpamData.blocked) {
          antiSpamData.blocked = true;
          antiSpamData.blockReason = 'Suspicious activity threshold exceeded';
          
          enhancedDbLogger.warn('🚫 Пользователь заблокирован за подозрительную активность', {
            identifier: identifier.substring(0, 16) + '...',
            riskScore: antiSpamData.riskScore,
            activities: antiSpamData.suspiciousActivity.length
          });

          this.emit('user_blocked', antiSpamData);
        }
      }

      await this.cache.set(key, antiSpamData, this.TTL.ANTI_SPAM);

      return antiSpamData;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отслеживания подозрительной активности', { 
        identifier, 
        activity, 
        error 
      });
      throw error;
    }
  }

  /**
   * Проверка, заблокирован ли пользователь
   */
  async isBlocked(identifier: string): Promise<boolean> {
    try {
      const key = `${this.PREFIXES.ANTI_SPAM}${identifier}`;
      const antiSpamData = await this.cache.get<AntiSpamData>(key);
      
      return antiSpamData?.blocked || false;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки блокировки', { identifier, error });
      return false;
    }
  }

  /**
   * TEMPORARY DATA MANAGEMENT
   */

  /**
   * Сохранение временных данных
   */
  async setTempData(
    key: string,
    data: any,
    ttlSeconds: number = this.TTL.TEMP_DATA
  ): Promise<void> {
    try {
      const fullKey = `${this.PREFIXES.TEMP_DATA}${key}`;
      await this.cache.set(fullKey, data, ttlSeconds);

      enhancedDbLogger.debug('📝 Временные данные сохранены', { key, ttl: ttlSeconds });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка сохранения временных данных', { key, error });
      throw error;
    }
  }

  /**
   * Получение временных данных
   */
  async getTempData<T = any>(key: string): Promise<T | null> {
    try {
      const fullKey = `${this.PREFIXES.TEMP_DATA}${key}`;
      return await this.cache.get<T>(fullKey);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка получения временных данных', { key, error });
      return null;
    }
  }

  /**
   * Удаление временных данных
   */
  async deleteTempData(key: string): Promise<boolean> {
    try {
      const fullKey = `${this.PREFIXES.TEMP_DATA}${key}`;
      return await this.cache.delete(fullKey);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка удаления временных данных', { key, error });
      return false;
    }
  }

  /**
   * TOKEN MANAGEMENT
   */

  /**
   * Создание временного токена
   */
  async createToken(
    purpose: string,
    data: any,
    ttlSeconds: number = this.TTL.TOKEN
  ): Promise<string> {
    try {
      const token = this.generateSecureToken();
      const key = `${this.PREFIXES.TOKEN}${token}`;
      
      const tokenData = {
        purpose,
        data,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000)
      };

      await this.cache.set(key, tokenData, ttlSeconds);

      enhancedDbLogger.debug('🎫 Токен создан', { 
        token: token.substring(0, 16) + '...',
        purpose,
        ttl: ttlSeconds 
      });

      return token;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка создания токена', { purpose, error });
      throw error;
    }
  }

  /**
   * Валидация токена
   */
  async validateToken(token: string, expectedPurpose?: string): Promise<any | null> {
    try {
      const key = `${this.PREFIXES.TOKEN}${token}`;
      const tokenData = await this.cache.get(key);

      if (!tokenData) return null;

      if (expectedPurpose && tokenData.purpose !== expectedPurpose) {
        enhancedDbLogger.warn('⚠️ Токен используется не по назначению', { 
          token: token.substring(0, 16) + '...',
          expected: expectedPurpose,
          actual: tokenData.purpose 
        });
        return null;
      }

      return tokenData.data;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка валидации токена', { 
        token: token.substring(0, 16) + '...',
        error 
      });
      return null;
    }
  }

  /**
   * Удаление токена (одноразовое использование)
   */
  async consumeToken(token: string, expectedPurpose?: string): Promise<any | null> {
    try {
      const data = await this.validateToken(token, expectedPurpose);
      if (!data) return null;

      const key = `${this.PREFIXES.TOKEN}${token}`;
      await this.cache.delete(key);

      enhancedDbLogger.debug('🎫 Токен использован и удален', { 
        token: token.substring(0, 16) + '...' 
      });

      return data;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка использования токена', { 
        token: token.substring(0, 16) + '...',
        error 
      });
      return null;
    }
  }

  /**
   * UTILITY METHODS
   */

  /**
   * Генерация безопасного ID
   */
  private generateSecureId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Генерация безопасного токена
   */
  private generateSecureToken(): string {
    return randomBytes(48).toString('base64url');
  }

  /**
   * Генерация fingerprint пользователя
   */
  private generateFingerprint(ipAddress: string, userAgent: string): string {
    const data = `${ipAddress}:${userAgent}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Расчет risk score для активности
   */
  private calculateRiskScore(activity: string, severity: 'LOW' | 'MEDIUM' | 'HIGH'): number {
    const baseScores = {
      'LOW': 5,
      'MEDIUM': 15,
      'HIGH': 30
    };

    const activityMultipliers: Record<string, number> = {
      'rapid_requests': 2,
      'suspicious_ip': 1.5,
      'invalid_parameters': 1.2,
      'potential_bot': 2.5,
      'blacklisted_address': 3,
      'unusual_pattern': 1.8
    };

    const baseScore = baseScores[severity];
    const multiplier = activityMultipliers[activity] || 1;

    return Math.round(baseScore * multiplier);
  }

  /**
   * Получение статистики сессий
   */
  getSessionStats(): any {
    return {
      ...this.cache.getStats(),
      prefixes: Object.keys(this.PREFIXES),
      ttlSettings: this.TTL
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    enhancedDbLogger.info('🔄 Остановка RedisSessionManager...');
    
    this.removeAllListeners();
    
    enhancedDbLogger.info('✅ RedisSessionManager остановлен');
  }
}

export default RedisSessionManager;