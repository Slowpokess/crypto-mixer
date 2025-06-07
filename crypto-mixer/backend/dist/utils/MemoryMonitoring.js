"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryMonitoring = exports.MemoryMonitoring = void 0;
const MemoryManager_1 = require("./MemoryManager");
const events_1 = require("events");
class MemoryMonitoring extends events_1.EventEmitter {
    constructor() {
        super();
        this.MONITORING_INTERVAL = 60000; // 1 minute
        this.REPORT_INTERVAL = 300000; // 5 minutes
        this.CRITICAL_THRESHOLD = 0.9; // 90%
        this.WARNING_THRESHOLD = 0.75; // 75%
        this.isRunning = false;
        this.memoryHistory = [];
        this.MAX_HISTORY = 1440; // 24 hours of minute samples
        this.setupMemoryManagerListeners();
    }
    static getInstance() {
        if (!MemoryMonitoring.instance) {
            MemoryMonitoring.instance = new MemoryMonitoring();
        }
        return MemoryMonitoring.instance;
    }
    start() {
        if (this.isRunning)
            return;
        console.log('🔍 Starting memory monitoring...');
        // Start monitoring timer
        MemoryManager_1.memoryManager.createTimer('memory-monitoring:main', () => this.collectMemoryReport(), this.MONITORING_INTERVAL, 'interval', 'Main memory monitoring');
        // Start reporting timer
        MemoryManager_1.memoryManager.createTimer('memory-monitoring:report', () => this.generateHealthReport(), this.REPORT_INTERVAL, 'interval', 'Memory health reporting');
        this.isRunning = true;
        this.emit('monitoring:started');
        console.log('✅ Memory monitoring started');
    }
    stop() {
        if (!this.isRunning)
            return;
        MemoryManager_1.memoryManager.clearTimer('memory-monitoring:main');
        MemoryManager_1.memoryManager.clearTimer('memory-monitoring:report');
        this.isRunning = false;
        this.removeAllListeners();
        this.emit('monitoring:stopped');
        console.log('⏹️ Memory monitoring stopped');
    }
    setupMemoryManagerListeners() {
        MemoryManager_1.memoryManager.on('memory-usage', (data) => {
            this.emit('memory-usage', data);
            // Check for critical memory usage
            if (data.percentage > this.CRITICAL_THRESHOLD) {
                this.emit('memory-critical', data);
                console.error('🚨 CRITICAL: Memory usage at', `${(data.percentage * 100).toFixed(1)}%`);
            }
            else if (data.percentage > this.WARNING_THRESHOLD) {
                this.emit('memory-warning', data);
                console.warn('⚠️ WARNING: Memory usage at', `${(data.percentage * 100).toFixed(1)}%`);
            }
        });
        MemoryManager_1.memoryManager.on('memory-warning', (data) => {
            console.warn('⚠️ Memory warning:', data);
            this.emit('system-warning', data);
        });
        MemoryManager_1.memoryManager.on('emergency-cleanup', (data) => {
            console.error('🚨 Emergency cleanup triggered:', data);
            this.emit('emergency-cleanup', data);
        });
    }
    collectMemoryReport() {
        const memUsage = process.memoryUsage();
        const stats = MemoryManager_1.memoryManager.getStats();
        const report = {
            timestamp: new Date(),
            heapUsed: memUsage.heapUsed / 1024 / 1024, // MB
            heapTotal: memUsage.heapTotal / 1024 / 1024, // MB
            rss: memUsage.rss / 1024 / 1024, // MB
            external: memUsage.external / 1024 / 1024, // MB
            arrayBuffers: memUsage.arrayBuffers / 1024 / 1024, // MB
            percentage: memUsage.heapUsed / memUsage.heapTotal,
            collections: this.getCollectionStats(),
            timers: MemoryManager_1.memoryManager.getActiveTimers(),
            warnings: this.checkForWarnings(memUsage, stats)
        };
        // Add to history
        this.memoryHistory.push(report);
        // Keep history within limits
        if (this.memoryHistory.length > this.MAX_HISTORY) {
            this.memoryHistory = this.memoryHistory.slice(-this.MAX_HISTORY);
        }
        this.emit('memory-report', report);
    }
    getCollectionStats() {
        const collectionStats = [];
        // Get bounded map statistics
        const collections = [
            'scheduler:operations',
            'scheduler:active',
            'monitoring:system-metrics',
            'monitoring:business-metrics',
            'monitoring:security-metrics',
            'monitoring:performance-metrics',
            'monitoring:alerts',
            'monitoring:baseline'
        ];
        for (const name of collections) {
            const collection = MemoryManager_1.memoryManager.getBoundedMap(name);
            if (collection) {
                const stats = collection.getStats();
                collectionStats.push({
                    name,
                    size: stats.size,
                    maxSize: stats.maxSize,
                    utilization: stats.utilizationPercentage
                });
            }
        }
        return collectionStats;
    }
    checkForWarnings(memUsage, stats) {
        const warnings = [];
        // Memory usage warnings
        const memPercentage = memUsage.heapUsed / memUsage.heapTotal;
        if (memPercentage > this.WARNING_THRESHOLD) {
            warnings.push(`High memory usage: ${(memPercentage * 100).toFixed(1)}%`);
        }
        // Large RSS
        const rssMB = memUsage.rss / 1024 / 1024;
        if (rssMB > 512) { // 512MB
            warnings.push(`Large RSS: ${rssMB.toFixed(1)}MB`);
        }
        // Too many timers
        if (stats.timers > 50) {
            warnings.push(`Many active timers: ${stats.timers}`);
        }
        // Large collections
        if (stats.totalCollectionSize > 50000) {
            warnings.push(`Large total collection size: ${stats.totalCollectionSize}`);
        }
        return warnings;
    }
    generateHealthReport() {
        if (this.memoryHistory.length === 0)
            return;
        const latestReport = this.memoryHistory[this.memoryHistory.length - 1];
        const trend = this.calculateMemoryTrend();
        const healthMetrics = {
            memory: {
                healthy: latestReport.percentage < this.WARNING_THRESHOLD,
                usage: latestReport.percentage,
                trend
            },
            collections: {
                healthy: latestReport.collections.every(c => c.utilization < 80),
                totalSize: latestReport.collections.reduce((sum, c) => sum + c.size, 0),
                averageUtilization: latestReport.collections.reduce((sum, c) => sum + c.utilization, 0) / latestReport.collections.length
            },
            timers: {
                healthy: latestReport.timers.length < 30,
                count: latestReport.timers.length
            },
            overall: {
                status: this.calculateOverallStatus(latestReport),
                score: this.calculateHealthScore(latestReport)
            }
        };
        this.emit('health-report', healthMetrics);
        // Log if there are issues
        if (healthMetrics.overall.status !== 'healthy') {
            console.warn('📊 Memory Health Report:', {
                status: healthMetrics.overall.status,
                score: healthMetrics.overall.score,
                memoryUsage: `${(healthMetrics.memory.usage * 100).toFixed(1)}%`,
                trend: healthMetrics.memory.trend,
                collections: healthMetrics.collections.totalSize,
                timers: healthMetrics.timers.count
            });
        }
    }
    calculateMemoryTrend() {
        if (this.memoryHistory.length < 5)
            return 'stable';
        const recent = this.memoryHistory.slice(-5);
        const first = recent[0].percentage;
        const last = recent[recent.length - 1].percentage;
        const difference = last - first;
        if (Math.abs(difference) < 0.05)
            return 'stable'; // Less than 5% change
        return difference > 0 ? 'increasing' : 'decreasing';
    }
    calculateOverallStatus(report) {
        if (report.percentage > this.CRITICAL_THRESHOLD)
            return 'critical';
        if (report.percentage > this.WARNING_THRESHOLD)
            return 'warning';
        if (report.warnings.length > 2)
            return 'warning';
        if (report.collections.some(c => c.utilization > 90))
            return 'warning';
        return 'healthy';
    }
    calculateHealthScore(report) {
        let score = 100;
        // Memory usage penalty
        if (report.percentage > this.WARNING_THRESHOLD) {
            score -= (report.percentage - this.WARNING_THRESHOLD) * 200; // Max 50 point penalty
        }
        // Warnings penalty
        score -= report.warnings.length * 10;
        // Collection utilization penalty
        const highUtilization = report.collections.filter(c => c.utilization > 80).length;
        score -= highUtilization * 5;
        // Timer count penalty
        if (report.timers.length > 20) {
            score -= (report.timers.length - 20) * 2;
        }
        return Math.max(0, Math.min(100, Math.round(score)));
    }
    getLatestReport() {
        return this.memoryHistory.length > 0 ? this.memoryHistory[this.memoryHistory.length - 1] : null;
    }
    getMemoryHistory(minutes = 60) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return this.memoryHistory.filter(report => report.timestamp.getTime() > cutoff);
    }
    getCurrentStatus() {
        const latest = this.getLatestReport();
        if (!latest)
            return null;
        const trend = this.calculateMemoryTrend();
        return {
            memory: {
                healthy: latest.percentage < this.WARNING_THRESHOLD,
                usage: latest.percentage,
                trend
            },
            collections: {
                healthy: latest.collections.every(c => c.utilization < 80),
                totalSize: latest.collections.reduce((sum, c) => sum + c.size, 0),
                averageUtilization: latest.collections.reduce((sum, c) => sum + c.utilization, 0) / latest.collections.length
            },
            timers: {
                healthy: latest.timers.length < 30,
                count: latest.timers.length
            },
            overall: {
                status: this.calculateOverallStatus(latest),
                score: this.calculateHealthScore(latest)
            }
        };
    }
    // Force cleanup for emergency situations
    emergencyCleanup() {
        console.warn('🚨 Triggering emergency memory cleanup...');
        // Trigger memory manager cleanup
        MemoryManager_1.memoryManager.emergencyCleanup();
        // Clear old history
        if (this.memoryHistory.length > 100) {
            this.memoryHistory = this.memoryHistory.slice(-100);
        }
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        this.emit('emergency-cleanup-complete');
        console.log('✅ Emergency cleanup completed');
    }
}
exports.MemoryMonitoring = MemoryMonitoring;
// Export singleton instance
exports.memoryMonitoring = MemoryMonitoring.getInstance();
//# sourceMappingURL=MemoryMonitoring.js.map