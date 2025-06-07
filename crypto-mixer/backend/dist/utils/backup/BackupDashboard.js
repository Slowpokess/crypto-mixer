"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupDashboard = void 0;
const express_1 = __importDefault(require("express"));
const logger_1 = require("../logger");
/**
 * Web Dashboard для мониторинга backup процессов
 * Предоставляет real-time интерфейс для просмотра статуса backup и алертов
 */
class BackupDashboard {
    constructor(monitoring, backupManager, drManager, port = 3030) {
        this.server = null;
        this.isRunning = false;
        this.monitoring = monitoring;
        this.backupManager = backupManager;
        this.drManager = drManager;
        this.port = port;
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.setupRoutes();
    }
    /**
     * Настройка middleware
     */
    setupMiddleware() {
        // JSON parsing
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
        // CORS для API доступа
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            }
            else {
                next();
            }
        });
        // Логирование запросов
        this.app.use((req, res, next) => {
            logger_1.enhancedDbLogger.debug('🌐 Dashboard request', {
                method: req.method,
                url: req.url,
                ip: req.ip
            });
            next();
        });
    }
    /**
     * Настройка роутов
     */
    setupRoutes() {
        // Главная страница dashboard
        this.app.get('/', (req, res) => {
            res.send(this.generateDashboardHTML());
        });
        // API для получения данных dashboard
        this.app.get('/api/dashboard', async (req, res) => {
            try {
                const data = this.monitoring.getDashboardData();
                res.json(data);
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка получения данных dashboard', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // API для получения списка backup
        this.app.get('/api/backups', (req, res) => {
            try {
                const backups = this.backupManager.getBackupHistory();
                res.json(backups);
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка получения списка backup', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // API для получения текущего статуса
        this.app.get('/api/status', async (req, res) => {
            try {
                const backupStatus = this.backupManager.getCurrentStatus();
                const systemHealth = await this.drManager.performHealthCheck();
                const drStatus = this.drManager.getSystemStatus();
                res.json({
                    backup: backupStatus,
                    health: systemHealth,
                    disasterRecovery: drStatus
                });
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка получения статуса', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // API для получения алертов
        this.app.get('/api/alerts', (req, res) => {
            try {
                const { status, severity, limit = 50 } = req.query;
                let alerts = Array.from(this.monitoring.alerts.values());
                if (status) {
                    alerts = alerts.filter(a => a.status === status);
                }
                if (severity) {
                    alerts = alerts.filter(a => a.severity === severity);
                }
                alerts = alerts
                    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                    .slice(0, Number(limit));
                res.json(alerts);
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка получения алертов', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // API для подтверждения алерта
        this.app.post('/api/alerts/:id/acknowledge', async (req, res) => {
            try {
                const { id } = req.params;
                const { acknowledgedBy = 'dashboard_user' } = req.body;
                const success = await this.monitoring.acknowledgeAlert(id, acknowledgedBy);
                if (success) {
                    res.json({ success: true, message: 'Alert acknowledged' });
                }
                else {
                    res.status(404).json({ error: 'Alert not found or already processed' });
                }
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка подтверждения алерта', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // API для разрешения алерта
        this.app.post('/api/alerts/:id/resolve', async (req, res) => {
            try {
                const { id } = req.params;
                const { resolvedBy = 'dashboard_user' } = req.body;
                const success = await this.monitoring.resolveAlert(id, resolvedBy);
                if (success) {
                    res.json({ success: true, message: 'Alert resolved' });
                }
                else {
                    res.status(404).json({ error: 'Alert not found or already processed' });
                }
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка разрешения алерта', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // API для запуска backup
        this.app.post('/api/backup/start', async (req, res) => {
            try {
                const { priority } = req.body;
                const report = await this.backupManager.createFullBackup({ priority });
                res.json({
                    success: true,
                    message: 'Backup started',
                    backupId: report.id
                });
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка запуска backup', { error });
                res.status(500).json({
                    error: 'Failed to start backup',
                    details: String(error)
                });
            }
        });
        // API для мануального восстановления
        this.app.post('/api/recovery/manual', async (req, res) => {
            try {
                const { planId, dryRun = false } = req.body;
                const execution = await this.drManager.manualRecovery(planId, { dryRun });
                res.json({
                    success: true,
                    message: 'Manual recovery initiated',
                    executionId: execution.id,
                    status: execution.status
                });
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка мануального восстановления', { error });
                res.status(500).json({
                    error: 'Failed to start manual recovery',
                    details: String(error)
                });
            }
        });
        // API для получения метрик производительности
        this.app.get('/api/metrics', (req, res) => {
            try {
                const { period = '1hour', format = 'json' } = req.query;
                const metricsHistory = this.monitoring.metricsHistory;
                let filteredMetrics = metricsHistory;
                // Фильтрация по периоду
                if (period !== 'all') {
                    const periodMap = {
                        '1hour': 60 * 60 * 1000,
                        '6hours': 6 * 60 * 60 * 1000,
                        '24hours': 24 * 60 * 60 * 1000,
                        '7days': 7 * 24 * 60 * 60 * 1000
                    };
                    const cutoff = Date.now() - (periodMap[period] || periodMap['1hour']);
                    filteredMetrics = metricsHistory.filter((m) => m.timestamp.getTime() >= cutoff);
                }
                if (format === 'csv') {
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', 'attachment; filename=backup_metrics.csv');
                    res.send(this.convertMetricsToCSV(filteredMetrics));
                }
                else {
                    res.json(filteredMetrics);
                }
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка получения метрик', { error });
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: '1.0.0'
            });
        });
        // Обработка ошибок 404
        this.app.use((req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
        // Глобальный обработчик ошибок
        this.app.use((error, req, res, next) => {
            logger_1.enhancedDbLogger.error('❌ Необработанная ошибка в dashboard', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method
            });
            res.status(500).json({
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
            });
        });
    }
    /**
     * Запуск dashboard сервера
     */
    async start() {
        if (this.isRunning) {
            throw new Error('Dashboard уже запущен');
        }
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, (error) => {
                if (error) {
                    logger_1.enhancedDbLogger.error('❌ Ошибка запуска dashboard', {
                        error,
                        port: this.port
                    });
                    reject(error);
                    return;
                }
                this.isRunning = true;
                logger_1.enhancedDbLogger.info('🖥️ Backup Dashboard запущен', {
                    port: this.port,
                    url: `http://localhost:${this.port}`
                });
                resolve();
            });
            this.server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger_1.enhancedDbLogger.error(`❌ Порт ${this.port} уже используется`, { error });
                    reject(new Error(`Port ${this.port} is already in use`));
                }
                else {
                    logger_1.enhancedDbLogger.error('❌ Ошибка сервера dashboard', { error });
                    reject(error);
                }
            });
        });
    }
    /**
     * Остановка dashboard сервера
     */
    async stop() {
        if (!this.isRunning || !this.server) {
            return;
        }
        return new Promise((resolve) => {
            this.server.close(() => {
                this.isRunning = false;
                this.server = null;
                logger_1.enhancedDbLogger.info('🖥️ Backup Dashboard остановлен');
                resolve();
            });
        });
    }
    /**
     * Получение статуса dashboard
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.port,
            url: this.isRunning ? `http://localhost:${this.port}` : undefined
        };
    }
    /**
     * Генерация HTML для dashboard
     */
    generateDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto Mixer - Backup Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }
        
        .header h1 {
            color: #2d3748;
            font-size: 2rem;
            margin-bottom: 8px;
        }
        
        .header p {
            color: #718096;
            font-size: 1.1rem;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 32px;
        }
        
        .stat-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
            transition: transform 0.2s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-4px);
        }
        
        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 8px;
        }
        
        .stat-label {
            color: #718096;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-healthy { background-color: #48bb78; }
        .status-warning { background-color: #ed8936; }
        .status-critical { background-color: #f56565; }
        .status-emergency { background-color: #9f2c2c; }
        
        .content-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }
        
        .panel {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }
        
        .panel h3 {
            color: #2d3748;
            margin-bottom: 16px;
            font-size: 1.25rem;
        }
        
        .alert-item {
            border-left: 4px solid #e2e8f0;
            padding: 12px 16px;
            margin-bottom: 12px;
            border-radius: 0 8px 8px 0;
            background: #f7fafc;
        }
        
        .alert-info { border-left-color: #4299e1; }
        .alert-warning { border-left-color: #ed8936; }
        .alert-error { border-left-color: #f56565; }
        .alert-critical { border-left-color: #9f2c2c; }
        
        .backup-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #e2e8f0;
        }
        
        .backup-item:last-child {
            border-bottom: none;
        }
        
        .backup-status {
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
        }
        
        .status-completed {
            background: #c6f6d5;
            color: #22543d;
        }
        
        .status-failed {
            background: #fed7d7;
            color: #742a2a;
        }
        
        .status-in-progress {
            background: #bee3f8;
            color: #2c5282;
        }
        
        .refresh-btn {
            background: linear-gradient(135deg, #4299e1, #3182ce);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: transform 0.2s ease;
        }
        
        .refresh-btn:hover {
            transform: scale(1.05);
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: #718096;
        }
        
        @media (max-width: 768px) {
            .content-grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Crypto Mixer - Backup Dashboard</h1>
            <p>Real-time monitoring и управление backup процессами</p>
        </div>
        
        <div id="loading" class="loading">
            <div>Загрузка данных...</div>
        </div>
        
        <div id="dashboard-content" style="display: none;">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value" id="total-backups">-</div>
                    <div class="stat-label">Всего Backup</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="success-rate">-</div>
                    <div class="stat-label">Успешность (%)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="disk-usage">-</div>
                    <div class="stat-label">Использование диска (%)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="active-alerts">-</div>
                    <div class="stat-label">Активные алерты</div>
                </div>
            </div>
            
            <div class="content-grid">
                <div class="panel">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3>🚨 Последние алерты</h3>
                        <button class="refresh-btn" onclick="refreshData()">Обновить</button>
                    </div>
                    <div id="alerts-list">
                        <!-- Alerts will be loaded here -->
                    </div>
                </div>
                
                <div class="panel">
                    <h3>💾 Последние backup</h3>
                    <div id="backups-list">
                        <!-- Backups will be loaded here -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let dashboardData = {};
        
        async function loadDashboardData() {
            try {
                const response = await fetch('/api/dashboard');
                if (!response.ok) throw new Error('Failed to fetch data');
                
                dashboardData = await response.json();
                updateDashboard();
                
                document.getElementById('loading').style.display = 'none';
                document.getElementById('dashboard-content').style.display = 'block';
            } catch (error) {
                console.error('Error loading dashboard data:', error);
                document.getElementById('loading').innerHTML = '❌ Ошибка загрузки данных';
            }
        }
        
        function updateDashboard() {
            // Update stats
            document.getElementById('total-backups').textContent = dashboardData.summary?.totalBackups || 0;
            document.getElementById('success-rate').textContent = (dashboardData.summary?.successRate || 0).toFixed(1);
            document.getElementById('disk-usage').textContent = (dashboardData.summary?.diskUsagePercent || 0).toFixed(1);
            document.getElementById('active-alerts').textContent = dashboardData.summary?.activeAlerts || 0;
            
            // Update alerts
            updateAlertsList();
            
            // Update backups
            updateBackupsList();
        }
        
        function updateAlertsList() {
            const alertsList = document.getElementById('alerts-list');
            const alerts = dashboardData.recentAlerts || [];
            
            if (alerts.length === 0) {
                alertsList.innerHTML = '<div style="text-align: center; color: #718096; padding: 20px;">Нет активных алертов</div>';
                return;
            }
            
            alertsList.innerHTML = alerts.slice(0, 5).map(alert => \`
                <div class="alert-item alert-\${alert.severity}">
                    <div style="font-weight: 600; margin-bottom: 4px;">\${alert.title}</div>
                    <div style="font-size: 0.9rem; color: #718096; margin-bottom: 8px;">\${alert.description}</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <small style="color: #a0aec0;">\${new Date(alert.timestamp).toLocaleString()}</small>
                        <span class="status-indicator status-\${alert.severity}"></span>
                    </div>
                </div>
            \`).join('');
        }
        
        function updateBackupsList() {
            const backupsList = document.getElementById('backups-list');
            const backups = dashboardData.recentBackups || [];
            
            if (backups.length === 0) {
                backupsList.innerHTML = '<div style="text-align: center; color: #718096; padding: 20px;">Нет backup</div>';
                return;
            }
            
            backupsList.innerHTML = backups.slice(0, 5).map(backup => \`
                <div class="backup-item">
                    <div>
                        <div style="font-weight: 600;">\${backup.type} backup</div>
                        <div style="font-size: 0.9rem; color: #718096;">\${new Date(backup.timestamp).toLocaleString()}</div>
                    </div>
                    <span class="backup-status status-\${backup.status}">\${backup.status}</span>
                </div>
            \`).join('');
        }
        
        async function refreshData() {
            await loadDashboardData();
        }
        
        // Auto refresh every 30 seconds
        setInterval(refreshData, 30000);
        
        // Initial load
        loadDashboardData();
    </script>
</body>
</html>
    `.trim();
    }
    /**
     * Конвертация метрик в CSV формат
     */
    convertMetricsToCSV(metrics) {
        if (metrics.length === 0)
            return '';
        const headers = [
            'timestamp',
            'total_backups',
            'successful_backups',
            'failed_backups',
            'success_rate',
            'average_duration',
            'total_size',
            'compression_ratio',
            'throughput_mbps',
            'cpu_usage_percent',
            'memory_usage_mb',
            'disk_usage_percent',
            'health_score'
        ];
        const csvRows = [
            headers.join(','),
            ...metrics.map(metric => [
                metric.timestamp,
                metric.backup.totalBackups,
                metric.backup.successfulBackups,
                metric.backup.failedBackups,
                metric.backup.successRate,
                metric.backup.averageDuration,
                metric.backup.totalSize,
                metric.backup.compressionRatio,
                metric.performance.averageThroughput,
                metric.performance.cpuUsagePercent,
                metric.performance.memoryUsageMB,
                metric.storage.usagePercent,
                metric.health.systemHealthScore
            ].join(','))
        ];
        return csvRows.join('\n');
    }
}
exports.BackupDashboard = BackupDashboard;
//# sourceMappingURL=BackupDashboard.js.map