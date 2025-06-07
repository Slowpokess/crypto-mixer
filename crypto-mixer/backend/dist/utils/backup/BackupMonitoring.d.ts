import { EventEmitter } from 'events';
import { BackupManager, BackupMetadata } from './BackupManager';
import { DisasterRecoveryManager, SystemHealthStatus } from './DisasterRecoveryManager';
/**
 * Типы и интерфейсы для системы мониторинга backup
 */
export interface BackupMonitoringConfig {
    enabled: boolean;
    thresholds: {
        maxBackupDuration: number;
        minSuccessRate: number;
        maxFailedBackups: number;
        diskSpaceWarning: number;
        diskSpaceCritical: number;
        healthCheckInterval: number;
    };
    alerts: {
        enabled: boolean;
        channels: AlertChannel[];
        escalation: EscalationPolicy;
        rateLimit: {
            enabled: boolean;
            maxAlertsPerHour: number;
            cooldownMinutes: number;
        };
    };
    metrics: {
        retentionDays: number;
        aggregationIntervals: number[];
        exportEnabled: boolean;
        exportFormat: 'json' | 'csv' | 'prometheus';
        exportPath: string;
    };
    dashboard: {
        enabled: boolean;
        refreshInterval: number;
        port?: number;
        historyDepth: number;
    };
}
export interface AlertChannel {
    type: 'webhook' | 'email' | 'slack' | 'telegram' | 'sms' | 'pagerduty';
    name: string;
    enabled: boolean;
    config: {
        url?: string;
        token?: string;
        recipients?: string[];
        template?: string;
        priority?: 'low' | 'normal' | 'high' | 'critical';
    };
    filters: {
        severity?: AlertSeverity[];
        components?: string[];
        timeWindow?: {
            start: string;
            end: string;
        };
    };
}
export interface EscalationPolicy {
    enabled: boolean;
    levels: EscalationLevel[];
    timeouts: number[];
    maxEscalations: number;
}
export interface EscalationLevel {
    level: number;
    channels: string[];
    requireAcknowledgment: boolean;
    autoResolve: boolean;
    autoResolveTimeout: number;
}
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical' | 'emergency';
export interface Alert {
    id: string;
    timestamp: Date;
    severity: AlertSeverity;
    category: 'backup' | 'restore' | 'health' | 'performance' | 'storage' | 'security';
    title: string;
    description: string;
    source: string;
    tags: string[];
    metadata: {
        backupId?: string;
        component?: string;
        threshold?: number;
        currentValue?: number;
        trend?: 'increasing' | 'decreasing' | 'stable';
        affectedSystems?: string[];
    };
    status: 'open' | 'acknowledged' | 'resolved' | 'suppressed';
    escalationLevel: number;
    acknowledgedBy?: string;
    acknowledgedAt?: Date;
    resolvedAt?: Date;
    notifications: AlertNotification[];
}
export interface AlertNotification {
    channel: string;
    sentAt: Date;
    success: boolean;
    error?: string;
    responseTime: number;
    attempt: number;
}
export interface BackupMetrics {
    timestamp: Date;
    period: 'realtime' | '5min' | '15min' | '1hour' | '1day';
    backup: {
        totalBackups: number;
        successfulBackups: number;
        failedBackups: number;
        successRate: number;
        averageDuration: number;
        totalSize: number;
        compressionRatio: number;
        componentsBackedUp: number;
    };
    performance: {
        averageThroughput: number;
        peakThroughput: number;
        cpuUsagePercent: number;
        memoryUsageMB: number;
        diskIoWaitPercent: number;
    };
    storage: {
        totalUsedSpace: number;
        availableSpace: number;
        usagePercent: number;
        oldestBackup: Date;
        newestBackup: Date;
        retentionCompliance: number;
    };
    health: {
        systemHealthScore: number;
        componentStatuses: Map<string, string>;
        uptime: number;
        lastSuccessfulBackup: Date;
        lastFailedBackup?: Date;
    };
    trends: {
        backupSizeGrowth: number;
        successRateTrend: number;
        performanceTrend: number;
        diskUsageTrend: number;
    };
}
export interface DashboardData {
    status: 'healthy' | 'warning' | 'critical' | 'emergency';
    lastUpdated: Date;
    summary: {
        totalBackups: number;
        successRate: number;
        lastBackupTime: Date;
        nextScheduledBackup: Date;
        diskUsagePercent: number;
        activeAlerts: number;
    };
    recentBackups: BackupMetadata[];
    recentAlerts: Alert[];
    metrics: BackupMetrics;
    systemHealth: SystemHealthStatus;
    trends: {
        backupSuccess: number[];
        diskUsage: number[];
        performance: number[];
        alertCounts: number[];
    };
}
/**
 * Enterprise-grade Backup Monitoring System
 * Обеспечивает комплексный мониторинг backup процессов и алертинг
 */
export declare class BackupMonitoring extends EventEmitter {
    private config;
    private backupManager;
    private drManager;
    private isMonitoring;
    private monitoringInterval;
    private alerts;
    private metrics;
    private alertHistory;
    private metricsHistory;
    private lastAlertTimes;
    private escalationTimers;
    private alertCounters;
    constructor(config: BackupMonitoringConfig, backupManager: BackupManager, drManager: DisasterRecoveryManager);
    /**
     * Инициализация системы мониторинга
     */
    initialize(): Promise<void>;
    /**
     * Запуск основного цикла мониторинга
     */
    private startMonitoring;
    /**
     * Выполнение одного цикла мониторинга
     */
    private performMonitoringCycle;
    /**
     * Сбор метрик производительности
     */
    private collectMetrics;
    /**
     * Проверка пороговых значений и создание алертов
     */
    private checkThresholds;
    /**
     * Проверка общего здоровья backup системы
     */
    private checkBackupHealth;
    /**
     * Проверка здоровья storage
     */
    private checkStorageHealth;
    /**
     * Создание и обработка алерта
     */
    createAlert(alertData: Partial<Alert>): Promise<string>;
    /**
     * Отправка уведомлений по каналам
     */
    private sendNotifications;
    /**
     * Отправка в конкретный канал
     */
    private sendToChannel;
    private validateConfiguration;
    private setupEventListeners;
    private storeMetrics;
    private loadHistoricalData;
    private ensureDirectories;
    private getStorageStats;
    private calculateCompressionRatio;
    private countUniqueComponents;
    private calculatePeakThroughput;
    private getCpuUsage;
    private calculateRetentionCompliance;
    private calculateHealthScore;
    private getLastSuccessfulBackup;
    private getLastFailedBackup;
    private calculateSizeGrowthTrend;
    private calculateSuccessRateTrend;
    private calculatePerformanceTrend;
    private calculateDiskUsageTrend;
    private countConsecutiveFailures;
    private isDuplicateAlert;
    private checkRateLimit;
    private shouldSendToChannel;
    private formatAlertMessage;
    private sendWebhook;
    private sendEmail;
    private sendSlack;
    private sendTelegram;
    private sendSMS;
    private sendPagerDuty;
    private startEscalation;
    private startDashboard;
    private updateDashboard;
    private exportMetrics;
    private saveAlertToFile;
    private cleanupHistoricalData;
    /**
     * Получение данных для dashboard
     */
    getDashboardData(): DashboardData;
    private calculateOverallStatus;
    private getHourlyAlertCounts;
    /**
     * Подтверждение алерта
     */
    acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean>;
    /**
     * Разрешение алерта
     */
    resolveAlert(alertId: string, resolvedBy?: string): Promise<boolean>;
    /**
     * Остановка системы мониторинга
     */
    shutdown(): Promise<void>;
}
