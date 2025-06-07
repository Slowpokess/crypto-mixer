import { EventEmitter } from 'events';
import { enhancedDbLogger } from '../logger';
import { Alert, NotificationChannel, NotificationChannelConfig } from './AlertManager';

/**
 * Интерфейс для отправки уведомлений
 */
export interface NotificationProvider {
  type: NotificationChannel;
  send(alert: Alert, config: any): Promise<void>;
  validateConfig(config: any): boolean;
}

/**
 * Результат отправки уведомления
 */
export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  alertId: string;
  timestamp: Date;
  error?: string;
  retryCount?: number;
  responseTime?: number;
}

/**
 * Статистика уведомлений
 */
export interface NotificationStats {
  totalSent: number;
  successful: number;
  failed: number;
  averageResponseTime: number;
  channelStats: Record<NotificationChannel, {
    sent: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  }>;
}

/**
 * Webhook провайдер
 */
export class WebhookProvider implements NotificationProvider {
  type: NotificationChannel = 'webhook';

  async send(alert: Alert, config: any): Promise<void> {
    const payload = {
      alert: {
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        title: alert.title,
        description: alert.description,
        source: alert.source,
        timestamp: alert.timestamp.toISOString(),
        metadata: alert.metadata,
        escalationLevel: alert.escalationLevel,
        tags: alert.tags
      },
      timestamp: new Date().toISOString(),
      system: 'crypto-mixer-alerts',
      version: '1.0'
    };

    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(config.url, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CryptoMixer-AlertSystem/1.0',
        ...config.headers
      },
      body: JSON.stringify(payload),
      timeout: config.timeout || 10000
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}: ${response.statusText}`);
    }

    enhancedDbLogger.debug('📤 Webhook отправлен успешно', {
      alertId: alert.id,
      url: config.url,
      status: response.status
    });
  }

  validateConfig(config: any): boolean {
    return !!(config.url && typeof config.url === 'string');
  }
}

/**
 * Email провайдер
 */
export class EmailProvider implements NotificationProvider {
  type: NotificationChannel = 'email';

  async send(alert: Alert, config: any): Promise<void> {
    const nodemailer = require('nodemailer');

    // Создание транспорта
    const transporter = nodemailer.createTransporter({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.auth,
      timeout: config.timeout || 15000
    });

    // Формирование письма
    const mailOptions = {
      from: config.from,
      to: config.recipients.join(', '),
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      html: this.formatEmailBody(alert),
      text: this.formatEmailBodyText(alert)
    };

    // Отправка
    const result = await transporter.sendMail(mailOptions);

    enhancedDbLogger.debug('📧 Email отправлен успешно', {
      alertId: alert.id,
      recipients: config.recipients,
      messageId: result.messageId
    });
  }

  validateConfig(config: any): boolean {
    return !!(
      config.smtp &&
      config.smtp.host &&
      config.smtp.port &&
      config.from &&
      config.recipients &&
      Array.isArray(config.recipients) &&
      config.recipients.length > 0
    );
  }

  private formatEmailBody(alert: Alert): string {
    const severityColors = {
      low: '#36a64f',
      medium: '#ff9500', 
      high: '#ff0000',
      critical: '#8b0000'
    };

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Crypto Mixer Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: ${severityColors[alert.severity]}; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .field { margin-bottom: 10px; }
        .label { font-weight: bold; }
        .metadata { background-color: #f5f5f5; padding: 10px; border-radius: 5px; margin-top: 10px; }
        .footer { background-color: #f0f0f0; padding: 10px; text-align: center; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚨 ${alert.title}</h1>
        <p>Severity: ${alert.severity.toUpperCase()}</p>
    </div>
    
    <div class="content">
        <div class="field">
            <span class="label">Alert ID:</span> ${alert.id}
        </div>
        <div class="field">
            <span class="label">Type:</span> ${alert.type}
        </div>
        <div class="field">
            <span class="label">Source:</span> ${alert.source}
        </div>
        <div class="field">
            <span class="label">Status:</span> ${alert.status}
        </div>
        <div class="field">
            <span class="label">Timestamp:</span> ${alert.timestamp.toISOString()}
        </div>
        <div class="field">
            <span class="label">Description:</span><br>
            ${alert.description}
        </div>
        
        ${alert.metadata && Object.keys(alert.metadata).length > 0 ? `
        <div class="metadata">
            <span class="label">Additional Information:</span><br>
            <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
        </div>
        ` : ''}
        
        ${alert.tags.length > 0 ? `
        <div class="field">
            <span class="label">Tags:</span> ${alert.tags.join(', ')}
        </div>
        ` : ''}
    </div>
    
    <div class="footer">
        <p>Crypto Mixer Alert System - Automated notification</p>
        <p>Generated at ${new Date().toISOString()}</p>
    </div>
</body>
</html>
    `.trim();
  }

  private formatEmailBodyText(alert: Alert): string {
    return `
CRYPTO MIXER ALERT

Alert: ${alert.title}
Severity: ${alert.severity.toUpperCase()}
Type: ${alert.type}
Status: ${alert.status}
Source: ${alert.source}
Time: ${alert.timestamp.toISOString()}

Description:
${alert.description}

${alert.metadata && Object.keys(alert.metadata).length > 0 ? `
Additional Information:
${JSON.stringify(alert.metadata, null, 2)}
` : ''}

${alert.tags.length > 0 ? `Tags: ${alert.tags.join(', ')}` : ''}

---
Crypto Mixer Alert System
Generated at ${new Date().toISOString()}
    `.trim();
  }
}

