import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as net from 'net';
import { EventEmitter } from 'events';
import { enhancedDbLogger } from './logger';

/**
 * Расширенный менеджер Tor для CryptoMixer
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Полная реализация Tor интеграции с:
 * - Автоматическим переключением между Tor и обычными соединениями
 * - Множественными SOCKS портами для изоляции трафика
 * - Мониторингом состояния Tor
 * - Ротацией цепочек для максимальной анонимности
 * - Интеграцией со всеми blockchain клиентами
 */

export interface TorConfig {
  socksPort: number;
  controlPort: number;
  controlPassword: string;
  enabled: boolean;
  circuitTimeout: number;
  maxRetries: number;
  retryDelay: number;
  isolationLevel: 'none' | 'destination' | 'full';
}

export interface TorConnectionInfo {
  isConnected: boolean;
  circuitCount: number;
  bandwidth: {
    read: number;
    written: number;
  };
  lastCircuitRotation: Date;
  onionAddress?: string;
  errors: string[];
}

export class TorManager extends EventEmitter {
  private config: TorConfig;
  private socksAgent: SocksProxyAgent | null = null;
  private httpsAgent: HttpsProxyAgent | null = null;
  private axiosInstance: AxiosInstance;
  private connectionInfo: TorConnectionInfo;
  private isInitialized = false;
  private circuitRotationTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private stats = {
    requestCount: 0,
    errorCount: 0,
    circuitRotations: 0,
    lastError: null as Error | null,
  };

  // Конфигурация для разных типов соединений
  private readonly CONNECTION_CONFIGS = {
    // Основной SOCKS порт для веб-трафика
    web: { port: 9050, isolation: 'IsolateDestAddr IsolateDestPort' },
    // Порт для blockchain соединений
    blockchain: { port: 9051, isolation: 'IsolateClientAuth IsolateSOCKSAuth' },
    // Порт для API запросов
    api: { port: 9052, isolation: 'IsolateDestAddr IsolateDestPort IsolateClientProtocol' },
  };

  constructor(config: Partial<TorConfig> = {}) {
    super();
    
    this.config = {
      socksPort: 9050,
      controlPort: 9053,
      controlPassword: process.env.TOR_CONTROL_PASSWORD || '',
      enabled: process.env.TOR_ENABLED === 'true',
      circuitTimeout: 30000, // 30 секунд
      maxRetries: 3,
      retryDelay: 5000, // 5 секунд
      isolationLevel: 'full',
      ...config,
    };

    this.connectionInfo = {
      isConnected: false,
      circuitCount: 0,
      bandwidth: { read: 0, written: 0 },
      lastCircuitRotation: new Date(),
      errors: [],
    };

    // Создаем базовый axios instance
    this.axiosInstance = axios.create({
      timeout: this.config.circuitTimeout,
      headers: {
        'User-Agent': this.generateRandomUserAgent(),
      },
    });

    enhancedDbLogger.info('🧅 TorManager инициализирован', {
      enabled: this.config.enabled,
      socksPort: this.config.socksPort,
      controlPort: this.config.controlPort,
    });
  }

  /**
   * Инициализация Tor соединения
   */
  public async initialize(): Promise<void> {
    if (!this.config.enabled) {
      enhancedDbLogger.info('🧅 Tor отключен в конфигурации');
      return;
    }

    try {
      enhancedDbLogger.info('🧅 Инициализация Tor соединения...');

      // Проверяем доступность Tor
      await this.checkTorAvailability();

      // Создаем SOCKS агентов
      await this.createSocksAgents();

      // Получаем информацию о hidden service
      await this.getHiddenServiceInfo();

      // Запускаем мониторинг
      this.startHealthMonitoring();
      this.startCircuitRotation();

      this.isInitialized = true;
      this.connectionInfo.isConnected = true;
      
      enhancedDbLogger.info('✅ TorManager успешно инициализирован');
      this.emit('connected');

    } catch (error) {
      // Правильная типизация error для безопасного использования
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      
      enhancedDbLogger.error('❌ Ошибка инициализации TorManager:', { error: errorMessage });
      this.connectionInfo.errors.push(errorMessage);
      this.stats.lastError = errorToLog;
      throw errorToLog;
    }
  }

