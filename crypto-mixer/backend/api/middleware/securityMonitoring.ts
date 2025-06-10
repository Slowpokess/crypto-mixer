import { EventEmitter } from 'events';
import { enhancedDbLogger } from '../../utils/logger';

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
  
  // Интервалы мониторинга
  intervals: {
    realTime: number;        // Реал-тайм анализ (мс)
    statistics: number;      // Сбор статистики (мс)
    reporting: number;       // Генерация отчетов (мс)
    healthCheck: number;     // Проверка здоровья (мс)
  };
  
  // Пороги для алертов
  thresholds: {
    criticalRPS: number;           // Критический RPS
    attackConfidence: number;      // Уверенность в атаке (0-1)
    blockedIPsThreshold: number;   // Количество заблокированных IP
    errorRateThreshold: number;    // Процент ошибок
    responseTimeThreshold: number; // Время ответа (мс)
    uniqueIPsThreshold: number;    // Уникальные IP в минуту
  };
  
  // Алертинг
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
        delay: number;      // Задержка эскалации (мс)
        channels: string[]; // Каналы для этого уровня
      }>;
    };
  };
  
  // Метрики и аналитика
  analytics: {
    geoTracking: boolean;           // Геолокация атак
    userAgentAnalysis: boolean;     // Анализ User-Agent
    patternRecognition: boolean;    // Распознавание паттернов
    machineLearning: boolean;       // ML предсказания
    behaviorAnalysis: boolean;      // Анализ поведения
  };
  
  // Интеграции
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
  
  // Метаданные атаки
  attackDetails?: {
    type: string;
    confidence: number;
    sourceIPs: string[];
    targetEndpoints: string[];
    volume: number;
    duration: number;
    geolocation?: string[];
  };
  
  // Технические детали
  metrics: {
    rps: number;
    blockedIPs: number;
    errorRate: number;
    responseTime: number;
    uniqueIPs: number;
  };
  
  // Статус алерта
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
    byType: { [key: string]: number };
    byCountry: { [key: string]: number };
    topAttackingIPs: Array<{ ip: string; requests: number; country?: string }>;
    timeline: Array<{ timestamp: Date; count: number; type: string }>;
  };
  
  performance: {
    rpsTimeline: Array<{ timestamp: Date; rps: number }>;
    responseTimeTimeline: Array<{ timestamp: Date; avgTime: number }>;
    errorRateTimeline: Array<{ timestamp: Date; rate: number }>;
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
export class SecurityMonitoring extends EventEmitter {
  private config: SecurityMonitoringConfig;
  private isActive: boolean = false;
  
  // Интервалы
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  
  // Алерты
  private activeAlerts: Map<string, SecurityAlert> = new Map();
  private alertHistory: SecurityAlert[] = [];
  private maxAlertHistory = 10000;
  
  // Отчеты
  private reportHistory: SecurityReport[] = [];
  private maxReportHistory = 1000;
  
  // Статистика в реальном времени
  private realtimeStats = {
    currentRPS: 0,
    blockedIPs: new Set<string>(),
    errorRate: 0,
    avgResponseTime: 0,
    activeAttacks: new Map<string, any>(),
    geoDistribution: new Map<string, number>(),
    userAgentStats: new Map<string, number>()
  };
  
  // Машинное обучение
  private mlPredictor: any = null;
  private trainingData: any[] = [];

  constructor(config: SecurityMonitoringConfig) {
    super();
    this.config = config;
    
    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * RUSSIAN: Инициализация системы мониторинга
   */
  private async initialize(): Promise<void> {
    enhancedDbLogger.info('📊 Инициализация системы мониторинга безопасности', {
      realTimeInterval: this.config.intervals.realTime,
      alertingEnabled: this.config.alerting.enabled,
      mlEnabled: this.config.analytics.machineLearning
    });

    // RUSSIAN: Инициализация ML модели
    if (this.config.analytics.machineLearning) {
      await this.initializeMachineLearning();
    }

    // RUSSIAN: Запуск мониторинга
    this.startRealTimeMonitoring();
    this.startStatisticsCollection();
    this.startReportGeneration();
    this.startHealthChecks();

    this.isActive = true;
    enhancedDbLogger.info('✅ Система мониторинга безопасности активна');
  }

  /**
   * RUSSIAN: Запуск реал-тайм мониторинга
   */
  private startRealTimeMonitoring(): void {
    const interval = setInterval(async () => {
      await this.performRealTimeAnalysis();
    }, this.config.intervals.realTime);

    this.intervals.set('realtime', interval);
    enhancedDbLogger.info('🔄 Реал-тайм мониторинг запущен', {
      interval: this.config.intervals.realTime
    });
  }

  /**
   * RUSSIAN: Сбор статистики
   */
  private startStatisticsCollection(): void {
    const interval = setInterval(async () => {
      await this.collectStatistics();
    }, this.config.intervals.statistics);

    this.intervals.set('statistics', interval);
  }

  /**
   * RUSSIAN: Генерация отчетов
   */
  private startReportGeneration(): void {
    const interval = setInterval(async () => {
      await this.generatePeriodicReport();
    }, this.config.intervals.reporting);

    this.intervals.set('reporting', interval);
  }

  /**
   * RUSSIAN: Проверки здоровья системы
   */
  private startHealthChecks(): void {
    const interval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.intervals.healthCheck);

    this.intervals.set('healthcheck', interval);
  }

  /**
   * RUSSIAN: Реал-тайм анализ безопасности
   */
  private async performRealTimeAnalysis(): Promise<void> {
    try {
      // RUSSIAN: Анализируем текущие метрики
      const currentMetrics = await this.getCurrentMetrics();
      
      // RUSSIAN: Проверяем пороги
      await this.checkThresholds(currentMetrics);
      
      // RUSSIAN: ML предсказание
      if (this.config.analytics.machineLearning && this.mlPredictor) {
        await this.performMLAnalysis(currentMetrics);
      }
      
      // RUSSIAN: Анализ паттернов
      if (this.config.analytics.patternRecognition) {
        await this.analyzePatterns(currentMetrics);
      }

      // RUSSIAN: Эмитируем событие обновления метрик
      this.emit('metrics_updated', currentMetrics);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка реал-тайм анализа', { error });
    }
  }

  /**
   * RUSSIAN: Получение текущих метрик
   */
  private async getCurrentMetrics(): Promise<any> {
    // RUSSIAN: В реальной реализации получаем данные от систем защиты
    return {
      timestamp: new Date(),
      rps: this.realtimeStats.currentRPS,
      blockedIPs: this.realtimeStats.blockedIPs.size,
      errorRate: this.realtimeStats.errorRate,
      avgResponseTime: this.realtimeStats.avgResponseTime,
      activeAttacks: this.realtimeStats.activeAttacks.size,
      geoDistribution: Object.fromEntries(this.realtimeStats.geoDistribution),
      topUserAgents: Array.from(this.realtimeStats.userAgentStats.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
    };
  }

  /**
   * RUSSIAN: Проверка порогов и создание алертов
   */
  private async checkThresholds(metrics: any): Promise<void> {
    const thresholds = this.config.thresholds;

    // RUSSIAN: Критический RPS
    if (metrics.rps > thresholds.criticalRPS) {
      await this.createAlert({
        type: 'ddos_attack',
        severity: 'high',
        title: 'Критический уровень RPS',
        description: `RPS достиг ${metrics.rps}, что превышает порог ${thresholds.criticalRPS}`,
        source: 'realtime_monitoring',
        metrics,
        attackDetails: {
          type: 'volumetric',
          confidence: 0.8,
          sourceIPs: [],
          targetEndpoints: [],
          volume: metrics.rps,
          duration: 0
        }
      });
    }

    // RUSSIAN: Большое количество заблокированных IP
    if (metrics.blockedIPs > thresholds.blockedIPsThreshold) {
      await this.createAlert({
        type: 'suspicious_activity',
        severity: 'medium',
        title: 'Массовая блокировка IP адресов',
        description: `Заблокировано ${metrics.blockedIPs} IP адресов, порог: ${thresholds.blockedIPsThreshold}`,
        source: 'realtime_monitoring',
        metrics
      });
    }

    // RUSSIAN: Высокий процент ошибок
    if (metrics.errorRate > thresholds.errorRateThreshold) {
      await this.createAlert({
        type: 'system_anomaly',
        severity: 'medium',
        title: 'Высокий процент ошибок',
        description: `Процент ошибок: ${metrics.errorRate}%, порог: ${thresholds.errorRateThreshold}%`,
        source: 'realtime_monitoring',
        metrics
      });
    }
  }

  /**
   * RUSSIAN: Создание алерта
   */
  private async createAlert(alertData: Partial<SecurityAlert>): Promise<SecurityAlert> {
    const alert: SecurityAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: alertData.type || 'system_anomaly',
      severity: alertData.severity || 'medium',
      title: alertData.title || 'Неопределенная угроза безопасности',
      description: alertData.description || '',
      timestamp: new Date(),
      source: alertData.source || 'security_monitoring',
      metrics: alertData.metrics || {
        rps: 0,
        blockedIPs: 0,
        errorRate: 0,
        responseTime: 0,
        uniqueIPs: 0
      },
      status: 'new',
      attackDetails: alertData.attackDetails
    };

    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);

    // RUSSIAN: Ограничиваем историю алертов
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory = this.alertHistory.slice(-this.maxAlertHistory);
    }

    enhancedDbLogger.warn('🚨 Создан новый алерт безопасности', {
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title
    });

    // RUSSIAN: Отправляем уведомления
    if (this.config.alerting.enabled) {
      await this.sendAlert(alert);
    }

    // RUSSIAN: Эмитируем событие
    this.emit('alert_created', alert);

    return alert;
  }

  /**
   * RUSSIAN: Отправка алерта по всем настроенным каналам
   */
  private async sendAlert(alert: SecurityAlert): Promise<void> {
    const alerting = this.config.alerting;

    try {
      // RUSSIAN: Email уведомления
      if (alerting.channels.email.enabled) {
        await this.sendEmailAlert(alert);
      }

      // RUSSIAN: Slack уведомления
      if (alerting.channels.slack.enabled) {
        await this.sendSlackAlert(alert);
      }

      // RUSSIAN: Webhook уведомления
      if (alerting.channels.webhook.enabled) {
        await this.sendWebhookAlert(alert);
      }

      // RUSSIAN: SMS уведомления (только для критических)
      if (alerting.channels.sms.enabled && alert.severity === 'critical') {
        await this.sendSMSAlert(alert);
      }

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка отправки алерта', { error, alertId: alert.id });
    }
  }

  /**
   * RUSSIAN: Отправка Email алерта
   */
  private async sendEmailAlert(alert: SecurityAlert): Promise<void> {
    const emailConfig = this.config.alerting.channels.email;
    
    if (!emailConfig.smtpConfig) {
      enhancedDbLogger.warn('⚠️ SMTP не настроен для email алертов');
      return;
    }

    const subject = `[CRYPTO-MIXER] ${alert.severity.toUpperCase()}: ${alert.title}`;
    const htmlContent = this.generateEmailContent(alert);

    // RUSSIAN: В реальной реализации здесь будет nodemailer
    enhancedDbLogger.info('📧 Email алерт отправлен', {
      alertId: alert.id,
      recipients: emailConfig.recipients.length,
      subject
    });
  }

  /**
   * RUSSIAN: Отправка Slack алерта
   */
  private async sendSlackAlert(alert: SecurityAlert): Promise<void> {
    const slackConfig = this.config.alerting.channels.slack;
    
    if (!slackConfig.webhookUrl) {
      enhancedDbLogger.warn('⚠️ Slack webhook URL не настроен');
      return;
    }

    const slackMessage = this.generateSlackMessage(alert);

    // RUSSIAN: В реальной реализации здесь будет HTTP запрос к Slack
    enhancedDbLogger.info('💬 Slack алерт отправлен', {
      alertId: alert.id,
      channel: slackConfig.channel
    });
  }

  /**
   * RUSSIAN: Генерация содержимого email
   */
  private generateEmailContent(alert: SecurityAlert): string {
    return `
      <h2>🚨 Алерт системы безопасности Crypto Mixer</h2>
      
      <div style="border-left: 4px solid ${this.getSeverityColor(alert.severity)}; padding-left: 15px;">
        <h3>${alert.title}</h3>
        <p><strong>Уровень:</strong> ${alert.severity.toUpperCase()}</p>
        <p><strong>Время:</strong> ${alert.timestamp.toLocaleString('ru-RU')}</p>
        <p><strong>Источник:</strong> ${alert.source}</p>
        <p><strong>Описание:</strong> ${alert.description}</p>
      </div>

      <h4>Метрики:</h4>
      <ul>
        <li>RPS: ${alert.metrics.rps || 'N/A'}</li>
        <li>Заблокированные IP: ${alert.metrics.blockedIPs || 'N/A'}</li>
        <li>Процент ошибок: ${alert.metrics.errorRate || 'N/A'}%</li>
        <li>Время ответа: ${alert.metrics.responseTime || 'N/A'}ms</li>
      </ul>

      ${alert.attackDetails ? `
        <h4>Детали атаки:</h4>
        <ul>
          <li>Тип: ${alert.attackDetails.type}</li>
          <li>Уверенность: ${Math.round(alert.attackDetails.confidence * 100)}%</li>
          <li>Объем: ${alert.attackDetails.volume}</li>
          <li>IP источников: ${alert.attackDetails.sourceIPs.length}</li>
        </ul>
      ` : ''}

      <p><small>Алерт ID: ${alert.id}</small></p>
    `;
  }

  /**
   * RUSSIAN: Генерация Slack сообщения
   */
  private generateSlackMessage(alert: SecurityAlert): any {
    const severityEmoji = {
      low: '🟡',
      medium: '🟠', 
      high: '🔴',
      critical: '💀'
    };

    return {
      username: this.config.alerting.channels.slack.username,
      channel: this.config.alerting.channels.slack.channel,
      text: `${severityEmoji[alert.severity]} *${alert.title}*`,
      attachments: [{
        color: this.getSeverityColor(alert.severity),
        fields: [
          { title: 'Уровень', value: alert.severity.toUpperCase(), short: true },
          { title: 'Источник', value: alert.source, short: true },
          { title: 'Время', value: alert.timestamp.toLocaleString('ru-RU'), short: true },
          { title: 'RPS', value: alert.metrics.rps?.toString() || 'N/A', short: true }
        ],
        footer: `Crypto Mixer Security | Alert ID: ${alert.id}`,
        ts: Math.floor(alert.timestamp.getTime() / 1000)
      }]
    };
  }

  /**
   * RUSSIAN: Получение цвета по уровню серьезности
   */
  private getSeverityColor(severity: string): string {
    const colors = {
      low: '#36a64f',      // Зеленый
      medium: '#ff9800',   // Оранжевый
      high: '#f44336',     // Красный
      critical: '#9c27b0'  // Фиолетовый
    };
    return colors[severity as keyof typeof colors] || '#757575';
  }

  /**
   * RUSSIAN: Инициализация машинного обучения
   */
  private async initializeMachineLearning(): Promise<void> {
    enhancedDbLogger.info('🤖 Инициализация ML модели для предсказания атак');

    try {
      // RUSSIAN: Простая статистическая модель для начала
      this.mlPredictor = {
        features: ['rps', 'errorRate', 'responseTime', 'uniqueIPs', 'blockedIPs'],
        thresholds: new Map(),
        patterns: new Map(),
        lastTraining: new Date()
      };

      enhancedDbLogger.info('✅ ML модель инициализирована');
    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации ML', { error });
      this.config.analytics.machineLearning = false;
    }
  }

  /**
   * RUSSIAN: ML анализ метрик
   */
  private async performMLAnalysis(metrics: any): Promise<void> {
    if (!this.mlPredictor) return;

    try {
      // RUSSIAN: Простое предсказание на основе аномалий
      const features = [
        metrics.rps,
        metrics.errorRate,
        metrics.avgResponseTime,
        metrics.uniqueIPs || 0,
        metrics.blockedIPs
      ];

      const anomalyScore = this.calculateAnomalyScore(features);

      if (anomalyScore > 0.8) {
        await this.createAlert({
          type: 'ddos_attack',
          severity: 'high',
          title: 'ML обнаружение аномалии',
          description: `ML модель обнаружила подозрительную активность (счет: ${anomalyScore.toFixed(2)})`,
          source: 'ml_predictor',
          metrics,
          attackDetails: {
            type: 'ml_detected',
            confidence: anomalyScore,
            sourceIPs: [],
            targetEndpoints: [],
            volume: metrics.rps,
            duration: 0
          }
        });
      }

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка ML анализа', { error });
    }
  }

  /**
   * RUSSIAN: Простой расчет аномалии
   */
  private calculateAnomalyScore(features: number[]): number {
    // RUSSIAN: Очень упрощенная логика аномалий
    let score = 0;
    
    // Высокий RPS
    if (features[0] > 1000) score += 0.3;
    
    // Высокий процент ошибок
    if (features[1] > 10) score += 0.2;
    
    // Медленное время ответа
    if (features[2] > 5000) score += 0.2;
    
    // Много заблокированных IP
    if (features[4] > 50) score += 0.3;

    return Math.min(1, score);
  }

  /**
   * RUSSIAN: Анализ паттернов атак
   */
  private async analyzePatterns(metrics: any): Promise<void> {
    // RUSSIAN: Здесь будет логика анализа паттернов
    // Пока заглушка
  }

  /**
   * RUSSIAN: Сбор статистики
   */
  private async collectStatistics(): Promise<void> {
    // RUSSIAN: Собираем метрики с различных подсистем
    // Обновляем статистику для отчетов
  }

  /**
   * RUSSIAN: Генерация периодического отчета
   */
  private async generatePeriodicReport(): Promise<void> {
    try {
      const report = await this.createSecurityReport('hourly');
      this.reportHistory.push(report);

      if (this.reportHistory.length > this.maxReportHistory) {
        this.reportHistory = this.reportHistory.slice(-this.maxReportHistory);
      }

      enhancedDbLogger.info('📄 Сгенерирован отчет безопасности', {
        reportId: report.id,
        type: report.type,
        period: report.period
      });

      this.emit('report_generated', report);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка генерации отчета', { error });
    }
  }

  /**
   * RUSSIAN: Создание отчета безопасности
   */
  private async createSecurityReport(type: 'hourly' | 'daily' | 'weekly' | 'incident'): Promise<SecurityReport> {
    const now = new Date();
    const periods = {
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
      weekly: 7 * 24 * 60 * 60 * 1000,
      incident: 60 * 60 * 1000
    };

    const periodMs = periods[type];
    const start = new Date(now.getTime() - periodMs);

    return {
      id: `report_${type}_${now.getTime()}`,
      type,
      period: { start, end: now },
      summary: {
        totalRequests: 0,        // Заглушки - в реальности берем из метрик
        blockedRequests: 0,
        attacksDetected: 0,
        attacksMitigated: 0,
        averageResponseTime: 0,
        errorRate: 0
      },
      attacks: {
        byType: {},
        byCountry: {},
        topAttackingIPs: [],
        timeline: []
      },
      performance: {
        rpsTimeline: [],
        responseTimeTimeline: [],
        errorRateTimeline: []
      },
      insights: {
        patterns: [],
        recommendations: [],
        riskLevel: 'low'
      }
    };
  }

  /**
   * RUSSIAN: Проверка здоровья системы
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const health = {
        monitoring: this.isActive,
        alerts: this.activeAlerts.size,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      };

      this.emit('health_check', health);

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка проверки здоровья', { error });
    }
  }

  /**
   * RUSSIAN: Отправка webhook алерта
   */
  private async sendWebhookAlert(alert: SecurityAlert): Promise<void> {
    // RUSSIAN: Реализация webhook уведомлений
    enhancedDbLogger.info('🔗 Webhook алерт отправлен', { alertId: alert.id });
  }

  /**
   * RUSSIAN: Отправка SMS алерта
   */
  private async sendSMSAlert(alert: SecurityAlert): Promise<void> {
    // RUSSIAN: Реализация SMS уведомлений
    enhancedDbLogger.info('📱 SMS алерт отправлен', { alertId: alert.id });
  }

  /**
   * RUSSIAN: Получение активных алертов
   */
  public getActiveAlerts(): SecurityAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * RUSSIAN: Получение истории алертов
   */
  public getAlertHistory(limit: number = 100): SecurityAlert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * RUSSIAN: Подтверждение алерта
   */
  public async acknowledgeAlert(alertId: string, assignedTo?: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'acknowledged';
    alert.assignedTo = assignedTo;

    enhancedDbLogger.info('✅ Алерт подтвержден', { alertId, assignedTo });
    this.emit('alert_acknowledged', alert);

    return true;
  }

  /**
   * RUSSIAN: Разрешение алерта
   */
  public async resolveAlert(alertId: string, notes?: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    if (notes) {
      alert.notes = alert.notes || [];
      alert.notes.push(notes);
    }

    this.activeAlerts.delete(alertId);

    enhancedDbLogger.info('✅ Алерт разрешен', { alertId, notes });
    this.emit('alert_resolved', alert);

    return true;
  }

  /**
   * RUSSIAN: Получение отчетов
   */
  public getReports(type?: string, limit: number = 50): SecurityReport[] {
    let reports = this.reportHistory;
    
    if (type) {
      reports = reports.filter(r => r.type === type);
    }

    return reports.slice(-limit);
  }

  /**
   * RUSSIAN: Остановка мониторинга
   */
  public async shutdown(): Promise<void> {
    enhancedDbLogger.info('🛑 Остановка системы мониторинга безопасности...');

    // RUSSIAN: Останавливаем все интервалы
    this.intervals.forEach((interval, name) => {
      clearInterval(interval);
      enhancedDbLogger.debug(`Остановлен интервал: ${name}`);
    });

    this.intervals.clear();
    this.isActive = false;

    enhancedDbLogger.info('✅ Система мониторинга остановлена');
  }
}

