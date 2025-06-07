import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
/**
 * Продвинутая система защиты от DDoS атак для crypto-mixer
 *
 * RUSSIAN COMMENTS: Создаем интеллектуальную систему обнаружения и защиты от DDoS
 * - Анализ паттернов трафика в реальном времени
 * - Машинное обучение для обнаружения аномалий
 * - Автоматическая адаптация к типам атак
 * - Интеграция с системой мониторинга и алертинга
 * - Защита от различных типов DDoS (volumetric, protocol, application layer)
 */
export interface DDoSConfig {
    enabled: boolean;
    sensitivity: 'low' | 'medium' | 'high' | 'adaptive';
    thresholds: {
        requestsPerSecond: number;
        requestsPerIP: number;
        concurrentConnections: number;
        uniqueIPsPerMinute: number;
        errorRate: number;
        payloadSize: number;
        requestDuration: number;
    };
    patternDetection: {
        enabled: boolean;
        algorithms: string[];
        analysisWindow: number;
        minSamples: number;
    };
    attackTypes: {
        volumetric: boolean;
        slowloris: boolean;
        httpFlood: boolean;
        amplification: boolean;
        botnet: boolean;
    };
    mitigation: {
        autoBlock: boolean;
        blockDuration: number;
        escalation: {
            enabled: boolean;
            levels: Array<{
                threshold: number;
                action: string;
                duration: number;
            }>;
        };
    };
    machineLearning: {
        enabled: boolean;
        model: 'statistical' | 'neural' | 'ensemble';
        trainingPeriod: number;
        adaptationRate: number;
    };
    reputation: {
        enabled: boolean;
        databases: string[];
        trustScore: {
            minScore: number;
            decayRate: number;
        };
    };
    external: {
        cloudflare: {
            enabled: boolean;
            apiKey?: string;
            zoneId?: string;
        };
        fail2ban: {
            enabled: boolean;
            logPath: string;
        };
    };
}
export interface AttackSignature {
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    indicators: string[];
    sourceIPs: string[];
    targetEndpoints: string[];
    startTime: Date;
    endTime?: Date;
    metrics: {
        requestCount: number;
        uniqueIPs: number;
        bandwidth: number;
        errorRate: number;
        avgResponseTime: number;
    };
}
export interface TrafficStats {
    timestamp: Date;
    requestsPerSecond: number;
    uniqueIPs: number;
    topIPs: Array<{
        ip: string;
        count: number;
        reputation: number;
    }>;
    topEndpoints: Array<{
        endpoint: string;
        count: number;
    }>;
    topUserAgents: Array<{
        userAgent: string;
        count: number;
    }>;
    errorRates: {
        [statusCode: number]: number;
    };
    averageResponseTime: number;
    totalBandwidth: number;
    suspiciousActivity: number;
    geolocation: {
        [country: string]: number;
    };
}
/**
 * Продвинутая DDoS защита
 */
