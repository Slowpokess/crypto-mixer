import { EventEmitter } from 'events';
interface MemoryReport {
    timestamp: Date;
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    arrayBuffers: number;
    percentage: number;
    collections: {
        name: string;
        size: number;
        maxSize: number;
        utilization: number;
    }[];
    timers: string[];
    warnings: string[];
}
interface SystemHealthMetrics {
    memory: {
        healthy: boolean;
        usage: number;
        trend: 'stable' | 'increasing' | 'decreasing';
    };
    collections: {
        healthy: boolean;
        totalSize: number;
        averageUtilization: number;
    };
    timers: {
        healthy: boolean;
        count: number;
    };
    overall: {
        status: 'healthy' | 'warning' | 'critical';
        score: number;
    };
}
export declare class MemoryMonitoring extends EventEmitter {
    private static instance;
    private readonly MONITORING_INTERVAL;
    private readonly REPORT_INTERVAL;
    private readonly CRITICAL_THRESHOLD;
    private readonly WARNING_THRESHOLD;
    private isRunning;
    private memoryHistory;
    private readonly MAX_HISTORY;
    private constructor();
    static getInstance(): MemoryMonitoring;
    start(): void;
    stop(): void;
    private setupMemoryManagerListeners;
    private collectMemoryReport;
    private getCollectionStats;
    private checkForWarnings;
    private generateHealthReport;
    private calculateMemoryTrend;
    private calculateOverallStatus;
    private calculateHealthScore;
    getLatestReport(): MemoryReport | null;
    getMemoryHistory(minutes?: number): MemoryReport[];
    getCurrentStatus(): SystemHealthMetrics | null;
    emergencyCleanup(): void;
}
export declare const memoryMonitoring: MemoryMonitoring;
export {};