/**
 * Slack провайдер
 */
export class SlackProvider implements NotificationProvider {
  type: NotificationChannel = 'slack';

  async send(alert: Alert, config: any): Promise<void> {
    const fetch = (await import('node-fetch')).default;

    const payload = {
      channel: config.channel,
      username: config.username || 'Crypto Mixer Bot',
      icon_emoji: config.iconEmoji || ':warning:',
      text: this.formatSlackText(alert),
      attachments: [this.formatSlackAttachment(alert)]
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      timeout: config.timeout || 10000
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed with status ${response.status}: ${response.statusText}`);
    }

    enhancedDbLogger.debug('💬 Slack уведомление отправлено', {
      alertId: alert.id,
      channel: config.channel
    });
  }

  validateConfig(config: any): boolean {
    return !!(config.webhookUrl && typeof config.webhookUrl === 'string');
  }

  private formatSlackText(alert: Alert): string {
    const severityEmojis = {
      low: '🟡',
      medium: '🟠', 
      high: '🔴',
      critical: '🚨'
    };

    return `${severityEmojis[alert.severity]} *ALERT:* ${alert.title}`;
  }

  private formatSlackAttachment(alert: Alert): any {
    const severityColors = {
      low: 'good',
      medium: 'warning',
      high: 'danger', 
      critical: '#8b0000'
    };

    return {
      color: severityColors[alert.severity],
      title: `Alert Details (ID: ${alert.id})`,
      fields: [
        {
          title: 'Type',
          value: alert.type,
          short: true
        },
        {
          title: 'Severity',
          value: alert.severity.toUpperCase(),
          short: true
        },
        {
          title: 'Source', 
          value: alert.source,
          short: true
        },
        {
          title: 'Status',
          value: alert.status,
          short: true
        },
        {
          title: 'Time',
          value: alert.timestamp.toISOString(),
          short: true
        },
        {
          title: 'Escalation Level',
          value: alert.escalationLevel.toString(),
          short: true
        },
        {
          title: 'Description',
          value: alert.description,
          short: false
        }
      ],
      footer: 'Crypto Mixer Alert System',
      footer_icon: 'https://crypto-mixer.local/favicon.ico',
      ts: Math.floor(alert.timestamp.getTime() / 1000)
    };
  }
}

/**
 * Telegram провайдер
 */
export class TelegramProvider implements NotificationProvider {
  type: NotificationChannel = 'telegram';

  async send(alert: Alert, config: any): Promise<void> {
    const fetch = (await import('node-fetch')).default;

    const message = this.formatTelegramMessage(alert);
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

    const payload = {
      chat_id: config.chatId,
      text: message,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      timeout: config.timeout || 10000
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API failed with status ${response.status}: ${errorText}`);
    }