export declare class AdvancedDDoSProtection extends EventEmitter {
    private config;
    private isActive;
    private trafficHistory;
    private currentWindow;
    private ipReputation;
    private activeAttacks;
    private attackHistory;
    private mlModel;
    private trainingData;
    private blockedIPs;
    private suspiciousIPs;
    private analysisInterval;
    private cleanupInterval;
    constructor(config: DDoSConfig);
    /**
     * RUSSIAN: Инициализация системы DDoS защиты
     */
    private initialize;
    /**
     * RUSSIAN: Главный middleware для DDoS защиты
     */
    middleware(): (req: Request, res: Response, next: NextFunction) => Promise<void>;
    /**
     * RUSSIAN: Анализ подозрительности запроса
     */
    private analyzeSuspiciousness;
    /**
     * RUSSIAN: Проверка превышения порогов
     */
    private checkThresholds;
    /**
     * RUSSIAN: Инициализация машинного обучения
     */
    private initializeMachineLearning;
    /**
     * RUSSIAN: Загрузка баз данных репутации IP
     */
    private loadReputationDatabases;
    /**
     * RUSSIAN: Запуск анализа трафика
     */
    private startTrafficAnalysis;
    /**
     * RUSSIAN: Анализ паттернов трафика
     */
    private analyzeTrafficPatterns;
    /**
     * RUSSIAN: Энтропийный анализ для обнаружения ботнетов
     */
    private performEntropyAnalysis;
    /**
     * RUSSIAN: Статистический анализ аномалий
     */
    private performStatisticalAnalysis;
    /**
     * RUSSIAN: Вычисление энтропии Шеннона
     */
    private calculateEntropy;
    /**
     * RUSSIAN: Обработка обнаружения атаки
     */
    private triggerAttackDetection;
    /**
     * RUSSIAN: Применение мер противодействия
     */
    private applyMitigation;
    /**
     * RUSSIAN: Блокировка IP адреса
     */
    private blockIP;
    /**
     * RUSSIAN: Разблокировка IP адреса
     */
    private unblockIP;
    /**
     * RUSSIAN: Проверка заблокированного IP
     */
    private isBlocked;
    /**
     * RUSSIAN: Проверка IP в белом списке
     */
    private isWhitelisted;
    /**
     * RUSSIAN: Получение IP адреса клиента
     */
    private getClientIP;
    /**
     * RUSSIAN: Запись запроса для анализа
     */
    private recordRequest;
    /**
     * RUSSIAN: Запись ответа для анализа
     */
    private recordResponse;
    /**
     * RUSSIAN: Обновление репутации IP
     */
    private updateIPReputation;
    /**
     * RUSSIAN: Получение недавних запросов
     */
    private getRecentRequests;
    /**
     * RUSSIAN: Обработка заблокированного запроса
     */
    private handleBlockedRequest;
    /**
     * RUSSIAN: Обработка подозрительной активности
     */
    private handleSuspiciousActivity;
    /**
     * RUSSIAN: Получение статистики DDoS защиты
     */
    getStatistics(): {
        activeAttacks: number;
        blockedIPs: number;
        suspiciousIPs: number;
        totalRequests: number;
        requestsPerSecond: number;
        topAttackTypes: Array<{
            type: string;
            count: number;
        }>;
        reputationDistribution: {
            low: number;
            medium: number;
            high: number;
        };
    };
    /**
     * RUSSIAN: Получение детальной информации об атаках
     */
    getAttackDetails(): {
        active: AttackSignature[];
        recent: AttackSignature[];
        blockedIPs: Array<{
            ip: string;
            reason: string;
            until: Date;
            level: number;
        }>;
    };
    /**
     * RUSSIAN: Ручная блокировка IP
     */
    manualBlockIP(ip: string, reason: string, duration: number): Promise<void>;
    /**
     * RUSSIAN: Ручная разблокировка IP
     */
    manualUnblockIP(ip: string): Promise<void>;
    /**
     * RUSSIAN: Остановка DDoS защиты
     */
    shutdown(): Promise<void>;
    private loadPretrainedModel;
    private loadMaliciousIPDatabase;
    private loadTorExitNodes;
    private isSuspiciousUserAgent;
    private analyzeRequestPattern;
    private getMachineLearningScore;
    private isSuspiciousGeolocation;
    private getCountryFromIP;
    private performClusterAnalysis;
    private analyzeTimeDistribution;
    private analyzeGeographicDistribution;
    private calculateAttackConfidence;
    private getTopTargetEndpoints;
    private getCurrentAttackMetrics;
    private getEscalationLevel;
    private applyEscalation;
    private notifyCloudflare;
    private notifyFail2Ban;
    private handleSlowlorisDetection;
    private updateMLModel;
    private generateTrafficStats;
    private startCleanupTasks;
}
/**
 * RUSSIAN: Дефолтная конфигурация DDoS защиты для crypto-mixer
 */
export declare const defaultDDoSConfig: DDoSConfig;
