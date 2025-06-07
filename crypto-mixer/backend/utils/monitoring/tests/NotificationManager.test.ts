import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import NotificationManager, { WebhookProvider, EmailProvider, SlackProvider, TelegramProvider } from '../NotificationManager';
import { Alert, NotificationChannelConfig } from '../AlertManager';

// Мокаем node-fetch для тестирования
vi.mock('node-fetch', () => ({
  default: vi.fn()
}));

// Мокаем nodemailer
vi.mock('nodemailer', () => ({
  createTransporter: vi.fn(() => ({
    sendMail: vi.fn(() => Promise.resolve({ messageId: 'test-id' }))
  }))
}));

describe('NotificationManager', () => {
  let notificationManager: NotificationManager;
  let mockAlert: Alert;

  beforeEach(async () => {
    notificationManager = new NotificationManager();
    
    // Создаем тестовый алерт
    mockAlert = {
      id: 'test_alert_123',
      type: 'performance',
      severity: 'high',
      status: 'triggered',
      title: 'Test Performance Alert',
      description: 'CPU usage exceeded threshold',
      source: 'performance_monitor',
      metadata: {
        cpu: 95,
        threshold: 80,
        timestamp: '2024-01-01T12:00:00Z'
      },
      timestamp: new Date('2024-01-01T12:00:00Z'),
      escalationLevel: 0,
      tags: ['performance', 'cpu', 'critical']
    };

    await notificationManager.start();
  });

  afterEach(async () => {
    if (notificationManager.isActive()) {
      await notificationManager.stop();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize successfully', () => {
      expect(notificationManager).toBeDefined();
      expect(notificationManager.isActive()).toBe(true);
    });

    it('should start and stop correctly', async () => {
      const manager = new NotificationManager();
      
      expect(manager.isActive()).toBe(false);
      
      await manager.start();
      expect(manager.isActive()).toBe(true);
      
      await manager.stop();
      expect(manager.isActive()).toBe(false);
    });

    it('should have default providers registered', () => {
      const providers = notificationManager.getAvailableProviders();
      
      expect(providers).toContain('webhook');
      expect(providers).toContain('email');
      expect(providers).toContain('slack');
      expect(providers).toContain('telegram');
    });

    it('should emit started and stopped events', async () => {
      const manager = new NotificationManager();
      const startedHandler = vi.fn();
      const stoppedHandler = vi.fn();

      manager.on('started', startedHandler);
      manager.on('stopped', stoppedHandler);

      await manager.start();
      expect(startedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
          providers: expect.arrayContaining(['webhook', 'email', 'slack', 'telegram'])
        })
      );

      await manager.stop();
      expect(stoppedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date)
        })
      );
    });
  });

  describe('Statistics', () => {
    it('should initialize with empty statistics', () => {
      const stats = notificationManager.getStats();
      
      expect(stats.totalSent).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.averageResponseTime).toBe(0);
      
      Object.values(stats.channelStats).forEach(channelStat => {
        expect(channelStat.sent).toBe(0);
        expect(channelStat.successful).toBe(0);
        expect(channelStat.failed).toBe(0);
        expect(channelStat.averageResponseTime).toBe(0);
      });
    });

    it('should reset statistics', () => {
      // Имитируем некоторую статистику
      notificationManager['stats'].totalSent = 10;
      notificationManager['stats'].successful = 8;
      notificationManager['stats'].failed = 2;

      notificationManager.resetStats();
      const stats = notificationManager.getStats();

      expect(stats.totalSent).toBe(0);
      expect(stats.successful).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });

  describe('Webhook Provider', () => {
    let webhookProvider: WebhookProvider;
    let mockFetch: any;

    beforeEach(async () => {
      webhookProvider = new WebhookProvider();
      mockFetch = (await import('node-fetch')).default as any;
    });

    it('should validate webhook configuration correctly', () => {
      const validConfig = {
        url: 'https://example.com/webhook',
        headers: { 'Content-Type': 'application/json' }
      };

      const invalidConfig = {
        headers: { 'Content-Type': 'application/json' }
        // url отсутствует
      };

      expect(webhookProvider.validateConfig(validConfig)).toBe(true);
      expect(webhookProvider.validateConfig(invalidConfig)).toBe(false);
    });

    it('should send webhook notification successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const config = {
        url: 'https://example.com/webhook',
        headers: { 'Authorization': 'Bearer token123' }
      };

      await expect(webhookProvider.send(mockAlert, config)).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'CryptoMixer-AlertSystem/1.0',
            'Authorization': 'Bearer token123'
          }),
          body: expect.stringContaining(mockAlert.id),
          timeout: 10000
        })
      );
    });

    it('should handle webhook failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const config = {
        url: 'https://example.com/webhook'
      };

      await expect(webhookProvider.send(mockAlert, config))
        .rejects
        .toThrow('Webhook failed with status 500: Internal Server Error');
    });
  });

  describe('Email Provider', () => {
    let emailProvider: EmailProvider;
    let mockNodemailer: any;

    beforeEach(() => {
      emailProvider = new EmailProvider();
      mockNodemailer = require('nodemailer');
    });

    it('should validate email configuration correctly', () => {
      const validConfig = {
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: {
            user: 'user@example.com',
            pass: 'password'
          }
        },
        from: 'alerts@example.com',
        recipients: ['admin@example.com', 'ops@example.com']
      };

      const invalidConfig = {
        smtp: {
          host: 'smtp.example.com'
          // port отсутствует
        },
        recipients: []
      };

      expect(emailProvider.validateConfig(validConfig)).toBe(true);
      expect(emailProvider.validateConfig(invalidConfig)).toBe(false);
    });

    it('should send email notification successfully', async () => {
      const mockTransporter = {
        sendMail: vi.fn().mockResolvedValue({ messageId: 'test-message-id' })
      };
      mockNodemailer.createTransporter.mockReturnValue(mockTransporter);

      const config = {
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: {
            user: 'user@example.com',
            pass: 'password'
          }
        },
        from: 'alerts@example.com',
        recipients: ['admin@example.com']
      };

      await expect(emailProvider.send(mockAlert, config)).resolves.not.toThrow();

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'alerts@example.com',
          to: 'admin@example.com',
          subject: '[HIGH] Test Performance Alert',
          html: expect.stringContaining(mockAlert.title),
          text: expect.stringContaining(mockAlert.description)
        })
      );
    });

    it('should format email content correctly', () => {
      const htmlContent = emailProvider['formatEmailBody'](mockAlert);
      const textContent = emailProvider['formatEmailBodyText'](mockAlert);

      expect(htmlContent).toContain(mockAlert.title);
      expect(htmlContent).toContain(mockAlert.description);
      expect(htmlContent).toContain(mockAlert.severity.toUpperCase());
      expect(htmlContent).toContain('HIGH');

      expect(textContent).toContain(mockAlert.title);
      expect(textContent).toContain(mockAlert.description);
      expect(textContent).toContain('HIGH');
    });
  });

  describe('Slack Provider', () => {
    let slackProvider: SlackProvider;
    let mockFetch: any;

    beforeEach(async () => {
      slackProvider = new SlackProvider();
      mockFetch = (await import('node-fetch')).default as any;
    });

    it('should validate slack configuration correctly', () => {
      const validConfig = {
        webhookUrl: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
        channel: '#alerts',
        username: 'AlertBot'
      };

      const invalidConfig = {
        channel: '#alerts'
        // webhookUrl отсутствует
      };

      expect(slackProvider.validateConfig(validConfig)).toBe(true);
      expect(slackProvider.validateConfig(invalidConfig)).toBe(false);
    });

    it('should send slack notification successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const config = {
        webhookUrl: 'https://hooks.slack.com/services/test',
        channel: '#alerts',
        username: 'CryptoMixer Bot',
        iconEmoji: ':warning:'
      };

      await expect(slackProvider.send(mockAlert, config)).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining(mockAlert.title)
        })
      );
    });

    it('should format slack message correctly', () => {
      const text = slackProvider['formatSlackText'](mockAlert);
      const attachment = slackProvider['formatSlackAttachment'](mockAlert);

      expect(text).toContain('🔴'); // High severity emoji
      expect(text).toContain(mockAlert.title);

      expect(attachment.title).toContain(mockAlert.id);
      expect(attachment.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Type',
            value: mockAlert.type
          }),
          expect.objectContaining({
            title: 'Severity',
            value: mockAlert.severity.toUpperCase()
          })
        ])
      );
    });
  });

  describe('Telegram Provider', () => {
    let telegramProvider: TelegramProvider;
    let mockFetch: any;

    beforeEach(async () => {
      telegramProvider = new TelegramProvider();
      mockFetch = (await import('node-fetch')).default as any;
    });

    it('should validate telegram configuration correctly', () => {
      const validConfig = {
        botToken: '123456789:AABBCCDDEEFFaabbccddeeff',
        chatId: '-1001234567890'
      };

      const invalidConfig = {
        botToken: '123456789:AABBCCDDEEFFaabbccddeeff'
        // chatId отсутствует
      };

      expect(telegramProvider.validateConfig(validConfig)).toBe(true);
      expect(telegramProvider.validateConfig(invalidConfig)).toBe(false);
    });

    it('should send telegram notification successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const config = {
        botToken: '123456789:AABBCCDDEEFFaabbccddeeff',
        chatId: '-1001234567890'
      };

      await expect(telegramProvider.send(mockAlert, config)).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/bot123456789:AABBCCDDEEFFaabbccddeeff/sendMessage',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining(mockAlert.title)
        })
      );
    });

    it('should format telegram message correctly', () => {
      const message = telegramProvider['formatTelegramMessage'](mockAlert);

      expect(message).toContain('🔴'); // High severity emoji
      expect(message).toContain(mockAlert.title);
      expect(message).toContain(mockAlert.description);
      expect(message).toContain(mockAlert.id);
      expect(message).toContain('HIGH');
    });
  });

  describe('Notification Sending', () => {
    it('should send notification successfully', async () => {
      const mockFetch = (await import('node-fetch')).default as any;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const channel: NotificationChannelConfig = {
        type: 'webhook',
        enabled: true,
        config: {
          url: 'https://example.com/webhook'
        },
        retries: 3,
        timeout: 10000
      };

      const result = await notificationManager.sendNotification(mockAlert, channel);

      expect(result.success).toBe(true);
      expect(result.channel).toBe('webhook');
      expect(result.alertId).toBe(mockAlert.id);
      expect(result.retryCount).toBe(0);
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should handle notification failure', async () => {
      const channel: NotificationChannelConfig = {
        type: 'webhook',
        enabled: true,
        config: {
          url: 'invalid-url'
        },
        retries: 1,
        timeout: 1000
      };

      const result = await notificationManager.sendNotification(mockAlert, channel);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should retry failed notifications', async () => {
      const mockFetch = (await import('node-fetch')).default as any;
      
      // Первые два вызова неудачны, третий успешен
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const channel: NotificationChannelConfig = {
        type: 'webhook',
        enabled: true,
        config: {
          url: 'https://example.com/webhook'
        },
        retries: 3,
        timeout: 1000
      };

      const result = await notificationManager.sendNotification(mockAlert, channel);

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2); // Два повтора до успеха
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should send to multiple channels', async () => {
      const mockFetch = (await import('node-fetch')).default as any;
      mockFetch.mockResolvedValue({ ok: true, status: 200 });

      const channels: NotificationChannelConfig[] = [
        {
          type: 'webhook',
          enabled: true,
          config: { url: 'https://example.com/webhook1' },
          retries: 1,
          timeout: 5000
        },
        {
          type: 'slack',
          enabled: true,
          config: { 
            webhookUrl: 'https://hooks.slack.com/test',
            channel: '#alerts'
          },
          retries: 1,
          timeout: 5000
        }
      ];

      const results = await notificationManager.sendToAllChannels(mockAlert, channels);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(results[0].channel).toBe('webhook');
      expect(results[1].channel).toBe('slack');
    });

    it('should update statistics correctly', async () => {
      const mockFetch = (await import('node-fetch')).default as any;
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const channel: NotificationChannelConfig = {
        type: 'webhook',
        enabled: true,
        config: { url: 'https://example.com/webhook' },
        retries: 1,
        timeout: 5000
      };

      await notificationManager.sendNotification(mockAlert, channel);

      const stats = notificationManager.getStats();
      expect(stats.totalSent).toBe(1);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.channelStats.webhook.sent).toBe(1);
      expect(stats.channelStats.webhook.successful).toBe(1);
    });

    it('should emit notification_sent event', async () => {
      const mockFetch = (await import('node-fetch')).default as any;
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const eventHandler = vi.fn();
      notificationManager.on('notification_sent', eventHandler);

      const channel: NotificationChannelConfig = {
        type: 'webhook',
        enabled: true,
        config: { url: 'https://example.com/webhook' },
        retries: 1,
        timeout: 5000
      };

      await notificationManager.sendNotification(mockAlert, channel);

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          channel: 'webhook',
          alertId: mockAlert.id
        })
      );
    });
  });

  describe('Channel Testing', () => {
    it('should test webhook channel successfully', async () => {
      const mockFetch = (await import('node-fetch')).default as any;
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const channel: NotificationChannelConfig = {
        type: 'webhook',
        enabled: true,
        config: { url: 'https://example.com/webhook' },
        retries: 1,
        timeout: 5000
      };

      const result = await notificationManager.testChannel(channel);
      expect(result).toBe(true);
    });

    it('should handle test channel failure', async () => {
      const channel: NotificationChannelConfig = {
        type: 'webhook',
        enabled: true,
        config: { url: 'invalid-url' },
        retries: 1,
        timeout: 1000
      };

      const result = await notificationManager.testChannel(channel);
      expect(result).toBe(false);
    });

    it('should return false for unknown provider', async () => {
      const channel: NotificationChannelConfig = {
        type: 'unknown' as any,
        enabled: true,
        config: {},
        retries: 1,
        timeout: 5000
      };

      const result = await notificationManager.testChannel(channel);
      expect(result).toBe(false);
    });
  });

  describe('Custom Providers', () => {
    it('should register custom provider', () => {
      const customProvider = {
        type: 'custom' as any,
        send: vi.fn().mockResolvedValue(undefined),
        validateConfig: vi.fn().mockReturnValue(true)
      };

      notificationManager.registerProvider(customProvider);

      const providers = notificationManager.getAvailableProviders();
      expect(providers).toContain('custom');
    });

    it('should initialize statistics for custom provider', () => {
      const customProvider = {
        type: 'custom' as any,
        send: vi.fn().mockResolvedValue(undefined),
        validateConfig: vi.fn().mockReturnValue(true)
      };

      notificationManager.registerProvider(customProvider);

      const stats = notificationManager.getStats();
      expect(stats.channelStats.custom).toBeDefined();
      expect(stats.channelStats.custom.sent).toBe(0);
    });
  });
});