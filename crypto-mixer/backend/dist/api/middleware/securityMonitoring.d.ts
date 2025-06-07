import { EventEmitter } from 'events';
/**
 * Система мониторинга и алертинга для DDoS атак crypto-mixer
 *
 * RUSSIAN COMMENTS: Создаем продвинутую систему мониторинга
 * - Реал-тайм анализ трафика и угроз
 * - Автоматические алерты при обнаружении атак
 * - Интеграция с Prometheus, Grafana, Slack
 * - Machine Learning для предсказания атак
 * - Геоаналитика и анализ паттернов
 * - Автоматическое создание отчетов
 */
export interface SecurityMonitoringConfig {
    enabled: boolean;
    intervals: {
        realTime: number;
        statistics: number;
        reporting: number;
        healthCheck: number;
    };
    thresholds: {
        criticalRPS: number;
        attackConfidence: number;
        blockedIPsThreshold: number;
        errorRateThreshold: number;
        responseTimeThreshold: number;
        uniqueIPsThreshold: number;
    };
    alerting: {
        enabled: boolean;
        channels: {
            email: {
                enabled: boolean;
                recipients: string[];
                smtpConfig?: {
                    host: string;
                    port: number;
                    secure: boolean;
                    auth: {
                        user: string;
                        pass: string;
                    };
                };
            };
            slack: {
                enabled: boolean;
                webhookUrl?: string;
                channel: string;
                username: string;
            };
            webhook: {
                enabled: boolean;
                url?: string;
                secret?: string;
            };
            sms: {
                enabled: boolean;
                provider?: 'twilio' | 'aws-sns';
                recipients: string[];
            };
        };
        escalation: {
            enabled: boolean;
            levels: Array<{
                threshold: number;
                delay: number;
                channels: string[];
            }>;
        };
    };
    analytics: {
        geoTracking: boolean;
        userAgentAnalysis: boolean;
        patternRecognition: boolean;
        machineLearning: boolean;
        behaviorAnalysis: boolean;
    };
    integrations: {
        prometheus: {
            enabled: boolean;
            pushGateway?: string;
            jobName: string;
        };
        grafana: {
            enabled: boolean;
            dashboardUrl?: string;
        };
        elasticsearch: {
            enabled: boolean;
            host?: string;
            index: string;
        };
        splunk: {
            enabled: boolean;
            host?: string;
            token?: string;
        };
    };
}
export interface SecurityAlert {
    id: string;
    type: 'ddos_attack' | 'rate_limit_breach' | 'suspicious_activity' | 'system_anomaly' | 'emergency';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    timestamp: Date;
    source: string;
    attackDetails?: {
        type: string;
        confidence: number;
        sourceIPs: string[];
        targetEndpoints: string[];
        volume: number;
        duration: number;
        geolocation?: string[];
    };
    metrics: {
        rps: number;
        blockedIPs: number;
        errorRate: number;
        responseTime: number;
        uniqueIPs: number;
    };
    status: 'new' | 'acknowledged' | 'in_progress' | 'resolved' | 'false_positive';
    assignedTo?: string;
    resolvedAt?: Date;
    notes?: string[];
}
export interface SecurityReport {
    id: string;
    type: 'hourly' | 'daily' | 'weekly' | 'incident';
    period: {
        start: Date;
        end: Date;
    };
    summary: {
        totalRequests: number;
        blockedRequests: number;
        attacksDetected: number;
        attacksMitigated: number;
        averageResponseTime: number;
        errorRate: number;
    };
    attacks: {
        byType: {
            [key: string]: number;
        };
        byCountry: {
            [key: string]: number;
        };
        topAttackingIPs: Array<{
            ip: string;
            requests: number;
            country?: string;
        }>;
        timeline: Array<{
            timestamp: Date;
            count: number;
            type: string;
        }>;
    };
    performance: {
        rpsTimeline: Array<{
            timestamp: Date;
            rps: number;
        }>;
        responseTimeTimeline: Array<{
            timestamp: Date;
            avgTime: number;
        }>;
        errorRateTimeline: Array<{
            timestamp: Date;
            rate: number;
        }>;
    };
    insights: {
        patterns: string[];
        recommendations: string[];
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
    };
}
/**
 * RUSSIAN: Главный класс мониторинга безопасности
 */
