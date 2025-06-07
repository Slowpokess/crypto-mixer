import { Request, Response, NextFunction, Express } from 'express';
import { RateLimitConfig } from './rateLimiting.enhanced';
import { DDoSConfig } from './ddosProtection';
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
    rateLimiting: RateLimitConfig;
    ddosProtection: DDoSConfig;
    global: {
        trustProxy: boolean;
        logLevel: 'debug' | 'info' | 'warn' | 'error';
        blockDuration: number;
        whitelistBypass: boolean;
    };
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
    autoActions: {
        escalateToCloudflare: boolean;
        banPersistentAttackers: boolean;
        adaptiveThresholds: boolean;
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
export declare class SecurityMiddleware {
    private config;
    private rateLimiter;
    private ddosProtection;
    private isActive;
    private securityStats;
    private securityEvents;
    private maxEventsHistory;
    private emergencyMode;
    constructor(config?: Partial<SecurityConfig>);
    /**
     * RUSSIAN: Объединение конфигурации по умолчанию с пользовательской
     */
    private mergeConfig;
    /**
     * RUSSIAN: Настройка слушателей событий подсистем
     */
    private setupEventListeners;
    /**
     * RUSSIAN: Главный middleware для Express
     */
    middleware(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * RUSSIAN: Применение DDoS защиты
     */
    private applyDDoSProtection;
    /**
     * RUSSIAN: Применение rate limiting
     */
    private applyRateLimiting;
    /**
     * RUSSIAN: Обработка события безопасности
     */
    private handleSecurityEvent;
    /**
     * RUSSIAN: Проверка условий экстренного режима
     */
    private checkEmergencyConditions;
    /**
     * RUSSIAN: Активация экстренного режима
     */
    private activateEmergencyMode;
    /**
     * RUSSIAN: Деактивация экстренного режима
     */
    private deactivateEmergencyMode;
    /**
     * RUSSIAN: Обработка запросов в экстренном режиме
     */
    private handleEmergencyMode;
    /**
     * RUSSIAN: Проверка критически важных эндпоинтов
     */
    private isCriticalEndpoint;
    /**
     * RUSSIAN: Запись метрик запроса
     */
    private recordRequestMetrics;
    /**
     * RUSSIAN: Отправка webhook уведомления
     */
    private sendWebhookNotification;
    /**
     * RUSSIAN: Получение статистики безопасности
     */
    getSecurityStatistics(): {
        general: typeof this.securityStats;
        rateLimiter: any;
        ddosProtection: any;
        emergencyMode: typeof this.emergencyMode;
    };
    /**
     * RUSSIAN: Получение последних событий безопасности
     */
    getSecurityEvents(limit?: number): SecurityEvent[];
    /**
     * RUSSIAN: Ручное управление экстренным режимом
     */
    toggleEmergencyMode(activate: boolean, reason?: string): Promise<void>;
    /**
     * RUSSIAN: Обновление конфигурации во время выполнения
     */
    updateConfiguration(newConfig: Partial<SecurityConfig>): void;
    /**
     * RUSSIAN: Остановка системы безопасности
     */
    shutdown(): Promise<void>;
}
/**
 * RUSSIAN: Фабричная функция для создания middleware безопасности
 */
export declare function createSecurityMiddleware(config?: Partial<SecurityConfig>): SecurityMiddleware;
/**
 * RUSSIAN: Хелпер для интеграции с Express приложением
 */
export declare function setupSecurity(app: Express, config?: Partial<SecurityConfig>): SecurityMiddleware;
