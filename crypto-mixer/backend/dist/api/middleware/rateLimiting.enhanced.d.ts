import { Request, Response, NextFunction } from 'express';
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
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    keyGenerator?: (req: Request) => string;
    onLimitReached?: (req: Request, res: Response) => void;
    whitelist?: string[];
    blacklist?: string[];
}
export interface RateLimitConfig {
    global: RateLimitRule;
    endpoints: {
        [endpoint: string]: RateLimitRule;
    };
    user: RateLimitRule;
    critical: RateLimitRule;
    adaptive: {
        enabled: boolean;
        cpuThreshold: number;
        memoryThreshold: number;
        throttleFactor: number;
    };
    ddosProtection: {
        enabled: boolean;
        suspiciousThreshold: number;
        blockDuration: number;
        patternDetection: boolean;
    };
    redis: {
        enabled: boolean;
        url: string;
        keyPrefix: string;
    };
    monitoring: {
        enabled: boolean;
        alertThreshold: number;
    };
}
export interface RateLimitInfo {
    total: number;
    remaining: number;
    resetTime: Date;
    retryAfter?: number;
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
export declare class EnhancedRateLimiter {
    private config;
    private redisClient;
    private memoryStore;
    private ddosMetrics;
    private blockedIPs;
    private suspiciousActivity;
    constructor(config: RateLimitConfig);
    /**
     * RUSSIAN: Инициализация Redis для распределенного rate limiting
     */
    private initializeRedis;
    /**
     * RUSSIAN: Запуск мониторинга DDoS атак
     */
    private startDDoSMonitoring;
    /**
     * RUSSIAN: Главный middleware для rate limiting
     */
    middleware(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * RUSSIAN: Проверка rate limit для конкретного правила
     */
    private checkRateLimit;
    /**
     * RUSSIAN: Получение применимых правил для запроса
     */
    private getApplicableRules;
    /**
     * RUSSIAN: Генерация ключа для хранения
     */
    private generateKey;
    /**
     * RUSSIAN: Получение IP адреса клиента с учетом прокси
     */
    private getClientIP;
    /**
     * RUSSIAN: Проверка IP в белом списке
     */
    private isWhitelisted;
    /**
     * RUSSIAN: Проверка IP в черном списке
     */
    private isBlacklisted;
    /**
     * RUSSIAN: Проверка попадания IP в CIDR подсеть
     */
    private isIPInCIDR;
    /**
     * RUSSIAN: Конвертация IP в число
     */
    private ipToNumber;
    /**
     * RUSSIAN: Получение паттерна эндпоинта
     */
    private getEndpointPattern;
    /**
     * RUSSIAN: Проверка критического эндпоинта
     */
    private isCriticalEndpoint;
    /**
     * RUSSIAN: Получение эффективного лимита с учетом адаптивного throttling
     */
    private getEffectiveLimit;
    /**
     * RUSSIAN: Запись подозрительной активности
     */
    private recordSuspiciousActivity;
    /**
     * RUSSIAN: Блокировка IP адреса
     */
    private blockIP;
    /**
     * RUSSIAN: Разблокировка IP адреса
     */
    private unblockIP;
    /**
     * RUSSIAN: Обновление метрик DDoS
     */
    private updateDDoSMetrics;
    /**
     * RUSSIAN: Обнаружение подозрительных паттернов
     */
    private detectSuspiciousPatterns;
    /**
     * RUSSIAN: Очистка истекших блокировок
     */
    private cleanupExpiredBlocks;
    /**
     * RUSSIAN: Запись запроса для мониторинга
     */
    private recordRequest;
    /**
     * RUSSIAN: Добавление заголовков rate limit в ответ
     */
    private addRateLimitHeaders;
    /**
     * RUSSIAN: Обработка превышения rate limit
     */
    private handleRateLimitExceeded;
    /**
     * RUSSIAN: Обработка заблокированного IP
     */
    private handleBlocked;
    /**
     * RUSSIAN: Отправка DDoS алерта в систему мониторинга
     */
    private sendDDoSAlert;
    /**
     * RUSSIAN: Получение данных из хранилища
     */
    private getStoredData;
    /**
     * RUSSIAN: Сохранение данных в хранилище
     */
    private storeData;
    /**
     * RUSSIAN: Получение текущих метрик DDoS
     */
    getDDoSMetrics(): DDoSMetrics;
    /**
     * RUSSIAN: Получение статистики rate limiting
     */
    getStatistics(): {
        totalRequests: number;
        blockedRequests: number;
        activeBlocks: number;
        suspiciousIPs: number;
        requestsPerSecond: number;
    };
    /**
     * RUSSIAN: Ручная блокировка IP
     */
    blockIPManually(ip: string, reason: string, duration?: number): Promise<void>;
    /**
     * RUSSIAN: Ручная разблокировка IP
     */
    unblockIPManually(ip: string): Promise<void>;
    /**
     * RUSSIAN: Очистка всех блокировок
     */
    clearAllBlocks(): Promise<void>;
    /**
     * RUSSIAN: Закрытие соединений и очистка ресурсов
     */
    shutdown(): Promise<void>;
}
/**
 * RUSSIAN: Дефолтная конфигурация для crypto-mixer
 */
export declare const defaultRateLimitConfig: RateLimitConfig;