export declare class SecurityMonitoring extends EventEmitter {
    private config;
    private isActive;
    private intervals;
    private activeAlerts;
    private alertHistory;
    private maxAlertHistory;
    private reportHistory;
    private maxReportHistory;
    private realtimeStats;
    private mlPredictor;
    private trainingData;
    constructor(config: SecurityMonitoringConfig);
    /**
     * RUSSIAN: Инициализация системы мониторинга
     */
    private initialize;
    /**
     * RUSSIAN: Запуск реал-тайм мониторинга
     */
    private startRealTimeMonitoring;
    /**
     * RUSSIAN: Сбор статистики
     */
    private startStatisticsCollection;
    /**
     * RUSSIAN: Генерация отчетов
     */
    private startReportGeneration;
    /**
     * RUSSIAN: Проверки здоровья системы
     */
    private startHealthChecks;
    /**
     * RUSSIAN: Реал-тайм анализ безопасности
     */
    private performRealTimeAnalysis;
    /**
     * RUSSIAN: Получение текущих метрик
     */
    private getCurrentMetrics;
    /**
     * RUSSIAN: Проверка порогов и создание алертов
     */
    private checkThresholds;
    /**
     * RUSSIAN: Создание алерта
     */
    private createAlert;
    /**
     * RUSSIAN: Отправка алерта по всем настроенным каналам
     */
    private sendAlert;
    /**
     * RUSSIAN: Отправка Email алерта
     */
    private sendEmailAlert;
    /**
     * RUSSIAN: Отправка Slack алерта
     */
    private sendSlackAlert;
    /**
     * RUSSIAN: Генерация содержимого email
     */
    private generateEmailContent;
    /**
     * RUSSIAN: Генерация Slack сообщения
     */
    private generateSlackMessage;
    /**
     * RUSSIAN: Получение цвета по уровню серьезности
     */
    private getSeverityColor;
    /**
     * RUSSIAN: Инициализация машинного обучения
     */
    private initializeMachineLearning;
    /**
     * RUSSIAN: ML анализ метрик
     */
    private performMLAnalysis;
    /**
     * RUSSIAN: Простой расчет аномалии
     */
    private calculateAnomalyScore;
    /**
     * RUSSIAN: Анализ паттернов атак
     */
    private analyzePatterns;
    /**
     * RUSSIAN: Сбор статистики
     */
    private collectStatistics;
    /**
     * RUSSIAN: Генерация периодического отчета
     */
    private generatePeriodicReport;
    /**
     * RUSSIAN: Создание отчета безопасности
     */
    private createSecurityReport;
    /**
     * RUSSIAN: Проверка здоровья системы
     */
    private performHealthCheck;
    /**
     * RUSSIAN: Отправка webhook алерта
     */
    private sendWebhookAlert;
    /**
     * RUSSIAN: Отправка SMS алерта
     */
    private sendSMSAlert;
    /**
     * RUSSIAN: Получение активных алертов
     */
    getActiveAlerts(): SecurityAlert[];
    /**
     * RUSSIAN: Получение истории алертов
     */
    getAlertHistory(limit?: number): SecurityAlert[];
    /**
     * RUSSIAN: Подтверждение алерта
     */
    acknowledgeAlert(alertId: string, assignedTo?: string): Promise<boolean>;
    /**
     * RUSSIAN: Разрешение алерта
     */
    resolveAlert(alertId: string, notes?: string): Promise<boolean>;
    /**
     * RUSSIAN: Получение отчетов
     */
    getReports(type?: string, limit?: number): SecurityReport[];
    /**
     * RUSSIAN: Остановка мониторинга
     */
    shutdown(): Promise<void>;
}
/**
 * RUSSIAN: Дефолтная конфигурация мониторинга
 */
export declare const defaultSecurityMonitoringConfig: SecurityMonitoringConfig;