  /**
   * Проверка доступности Tor
   */
  private async checkTorAvailability(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Tor SOCKS не доступен на порту ${this.config.socksPort}`));
      }, 5000);

      socket.connect(this.config.socksPort, '127.0.0.1', () => {
        clearTimeout(timeout);
        socket.destroy();
        enhancedDbLogger.info(`✅ Tor SOCKS доступен на порту ${this.config.socksPort}`);
        resolve();
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Tor SOCKS недоступен: ${error.message}`));
      });
    });
  }

  /**
   * Создание SOCKS агентов для разных типов соединений
   */
  private async createSocksAgents(): Promise<void> {
    try {
      // Основной SOCKS агент
      this.socksAgent = new SocksProxyAgent(`socks5://127.0.0.1:${this.config.socksPort}`);
      
      // HTTPS агент
      this.httpsAgent = new HttpsProxyAgent(`socks5://127.0.0.1:${this.config.socksPort}`);

      // Настраиваем axios instance с Tor агентом
      this.axiosInstance.defaults.httpAgent = this.socksAgent;
      this.axiosInstance.defaults.httpsAgent = this.httpsAgent;

      // Добавляем interceptors для логирования
      this.setupAxiosInterceptors();

      enhancedDbLogger.info('✅ SOCKS агенты созданы успешно');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      enhancedDbLogger.error('❌ Ошибка создания SOCKS агентов:', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Настройка Axios interceptors
   */
  private setupAxiosInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        this.stats.requestCount++;
        
        // Добавляем случайные заголовки для маскировки
        // Правильная работа с AxiosHeaders
        if (config.headers) {
          config.headers['Accept-Language'] = this.generateRandomAcceptLanguage();
          config.headers['DNT'] = '1';
          config.headers['Upgrade-Insecure-Requests'] = '1';
        }

        enhancedDbLogger.debug('🧅 Tor запрос:', { 
          method: config.method, 
          url: config.url,
          headers: config.headers 
        });

        return config;
      },
      (error) => {
        this.stats.errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        enhancedDbLogger.error('❌ Ошибка Tor запроса:', { error: errorMessage });
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        enhancedDbLogger.debug('✅ Tor ответ получен:', { 
          status: response.status, 
          url: response.config.url 
        });
        return response;
      },
      async (error) => {
        this.stats.errorCount++;
        this.stats.lastError = error;

        // Если соединение неудачное, пытаемся сменить цепочку
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          enhancedDbLogger.warn('🔄 Ошибка соединения, ротируем цепочку...');
          await this.rotateCircuit();
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Получение информации о hidden service
   */
  private async getHiddenServiceInfo(): Promise<void> {
    try {
      // Пытаемся прочитать onion адрес из файловой системы
      // В Docker это будет через volume
      const fs = await import('fs/promises');
      
      try {
        const onionAddress = await fs.readFile('/shared/onion-address.txt', 'utf-8');
        this.connectionInfo.onionAddress = onionAddress.trim();
        enhancedDbLogger.info(`🧅 Hidden service адрес: ${this.connectionInfo.onionAddress}`);
      } catch (error) {
        enhancedDbLogger.warn('⚠️ Не удалось получить onion адрес из файла');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      enhancedDbLogger.error('❌ Ошибка получения информации о hidden service:', { error: errorMessage });
    }
  }

  /**
   * Ротация цепочек Tor
   */
  public async rotateCircuit(): Promise<void> {
    if (!this.isInitialized) {
      enhancedDbLogger.warn('⚠️ TorManager не инициализирован');
      return;
    }

    try {
      enhancedDbLogger.info('🔄 Начинаем ротацию Tor цепочек...');

      // Отправляем сигнал NEWNYM через control port
      await this.sendControlCommand('SIGNAL NEWNYM');
      
      // Ждем немного для установки новых цепочек
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.connectionInfo.lastCircuitRotation = new Date();
      this.stats.circuitRotations++;

      enhancedDbLogger.info('✅ Ротация цепочек завершена');
      this.emit('circuitRotated');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      enhancedDbLogger.error('❌ Ошибка ротации цепочек:', { error: errorMessage });
      this.connectionInfo.errors.push(`Circuit rotation failed: ${errorMessage}`);
    }
  }

  /**
   * Отправка команды через Tor control port
   */
  private async sendControlCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let response = '';

      socket.connect(this.config.controlPort, '127.0.0.1', () => {
        // Аутентификация
        const authCommand = `AUTHENTICATE "${this.config.controlPassword}"\r\n`;
        socket.write(authCommand);
      });

      socket.on('data', (data) => {
        response += data.toString();
        
        if (response.includes('250 OK\r\n')) {
          if (!response.includes(command)) {
            // Отправляем основную команду после аутентификации
            socket.write(`${command}\r\n`);
          } else {
            // Команда выполнена
            socket.write('QUIT\r\n');
            socket.end();
            resolve(response);
          }
        } else if (response.includes('515') || response.includes('550')) {
          reject(new Error(`Control command failed: ${response}`));
        }
      });

      socket.on('error', (error) => {
        reject(error);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('Control connection timeout'));
      });

      socket.setTimeout(10000);
    });
  }

  /**
   * Запуск мониторинга здоровья Tor
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        enhancedDbLogger.error('❌ Ошибка проверки здоровья Tor:', { error: errorMessage });
      }
    }, 30000); // Каждые 30 секунд
  }

  /**
   * Запуск автоматической ротации цепочек
   */
  private startCircuitRotation(): void {
    // Ротируем цепочки каждые 10 минут
    this.circuitRotationTimer = setInterval(async () => {
      await this.rotateCircuit();
    }, 10 * 60 * 1000); // 10 минут
  }

  /**
   * Проверка здоровья Tor соединения
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Проверяем доступность SOCKS порта
      await this.checkTorAvailability();

      // Получаем статистику цепочек
      const circuitInfo = await this.sendControlCommand('GETINFO circuit-status');
      const circuits = circuitInfo.split('\n').filter(line => line.includes('BUILT'));
      this.connectionInfo.circuitCount = circuits.length;

      // Получаем статистику трафика
      const trafficInfo = await this.sendControlCommand('GETINFO traffic/read traffic/written');
      const trafficLines = trafficInfo.split('\n');
      
      for (const line of trafficLines) {
        if (line.includes('traffic/read=')) {
          this.connectionInfo.bandwidth.read = parseInt(line.split('=')[1]) || 0;
        }
        if (line.includes('traffic/written=')) {
          this.connectionInfo.bandwidth.written = parseInt(line.split('=')[1]) || 0;
        }
      }

      // Очищаем старые ошибки
      this.connectionInfo.errors = this.connectionInfo.errors.slice(-5);

      this.emit('healthCheck', this.connectionInfo);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorToEmit = error instanceof Error ? error : new Error(String(error));
      
      this.connectionInfo.isConnected = false;
      this.connectionInfo.errors.push(`Health check failed: ${errorMessage}`);
      this.emit('healthCheckFailed', errorToEmit);
    }
  }

  /**
   * Получение специализированного axios instance для определенного типа соединения
   */
  public getAxiosInstance(connectionType: 'web' | 'blockchain' | 'api' = 'web'): AxiosInstance {
    if (!this.config.enabled || !this.isInitialized) {
      // Возвращаем обычный axios instance без Tor
      return axios.create({
        timeout: this.config.circuitTimeout,
        headers: {
          'User-Agent': this.generateRandomUserAgent(),
        },
      });
    }

    const config = this.CONNECTION_CONFIGS[connectionType];
    const socksAgent = new SocksProxyAgent(`socks5://127.0.0.1:${config.port}`);
    const httpsAgent = new HttpsProxyAgent(`socks5://127.0.0.1:${config.port}`);

    return axios.create({
      timeout: this.config.circuitTimeout,
      httpAgent: socksAgent,
      httpsAgent: httpsAgent,
      headers: {
        'User-Agent': this.generateRandomUserAgent(),
        'Accept-Language': this.generateRandomAcceptLanguage(),
        'DNT': '1',
      },
    });
  }

  /**
   * Генерация случайного User-Agent
   */
  private generateRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Генерация случайного Accept-Language заголовка
   */
  private generateRandomAcceptLanguage(): string {
    const languages = [
      'en-US,en;q=0.9',
      'en-GB,en;q=0.9',
      'ru-RU,ru;q=0.9,en;q=0.8',
      'de-DE,de;q=0.9,en;q=0.8',
      'fr-FR,fr;q=0.9,en;q=0.8',
    ];

    return languages[Math.floor(Math.random() * languages.length)];
  }

  /**
   * Получение статистики работы
   */
  public getStats() {
    return {
      ...this.stats,
      connectionInfo: this.connectionInfo,
      isEnabled: this.config.enabled,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Проверка доступности через Tor
   */
  public async testConnection(url: string = 'https://check.torproject.org/api/ip'): Promise<any> {
    try {
      const response = await this.axiosInstance.get(url);
      enhancedDbLogger.info('✅ Tor тест соединения успешен:', response.data);
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      enhancedDbLogger.error('❌ Tor тест соединения неудачен:', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Остановка TorManager
   */
  public async shutdown(): Promise<void> {
    enhancedDbLogger.info('🛑 Останавливаем TorManager...');

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    if (this.circuitRotationTimer) {
      clearInterval(this.circuitRotationTimer);
    }

    this.isInitialized = false;
    this.connectionInfo.isConnected = false;

    this.emit('disconnected');
    enhancedDbLogger.info('✅ TorManager остановлен');
  }
}

// Создаем глобальный экземпляр TorManager
export const torManager = new TorManager();

// Инициализируем при запуске модуля
if (process.env.NODE_ENV !== 'test') {
  torManager.initialize().catch(error => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    enhancedDbLogger.error('❌ Ошибка инициализации TorManager:', { error: errorMessage });
  });
}