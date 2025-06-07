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
import { EventEmitter } from 'events';
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
    identifier: string;
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
export declare class RedisSessionManager extends EventEmitter {
    private cache;
    private readonly PREFIXES;
    private readonly TTL;
    constructor(cache: RedisCacheLayer);
    /**
     * SESSION MANAGEMENT
     */
    /**
     * Создание новой пользовательской сессии
     */
    createSession(ipAddress: string, userAgent: string, userId?: string): Promise<UserSession>;
    /**
     * Получение сессии
     */
    getSession(sessionId: string): Promise<UserSession | null>;
    /**
     * Обновление сессии
     */
    updateSession(sessionId: string, updates: Partial<UserSession>): Promise<boolean>;
    /**
     * Удаление сессии (logout)
     */
    destroySession(sessionId: string): Promise<boolean>;
    /**
     * RATE LIMITING
     */
    /**
     * Проверка и обновление rate limit
     */
    checkRateLimit(identifier: string, maxRequests: number, windowMs: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetTime: Date;
    }>;
    /**
     * DISTRIBUTED LOCKING
     */
    /**
     * Получение distributed lock
     */
    acquireLock(lockKey: string, timeoutMs?: number, owner?: string): Promise<{
        acquired: boolean;
        lock?: DistributedLock;
    }>;
    /**
     * Освобождение distributed lock
     */
    releaseLock(lockKey: string, owner: string): Promise<boolean>;
    /**
     * ANTI-SPAM & FRAUD DETECTION
     */
    /**
     * Отслеживание подозрительной активности
     */
    trackSuspiciousActivity(identifier: string, activity: string, severity?: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<AntiSpamData>;
    /**
     * Проверка, заблокирован ли пользователь
     */
    isBlocked(identifier: string): Promise<boolean>;
    /**
     * TEMPORARY DATA MANAGEMENT
     */
    /**
     * Сохранение временных данных
     */
    setTempData(key: string, data: any, ttlSeconds?: number): Promise<void>;
    /**
     * Получение временных данных
     */
    getTempData<T = any>(key: string): Promise<T | null>;
    /**
     * Удаление временных данных
     */
    deleteTempData(key: string): Promise<boolean>;
    /**
     * TOKEN MANAGEMENT
     */
    /**
     * Создание временного токена
     */
    createToken(purpose: string, data: any, ttlSeconds?: number): Promise<string>;
    /**
     * Валидация токена
     */
    validateToken(token: string, expectedPurpose?: string): Promise<any | null>;
    /**
     * Удаление токена (одноразовое использование)
     */
    consumeToken(token: string, expectedPurpose?: string): Promise<any | null>;
    /**
     * UTILITY METHODS
     */
    /**
     * Генерация безопасного ID
     */
    private generateSecureId;
    /**
     * Генерация безопасного токена
     */
    private generateSecureToken;
    /**
     * Генерация fingerprint пользователя
     */
    private generateFingerprint;
    /**
     * Расчет risk score для активности
     */
    private calculateRiskScore;
    /**
     * Получение статистики сессий
     */
    getSessionStats(): any;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
}
export default RedisSessionManager;
