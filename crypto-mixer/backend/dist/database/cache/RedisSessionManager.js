"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisSessionManager = void 0;
const logger_1 = require("../logger");
const events_1 = require("events");
const crypto_1 = require("crypto");
/**
 * Высокопроизводительный Session Manager на Redis
 */
class RedisSessionManager extends events_1.EventEmitter {
    constructor(cache) {
        super();
        // Prefixes для разных типов данных
        this.PREFIXES = {
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
        this.TTL = {
            SESSION: 3600 * 2, // 2 часа
            RATE_LIMIT: 3600, // 1 час
            LOCK: 300, // 5 минут
            ANTI_SPAM: 3600 * 24, // 24 часа
            TEMP_DATA: 1800, // 30 минут
            TOKEN: 3600, // 1 час
            FINGERPRINT: 3600 * 24 * 7, // 1 неделя
            IP_TRACKING: 3600 * 24 // 24 часа
        };
        this.cache = cache;
        logger_1.enhancedDbLogger.info('🔐 RedisSessionManager инициализирован');
    }
    /**
     * SESSION MANAGEMENT
     */
    /**
     * Создание новой пользовательской сессии
     */
    async createSession(ipAddress, userAgent, userId) {
        try {
            const sessionId = this.generateSecureId();
            const fingerprint = this.generateFingerprint(ipAddress, userAgent);
            const session = {
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
            const existingSessions = await this.cache.get(fingerprintKey) || [];
            existingSessions.push(sessionId);
            await this.cache.set(fingerprintKey, existingSessions, this.TTL.FINGERPRINT);
            logger_1.enhancedDbLogger.debug('🔑 Новая сессия создана', {
                sessionId,
                fingerprint: fingerprint.substring(0, 16),
                isAuthenticated: session.isAuthenticated
            });
            this.emit('session_created', session);
            return session;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка создания сессии', { ipAddress, error });
            throw error;
        }
    }
    /**
     * Получение сессии
     */
    async getSession(sessionId) {
        try {
            const key = `${this.PREFIXES.SESSION}${sessionId}`;
            const session = await this.cache.get(key);
            if (session) {
                // Обновляем время последней активности
                session.lastActivity = new Date();
                await this.cache.set(key, session, this.TTL.SESSION);
            }
            return session;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения сессии', { sessionId, error });
            return null;
        }
    }
    /**
     * Обновление сессии
     */
    async updateSession(sessionId, updates) {
        try {
            const session = await this.getSession(sessionId);
            if (!session)
                return false;
            const updatedSession = {
                ...session,
                ...updates,
                lastActivity: new Date()
            };
            const key = `${this.PREFIXES.SESSION}${sessionId}`;
            await this.cache.set(key, updatedSession, this.TTL.SESSION);
            logger_1.enhancedDbLogger.debug('🔄 Сессия обновлена', { sessionId });
            this.emit('session_updated', updatedSession);
            return true;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка обновления сессии', { sessionId, error });
            return false;
        }
    }
    /**
     * Удаление сессии (logout)
     */
    async destroySession(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            if (!session)
                return false;
            const key = `${this.PREFIXES.SESSION}${sessionId}`;
            const deleted = await this.cache.delete(key);
            if (deleted) {
                logger_1.enhancedDbLogger.debug('🗑️ Сессия удалена', { sessionId });
                this.emit('session_destroyed', { sessionId, userId: session.userId });
            }
            return deleted;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка удаления сессии', { sessionId, error });
            return false;
        }
    }
    /**
     * RATE LIMITING
     */
    /**
     * Проверка и обновление rate limit
     */
    async checkRateLimit(identifier, maxRequests, windowMs) {
        try {
            const key = `${this.PREFIXES.RATE_LIMIT}${identifier}`;
            const now = new Date();
            let rateLimitData = await this.cache.get(key);
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
                logger_1.enhancedDbLogger.warn('🚫 Rate limit превышен', {
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
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка проверки rate limit', { identifier, error });
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
    async acquireLock(lockKey, timeoutMs = 30000, owner) {
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
                const lock = {
                    key: lockKey,
                    owner: lockOwner,
                    acquiredAt: now,
                    expiresAt
                };
                logger_1.enhancedDbLogger.debug('🔒 Distributed lock получен', {
                    lockKey,
                    owner: lockOwner.substring(0, 16)
                });
                this.emit('lock_acquired', lock);
                return { acquired: true, lock };
            }
            return { acquired: false };
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения distributed lock', { lockKey, error });
            return { acquired: false };
        }
    }
    /**
     * Освобождение distributed lock
     */
    async releaseLock(lockKey, owner) {
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
                logger_1.enhancedDbLogger.debug('🔓 Distributed lock освобожден', {
                    lockKey,
                    owner: owner.substring(0, 16)
                });
                this.emit('lock_released', { lockKey, owner });
            }
            return released;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка освобождения distributed lock', { lockKey, error });
            return false;
        }
    }
    /**
     * ANTI-SPAM & FRAUD DETECTION
     */
    /**
     * Отслеживание подозрительной активности
     */
    async trackSuspiciousActivity(identifier, activity, severity = 'MEDIUM') {
        try {
            const key = `${this.PREFIXES.ANTI_SPAM}${identifier}`;
            let antiSpamData = await this.cache.get(key);
            if (!antiSpamData) {
                antiSpamData = {
                    identifier,
                    requestCount: 1,
                    suspiciousActivity: [activity],
                    riskScore: this.calculateRiskScore(activity, severity),
                    lastRequest: new Date(),
                    blocked: false
                };
            }
            else {
                antiSpamData.requestCount++;
                antiSpamData.suspiciousActivity.push(activity);
                antiSpamData.riskScore += this.calculateRiskScore(activity, severity);
                antiSpamData.lastRequest = new Date();
                // Блокируем если risk score слишком высокий
                if (antiSpamData.riskScore >= 100 && !antiSpamData.blocked) {
                    antiSpamData.blocked = true;
                    antiSpamData.blockReason = 'Suspicious activity threshold exceeded';
                    logger_1.enhancedDbLogger.warn('🚫 Пользователь заблокирован за подозрительную активность', {
                        identifier: identifier.substring(0, 16) + '...',
                        riskScore: antiSpamData.riskScore,
                        activities: antiSpamData.suspiciousActivity.length
                    });
                    this.emit('user_blocked', antiSpamData);
                }
            }
            await this.cache.set(key, antiSpamData, this.TTL.ANTI_SPAM);
            return antiSpamData;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка отслеживания подозрительной активности', {
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
    async isBlocked(identifier) {
        try {
            const key = `${this.PREFIXES.ANTI_SPAM}${identifier}`;
            const antiSpamData = await this.cache.get(key);
            return antiSpamData?.blocked || false;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка проверки блокировки', { identifier, error });
            return false;
        }
    }
    /**
     * TEMPORARY DATA MANAGEMENT
     */
    /**
     * Сохранение временных данных
     */
    async setTempData(key, data, ttlSeconds = this.TTL.TEMP_DATA) {
        try {
            const fullKey = `${this.PREFIXES.TEMP_DATA}${key}`;
            await this.cache.set(fullKey, data, ttlSeconds);
            logger_1.enhancedDbLogger.debug('📝 Временные данные сохранены', { key, ttl: ttlSeconds });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка сохранения временных данных', { key, error });
            throw error;
        }
    }
    /**
     * Получение временных данных
     */
    async getTempData(key) {
        try {
            const fullKey = `${this.PREFIXES.TEMP_DATA}${key}`;
            return await this.cache.get(fullKey);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка получения временных данных', { key, error });
            return null;
        }
    }
    /**
     * Удаление временных данных
     */
    async deleteTempData(key) {
        try {
            const fullKey = `${this.PREFIXES.TEMP_DATA}${key}`;
            return await this.cache.delete(fullKey);
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка удаления временных данных', { key, error });
            return false;
        }
    }
    /**
     * TOKEN MANAGEMENT
     */
    /**
     * Создание временного токена
     */
    async createToken(purpose, data, ttlSeconds = this.TTL.TOKEN) {
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
            logger_1.enhancedDbLogger.debug('🎫 Токен создан', {
                token: token.substring(0, 16) + '...',
                purpose,
                ttl: ttlSeconds
            });
            return token;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка создания токена', { purpose, error });
            throw error;
        }
    }
    /**
     * Валидация токена
     */
    async validateToken(token, expectedPurpose) {
        try {
            const key = `${this.PREFIXES.TOKEN}${token}`;
            const tokenData = await this.cache.get(key);
            if (!tokenData)
                return null;
            if (expectedPurpose && tokenData.purpose !== expectedPurpose) {
                logger_1.enhancedDbLogger.warn('⚠️ Токен используется не по назначению', {
                    token: token.substring(0, 16) + '...',
                    expected: expectedPurpose,
                    actual: tokenData.purpose
                });
                return null;
            }
            return tokenData.data;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка валидации токена', {
                token: token.substring(0, 16) + '...',
                error
            });
            return null;
        }
    }
    /**
     * Удаление токена (одноразовое использование)
     */
    async consumeToken(token, expectedPurpose) {
        try {
            const data = await this.validateToken(token, expectedPurpose);
            if (!data)
                return null;
            const key = `${this.PREFIXES.TOKEN}${token}`;
            await this.cache.delete(key);
            logger_1.enhancedDbLogger.debug('🎫 Токен использован и удален', {
                token: token.substring(0, 16) + '...'
            });
            return data;
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка использования токена', {
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
    generateSecureId() {
        return (0, crypto_1.randomBytes)(32).toString('hex');
    }
    /**
     * Генерация безопасного токена
     */
    generateSecureToken() {
        return (0, crypto_1.randomBytes)(48).toString('base64url');
    }
    /**
     * Генерация fingerprint пользователя
     */
    generateFingerprint(ipAddress, userAgent) {
        const data = `${ipAddress}:${userAgent}`;
        return (0, crypto_1.createHash)('sha256').update(data).digest('hex');
    }
    /**
     * Расчет risk score для активности
     */
    calculateRiskScore(activity, severity) {
        const baseScores = {
            'LOW': 5,
            'MEDIUM': 15,
            'HIGH': 30
        };
        const activityMultipliers = {
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
    getSessionStats() {
        return {
            ...this.cache.getStats(),
            prefixes: Object.keys(this.PREFIXES),
            ttlSettings: this.TTL
        };
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger_1.enhancedDbLogger.info('🔄 Остановка RedisSessionManager...');
        this.removeAllListeners();
        logger_1.enhancedDbLogger.info('✅ RedisSessionManager остановлен');
    }
}
exports.RedisSessionManager = RedisSessionManager;
exports.default = RedisSessionManager;
//# sourceMappingURL=RedisSessionManager.js.map