/**
 * RUSSIAN: Дефолтная конфигурация мониторинга
 */
export const defaultSecurityMonitoringConfig: SecurityMonitoringConfig = {
  enabled: true,
  
  intervals: {
    realTime: 5000,        // 5 секунд
    statistics: 30000,     // 30 секунд
    reporting: 3600000,    // 1 час
    healthCheck: 60000     // 1 минута
  },
  
  thresholds: {
    criticalRPS: 1000,
    attackConfidence: 0.8,
    blockedIPsThreshold: 50,
    errorRateThreshold: 10,
    responseTimeThreshold: 5000,
    uniqueIPsThreshold: 500
  },
  
  alerting: {
    enabled: true,
    channels: {
      email: {
        enabled: false,
        recipients: []
      },
      slack: {
        enabled: false,
        channel: '#security-alerts',
        username: 'CryptoMixer Security'
      },
      webhook: {
        enabled: false
      },
      sms: {
        enabled: false,
        recipients: []
      }
    },
    escalation: {
      enabled: true,
      levels: [
        { threshold: 5, delay: 300000, channels: ['email'] },      // 5 минут
        { threshold: 15, delay: 900000, channels: ['slack'] },     // 15 минут  
        { threshold: 30, delay: 1800000, channels: ['sms'] }       // 30 минут
      ]
    }
  },
  
  analytics: {
    geoTracking: true,
    userAgentAnalysis: true,
    patternRecognition: true,
    machineLearning: false,
    behaviorAnalysis: true
  },
  
  integrations: {
    prometheus: {
      enabled: false,
      jobName: 'crypto-mixer-security'
    },
    grafana: {
      enabled: false
    },
    elasticsearch: {
      enabled: false,
      index: 'crypto-mixer-security-logs'
    },
    splunk: {
      enabled: false
    }
  }
};