    enhancedDbLogger.debug('📱 Telegram уведомление отправлено', {
      alertId: alert.id,
      chatId: config.chatId
    });
  }

  validateConfig(config: any): boolean {
    return !!(config.botToken && config.chatId);
  }

  private formatTelegramMessage(alert: Alert): string {
    const severityEmojis = {
      low: '🟡',
      medium: '🟠',
      high: '🔴', 
      critical: '🚨'
    };

    return `
${severityEmojis[alert.severity]} *CRYPTO MIXER ALERT*

*${alert.title}*

*Type:* ${alert.type}
*Severity:* ${alert.severity.toUpperCase()}
*Source:* ${alert.source}
*Status:* ${alert.status}
*Time:* ${alert.timestamp.toISOString()}

*Description:*
${alert.description}

*Alert ID:* \`${alert.id}\`
${alert.tags.length > 0 ? `*Tags:* ${alert.tags.join(', ')}` : ''}
    `.trim();
  }
}

/**
 * Менеджер уведомлений
 * Управляет отправкой уведомлений через различные каналы
 */
export class NotificationManager extends EventEmitter {
  private providers: Map<NotificationChannel, NotificationProvider> = new Map();
  private stats: NotificationStats;
  private isRunning: boolean = false;

  constructor() {
    super();
    
    // Инициализация провайдеров
    this.providers.set('webhook', new WebhookProvider());
    this.providers.set('email', new EmailProvider());
    this.providers.set('slack', new SlackProvider());
    this.providers.set('telegram', new TelegramProvider());

    // Инициализация статистики
    this.stats = {
      totalSent: 0,
      successful: 0,
      failed: 0,
      averageResponseTime: 0,
      channelStats: {
        webhook: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        email: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        slack: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        telegram: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        sms: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        push: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 }
      }
    };
  }

  /**
   * Запуск менеджера уведомлений
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      enhancedDbLogger.warn('⚠️ Notification Manager уже запущен');
      return;
    }

    const operationId = await enhancedDbLogger.startOperation('notification_manager_start');

    try {
      enhancedDbLogger.info('📤 Запуск Notification Manager', {
        providersCount: this.providers.size
      });

      this.isRunning = true;

      await enhancedDbLogger.endOperation(operationId, true);
      enhancedDbLogger.info('✅ Notification Manager запущен успешно');

      this.emit('started', {
        timestamp: new Date(),
        providers: Array.from(this.providers.keys())
      });

    } catch (error) {
      this.isRunning = false;
      await enhancedDbLogger.endOperation(operationId, false);
      await enhancedDbLogger.logError(error);
      throw error;
    }
  }

  /**
   * Остановка менеджера уведомлений
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    enhancedDbLogger.info('🛑 Остановка Notification Manager');

    this.isRunning = false;

    enhancedDbLogger.info('✅ Notification Manager остановлен');

    this.emit('stopped', {
      timestamp: new Date()
    });
  }

  /**
   * Отправка уведомления
   */
  async sendNotification(
    alert: Alert,
    channel: NotificationChannelConfig
  ): Promise<NotificationResult> {
    const startTime = Date.now();
    const result: NotificationResult = {
      success: false,
      channel: channel.type,
      alertId: alert.id,
      timestamp: new Date(),
      retryCount: 0
    };

    try {
      const provider = this.providers.get(channel.type);
      
      if (!provider) {
        throw new Error(`Провайдер для канала ${channel.type} не найден`);
      }

      if (!provider.validateConfig(channel.config)) {
        throw new Error(`Неверная конфигурация для канала ${channel.type}`);
      }

      // Попытки отправки с повторами
      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt <= channel.retries) {
        try {
          await provider.send(alert, channel.config);
          
          result.success = true;
          result.retryCount = attempt;
          result.responseTime = Date.now() - startTime;
          
          break;
          
        } catch (error) {
          lastError = error as Error;
          attempt++;
          
          if (attempt <= channel.retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Exponential backoff
            await this.sleep(delay);
            
            enhancedDbLogger.warn('🔄 Повтор отправки уведомления', {
              alertId: alert.id,
              channel: channel.type,
              attempt,
              delay
            });
          }
        }
      }

      if (!result.success && lastError) {
        throw lastError;
      }

    } catch (error) {
      result.success = false;
      result.error = (error as Error).message;
      result.responseTime = Date.now() - startTime;
      
      enhancedDbLogger.error('❌ Ошибка отправки уведомления', {
        alertId: alert.id,
        channel: channel.type,
        error: result.error
      });
    }

    // Обновление статистики
    this.updateStats(result);

    this.emit('notification_sent', result);

    return result;
  }

  /**
   * Отправка уведомлений по всем каналам
   */
  async sendToAllChannels(
    alert: Alert,
    channels: NotificationChannelConfig[]
  ): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    // Отправка параллельно
    const promises = channels
      .filter(channel => channel.enabled)
      .map(channel => this.sendNotification(alert, channel));

    const settledResults = await Promise.allSettled(promises);

    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const channel = channels[index];
        results.push({
          success: false,
          channel: channel.type,
          alertId: alert.id,
          timestamp: new Date(),
          error: result.reason?.message || 'Unknown error',
          retryCount: 0
        });
      }
    });

    return results;
  }

  /**
   * Обновление статистики
   */
  private updateStats(result: NotificationResult): void {
    this.stats.totalSent++;
    
    if (result.success) {
      this.stats.successful++;
      
      if (result.responseTime) {
        const totalResponseTime = this.stats.averageResponseTime * (this.stats.successful - 1) + result.responseTime;
        this.stats.averageResponseTime = totalResponseTime / this.stats.successful;
      }
    } else {
      this.stats.failed++;
    }

    // Статистика по каналам
    const channelStats = this.stats.channelStats[result.channel];
    channelStats.sent++;
    
    if (result.success) {
      channelStats.successful++;
      
      if (result.responseTime) {
        const totalResponseTime = channelStats.averageResponseTime * (channelStats.successful - 1) + result.responseTime;
        channelStats.averageResponseTime = totalResponseTime / channelStats.successful;
      }
    } else {
      channelStats.failed++;
    }
  }

  /**
   * Получение статистики
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * Сброс статистики
   */
  resetStats(): void {
    this.stats = {
      totalSent: 0,
      successful: 0,
      failed: 0,
      averageResponseTime: 0,
      channelStats: {
        webhook: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        email: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        slack: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        telegram: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        sms: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 },
        push: { sent: 0, successful: 0, failed: 0, averageResponseTime: 0 }
      }
    };
  }

  /**
   * Проверка работоспособности канала
   */
  async testChannel(channel: NotificationChannelConfig): Promise<boolean> {
    try {
      const provider = this.providers.get(channel.type);
      
      if (!provider) {
        return false;
      }

      const testAlert: Alert = {
        id: 'test_' + Date.now(),
        type: 'performance',
        severity: 'low',
        status: 'triggered',
        title: 'Test Alert',
        description: 'This is a test alert to verify the notification channel configuration.',
        source: 'notification_manager_test',
        metadata: { test: true },
        timestamp: new Date(),
        escalationLevel: 0,
        tags: ['test']
      };

      await provider.send(testAlert, channel.config);
      return true;

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка тестирования канала', {
        channel: channel.type,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Получение доступных провайдеров
   */
  getAvailableProviders(): NotificationChannel[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Регистрация нового провайдера
   */
  registerProvider(provider: NotificationProvider): void {
    this.providers.set(provider.type, provider);
    
    // Инициализация статистики для нового канала
    if (!this.stats.channelStats[provider.type]) {
      this.stats.channelStats[provider.type] = {
        sent: 0,
        successful: 0,
        failed: 0,
        averageResponseTime: 0
      };
    }

    enhancedDbLogger.info('📤 Зарегистрирован новый провайдер уведомлений', {
      type: provider.type
    });
  }

  /**
   * Получение статуса работы
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Утилита для задержки
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default NotificationManager;