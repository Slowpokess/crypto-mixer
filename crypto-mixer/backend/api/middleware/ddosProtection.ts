import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import { enhancedDbLogger } from '../../utils/logger';

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
  // Основные параметры
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high' | 'adaptive';
  
  // Пороги для различных типов атак
  thresholds: {
    requestsPerSecond: number;      // Общий RPS
    requestsPerIP: number;          // RPS с одного IP
    concurrentConnections: number;  // Одновременные соединения
    uniqueIPsPerMinute: number;     // Уникальные IP в минуту
    errorRate: number;              // Процент ошибок
    payloadSize: number;            // Размер payload в байтах
    requestDuration: number;        // Длительность запроса в мс
  };
  
  // Обнаружение паттернов
  patternDetection: {
    enabled: boolean;
    algorithms: string[];           // ['entropy', 'clustering', 'statistical']
    analysisWindow: number;         // Окно анализа в секундах
    minSamples: number;            // Минимум образцов для анализа
  };
  
  // Типы атак для обнаружения
  attackTypes: {
    volumetric: boolean;           // Объемные атаки
    slowloris: boolean;           // Slow connection attacks
    httpFlood: boolean;           // HTTP flood attacks
    amplification: boolean;       // Amplification attacks
    botnet: boolean;             // Botnet attacks
  };
  
  // Действия при обнаружении атаки
  mitigation: {
    autoBlock: boolean;           // Автоматическая блокировка
    blockDuration: number;        // Длительность блокировки в секундах
    escalation: {
      enabled: boolean;
      levels: Array<{
        threshold: number;        // Порог для эскалации
        action: string;          // 'throttle' | 'block' | 'captcha' | 'alert'
        duration: number;        // Длительность действия
      }>;
    };
  };
  
  // Машинное обучение
  machineLearning: {
    enabled: boolean;
    model: 'statistical' | 'neural' | 'ensemble';
    trainingPeriod: number;       // Период обучения в часах
    adaptationRate: number;       // Скорость адаптации (0-1)
  };
  
  // Геолокация и репутация IP
  reputation: {
    enabled: boolean;
    databases: string[];          // ['tor', 'malware', 'proxy', 'botnet']
    trustScore: {
      minScore: number;           // Минимальный доверительный счет
      decayRate: number;          // Скорость деградации репутации
    };
  };
  
  // Интеграция с внешними сервисами
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
  confidence: number;             // Уверенность в обнаружении (0-1)
  indicators: string[];           // Список индикаторов атаки
  sourceIPs: string[];            // IP источники
  targetEndpoints: string[];      // Целевые эндпоинты
  startTime: Date;
  endTime?: Date;
  metrics: {
    requestCount: number;
    uniqueIPs: number;
    bandwidth: number;            // Байт/сек
    errorRate: number;
    avgResponseTime: number;
  };
}

export interface TrafficStats {
  timestamp: Date;
  requestsPerSecond: number;
  uniqueIPs: number;
  topIPs: Array<{ ip: string; count: number; reputation: number }>;
  topEndpoints: Array<{ endpoint: string; count: number }>;
  topUserAgents: Array<{ userAgent: string; count: number }>;
  errorRates: { [statusCode: number]: number };
  averageResponseTime: number;
  totalBandwidth: number;
  suspiciousActivity: number;
  geolocation: { [country: string]: number };
}

/**
 * Продвинутая DDoS защита
 */
export class AdvancedDDoSProtection extends EventEmitter {
  private config: DDoSConfig;
  private isActive: boolean = false;
  
  // Статистика трафика
  private trafficHistory: TrafficStats[] = [];
  private currentWindow: Map<string, any> = new Map();
  private ipReputation: Map<string, number> = new Map();
  
  // Обнаруженные атаки
  private activeAttacks: Map<string, AttackSignature> = new Map();
  private attackHistory: AttackSignature[] = [];
  
  // Машинное обучение
  private mlModel: any = null;
  private trainingData: any[] = [];
  
  // Блокировки
  private blockedIPs: Map<string, { reason: string; until: Date; level: number }> = new Map();
  private suspiciousIPs: Set<string> = new Set();
  
  // Таймеры
  private analysisInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: DDoSConfig) {
    super();
    this.config = config;
    
    if (this.config.enabled) {
      this.initialize();
    }
  }

  /**
   * RUSSIAN: Инициализация системы DDoS защиты
   */
  private async initialize(): Promise<void> {
    enhancedDbLogger.info('🛡️ Инициализация продвинутой DDoS защиты', {
      sensitivity: this.config.sensitivity,
      attackTypes: Object.keys(this.config.attackTypes).filter(key => this.config.attackTypes[key as keyof typeof this.config.attackTypes]),
      machineLearning: this.config.machineLearning.enabled
    });

    // RUSSIAN: Инициализация модели машинного обучения
    if (this.config.machineLearning.enabled) {
      await this.initializeMachineLearning();
    }

    // RUSSIAN: Загрузка баз данных репутации
    if (this.config.reputation.enabled) {
      await this.loadReputationDatabases();
    }

    // RUSSIAN: Запуск анализа трафика
    this.startTrafficAnalysis();
    
    // RUSSIAN: Запуск очистки устаревших данных
    this.startCleanupTasks();

    this.isActive = true;
    enhancedDbLogger.info('✅ DDoS защита активирована');
  }

  /**
   * RUSSIAN: Главный middleware для DDoS защиты
   */
  public middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!this.isActive) {
        return next();
      }

      try {
        const startTime = Date.now();
        const clientIP = this.getClientIP(req);
        const userAgent = req.get('User-Agent') || 'unknown';

        // RUSSIAN: Быстрая проверка заблокированных IP
        if (this.isBlocked(clientIP)) {
          const blockInfo = this.blockedIPs.get(clientIP);
          enhancedDbLogger.warn('🚫 Заблокированный IP попытался подключиться', {
            ip: clientIP,
            reason: blockInfo?.reason,
            level: blockInfo?.level
          });
          return this.handleBlockedRequest(req, res, blockInfo!);
        }

        // RUSSIAN: Сбор метрик запроса
        const requestMetrics = {
          ip: clientIP,
          method: req.method,
          path: req.path,
          userAgent,
          timestamp: new Date(),
          payloadSize: parseInt(req.get('Content-Length') || '0'),
          referer: req.get('Referer'),
          country: this.getCountryFromIP(clientIP)
        };

        // RUSSIAN: Анализ подозрительности запроса
        const suspicionScore = await this.analyzeSuspiciousness(requestMetrics, req);
        
        if (suspicionScore > 0.8) {
          enhancedDbLogger.warn('⚠️ Высокоподозрительный запрос обнаружен', {
            ip: clientIP,
            score: suspicionScore,
            path: req.path
          });
          this.suspiciousIPs.add(clientIP);
        }

        // RUSSIAN: Записываем метрики для анализа
        this.recordRequest(requestMetrics);

        // RUSSIAN: Проверяем превышение порогов в реальном времени
        if (await this.checkThresholds(clientIP, requestMetrics)) {
          return this.handleSuspiciousActivity(req, res, clientIP, 'threshold_exceeded');
        }

        // RUSSIAN: Передаем управление следующему middleware
        res.on('finish', () => {
          const responseTime = Date.now() - startTime;
          this.recordResponse(clientIP, res.statusCode, responseTime);
        });

        next();

      } catch (error) {
        enhancedDbLogger.error('❌ Ошибка в DDoS защите', { error });
        // RUSSIAN: При ошибке пропускаем запрос (fail-open для доступности)
        next();
      }
    };
  }

  /**
   * RUSSIAN: Анализ подозрительности запроса
   */
  private async analyzeSuspiciousness(metrics: any, req: Request): Promise<number> {
    let suspicionScore = 0;

    // RUSSIAN: Проверка репутации IP
    const reputation = this.ipReputation.get(metrics.ip) || 0.5;
    if (reputation < 0.3) {
      suspicionScore += 0.3;
    }

    // RUSSIAN: Анализ User-Agent
    if (this.isSuspiciousUserAgent(metrics.userAgent)) {
      suspicionScore += 0.2;
    }

    // RUSSIAN: Анализ паттернов запросов
    if (this.config.patternDetection.enabled) {
      const patternScore = await this.analyzeRequestPattern(metrics, req);
      suspicionScore += patternScore;
    }

    // RUSSIAN: Машинное обучение
    if (this.config.machineLearning.enabled && this.mlModel) {
      const mlScore = await this.getMachineLearningScore(metrics, req);
      suspicionScore += mlScore * 0.4;
    }

    // RUSSIAN: Геолокационный анализ
    if (this.isSuspiciousGeolocation(metrics.country)) {
      suspicionScore += 0.1;
    }

    return Math.min(1, suspicionScore);
  }

  /**
   * RUSSIAN: Проверка превышения порогов
   */
  private async checkThresholds(ip: string, metrics: any): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - 60000; // 1 минута

    // RUSSIAN: Получаем статистику за последнюю минуту
    const recentRequests = this.getRecentRequests(windowStart);
    
    // RUSSIAN: Запросы в секунду (общие)
    const rpsTotal = recentRequests.length / 60;
    if (rpsTotal > this.config.thresholds.requestsPerSecond) {
      enhancedDbLogger.warn('🚨 Превышен общий RPS порог', { rpsTotal, threshold: this.config.thresholds.requestsPerSecond });
      await this.triggerAttackDetection('volumetric_rps', 'high', ['high_rps']);
      return true;
    }

    // RUSSIAN: Запросы с одного IP
    const ipRequests = recentRequests.filter(r => r.ip === ip);
    const rpsPerIP = ipRequests.length / 60;
    if (rpsPerIP > this.config.thresholds.requestsPerIP) {
      enhancedDbLogger.warn('🚨 Превышен RPS порог для IP', { ip, rpsPerIP, threshold: this.config.thresholds.requestsPerIP });
      return true;
    }

    // RUSSIAN: Уникальные IP в минуту
    const uniqueIPs = new Set(recentRequests.map(r => r.ip)).size;
    if (uniqueIPs > this.config.thresholds.uniqueIPsPerMinute) {
      enhancedDbLogger.warn('🚨 Слишком много уникальных IP', { uniqueIPs, threshold: this.config.thresholds.uniqueIPsPerMinute });
      await this.triggerAttackDetection('botnet', 'high', ['many_unique_ips']);
      return true;
    }

    // RUSSIAN: Размер payload
    if (metrics.payloadSize > this.config.thresholds.payloadSize) {
      enhancedDbLogger.warn('🚨 Слишком большой payload', { ip, size: metrics.payloadSize, threshold: this.config.thresholds.payloadSize });
      return true;
    }

    return false;
  }

  /**
   * RUSSIAN: Инициализация машинного обучения
   */
  private async initializeMachineLearning(): Promise<void> {
    enhancedDbLogger.info('🤖 Инициализация системы машинного обучения для DDoS защиты');

    try {
      // RUSSIAN: Простая статистическая модель для начала
      this.mlModel = {
        type: this.config.machineLearning.model,
        features: [
          'requests_per_minute',
          'payload_size_avg',
          'response_time_avg',
          'error_rate',
          'unique_paths',
          'user_agent_entropy',
          'geographic_distribution'
        ],
        weights: new Map(),
        thresholds: new Map(),
        lastTrained: new Date()
      };

      // RUSSIAN: Загружаем предобученные веса если есть
      await this.loadPretrainedModel();

      enhancedDbLogger.info('✅ Модель машинного обучения инициализирована', {
        type: this.mlModel.type,
        features: this.mlModel.features.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка инициализации ML модели', { error });
      this.config.machineLearning.enabled = false;
    }
  }

  /**
   * RUSSIAN: Загрузка баз данных репутации IP
   */
  private async loadReputationDatabases(): Promise<void> {
    enhancedDbLogger.info('📊 Загрузка баз данных репутации IP');

    try {
      // RUSSIAN: Загружаем известные плохие IP адреса
      const maliciousIPs = await this.loadMaliciousIPDatabase();
      
      for (const ip of maliciousIPs) {
        this.ipReputation.set(ip, 0.1); // Очень низкая репутация
      }

      // RUSSIAN: Загружаем Tor exit nodes
      const torExitNodes = await this.loadTorExitNodes();
      
      for (const ip of torExitNodes) {
        this.ipReputation.set(ip, 0.3); // Низкая репутация
      }

      enhancedDbLogger.info('✅ Базы данных репутации загружены', {
        maliciousIPs: maliciousIPs.length,
        torNodes: torExitNodes.length
      });

    } catch (error) {
      enhancedDbLogger.error('❌ Ошибка загрузки баз репутации', { error });
    }
  }

  /**
   * RUSSIAN: Запуск анализа трафика
   */
  private startTrafficAnalysis(): void {
    this.analysisInterval = setInterval(async () => {
      await this.analyzeTrafficPatterns();
      await this.updateMLModel();
      this.generateTrafficStats();
    }, this.config.patternDetection.analysisWindow * 1000);

    enhancedDbLogger.info('📈 Анализ трафика запущен', {
      interval: this.config.patternDetection.analysisWindow
    });
  }

  /**
   * RUSSIAN: Анализ паттернов трафика
   */
  private async analyzeTrafficPatterns(): Promise<void> {
    const now = Date.now();
    const analysisWindow = this.config.patternDetection.analysisWindow * 1000;
    const recentRequests = this.getRecentRequests(now - analysisWindow);

    if (recentRequests.length < this.config.patternDetection.minSamples) {
      return; // Недостаточно данных для анализа
    }

    // RUSSIAN: Энтропийный анализ
    if (this.config.patternDetection.algorithms.includes('entropy')) {
      await this.performEntropyAnalysis(recentRequests);
    }

    // RUSSIAN: Кластерный анализ
    if (this.config.patternDetection.algorithms.includes('clustering')) {
      await this.performClusterAnalysis(recentRequests);
    }

    // RUSSIAN: Статистический анализ
    if (this.config.patternDetection.algorithms.includes('statistical')) {
      await this.performStatisticalAnalysis(recentRequests);
    }
  }

  /**
   * RUSSIAN: Энтропийный анализ для обнаружения ботнетов
   */
  private async performEntropyAnalysis(requests: any[]): Promise<void> {
    // RUSSIAN: Анализируем энтропию User-Agent строк
    const userAgents = requests.map(r => r.userAgent);
    const uaEntropy = this.calculateEntropy(userAgents);

    // RUSSIAN: Анализируем энтропию путей запросов
    const paths = requests.map(r => r.path);
    const pathEntropy = this.calculateEntropy(paths);

    // RUSSIAN: Низкая энтропия может указывать на ботнет
    if (uaEntropy < 2.0 && requests.length > 100) {
      await this.triggerAttackDetection('botnet', 'medium', ['low_user_agent_entropy']);
    }

    if (pathEntropy < 1.5 && requests.length > 50) {
      await this.triggerAttackDetection('application_layer', 'medium', ['low_path_entropy']);
    }
  }

  /**
   * RUSSIAN: Статистический анализ аномалий
   */
  private async performStatisticalAnalysis(requests: any[]): Promise<void> {
    // RUSSIAN: Анализ распределения запросов по времени
    const timeDistribution = this.analyzeTimeDistribution(requests);
    
    // RUSSIAN: Проверяем на periodicity (признак автоматизированных атак)
    if (timeDistribution.periodicity > 0.8) {
      await this.triggerAttackDetection('automated', 'medium', ['high_periodicity']);
    }

    // RUSSIAN: Анализ географического распределения
    const geoDistribution = this.analyzeGeographicDistribution(requests);
    
    // RUSSIAN: Слишком много запросов из одной страны может быть подозрительно
    const maxCountryPercentage = Math.max(...Object.values(geoDistribution).map(val => Number(val) || 0));
    if (maxCountryPercentage > 0.9 && requests.length > 100) {
      await this.triggerAttackDetection('geographic_anomaly', 'low', ['single_country_dominance']);
    }
  }

  /**
   * RUSSIAN: Вычисление энтропии Шеннона
   */
  private calculateEntropy(data: string[]): number {
    const freq = new Map<string, number>();
    
    for (const item of data) {
      freq.set(item, (freq.get(item) || 0) + 1);
    }

    let entropy = 0;
    const total = data.length;

    for (const count of freq.values()) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  /**
   * RUSSIAN: Обработка обнаружения атаки
   */
  private async triggerAttackDetection(
    type: string, 
    severity: 'low' | 'medium' | 'high' | 'critical',
    indicators: string[]
  ): Promise<void> {
    const attackId = `attack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const attack: AttackSignature = {
      type,
      severity,
      confidence: this.calculateAttackConfidence(indicators),
      indicators,
      sourceIPs: Array.from(this.suspiciousIPs),
      targetEndpoints: this.getTopTargetEndpoints(),
      startTime: new Date(),
      metrics: this.getCurrentAttackMetrics()
    };

    this.activeAttacks.set(attackId, attack);
    this.attackHistory.push(attack);

    enhancedDbLogger.warn('🚨 DDoS атака обнаружена', {
      id: attackId,
      type,
      severity,
      confidence: attack.confidence,
      indicators: indicators.join(', ')
    });

    // RUSSIAN: Применяем меры противодействия
    if (this.config.mitigation.autoBlock) {
      await this.applyMitigation(attack);
    }

    // RUSSIAN: Отправляем уведомление в систему мониторинга
    this.emit('attack_detected', attack);
  }

  /**
   * RUSSIAN: Применение мер противодействия
   */
  private async applyMitigation(attack: AttackSignature): Promise<void> {
    enhancedDbLogger.info('🛡️ Применение мер противодействия', {
      type: attack.type,
      severity: attack.severity
    });

    // RUSSIAN: Блокируем подозрительные IP
    for (const ip of attack.sourceIPs) {
      if (!this.isWhitelisted(ip)) {
        await this.blockIP(ip, `DDoS: ${attack.type}`, this.config.mitigation.blockDuration);
      }
    }

    // RUSSIAN: Эскалация по уровням
    if (this.config.mitigation.escalation.enabled) {
      const level = this.getEscalationLevel(attack.severity);
      await this.applyEscalation(level, attack);
    }

    // RUSSIAN: Интеграция с внешними сервисами
    if (this.config.external.cloudflare.enabled) {
      await this.notifyCloudflare(attack);
    }

    if (this.config.external.fail2ban.enabled) {
      await this.notifyFail2Ban(attack);
    }
  }

  /**
   * RUSSIAN: Блокировка IP адреса
   */
  private async blockIP(ip: string, reason: string, duration: number, level: number = 1): Promise<void> {
    const until = new Date(Date.now() + (duration * 1000));
    
    this.blockedIPs.set(ip, { reason, until, level });
    this.suspiciousIPs.delete(ip); // Убираем из подозрительных, так как уже заблокирован

    enhancedDbLogger.warn('🚫 IP заблокирован DDoS защитой', {
      ip,
      reason,
      duration,
      level,
      until: until.toISOString()
    });

    // RUSSIAN: Автоматическая разблокировка
    setTimeout(() => {
      this.unblockIP(ip);
    }, duration * 1000);

    this.emit('ip_blocked', { ip, reason, duration, level });
  }

  /**
   * RUSSIAN: Разблокировка IP адреса
   */
  private unblockIP(ip: string): void {
    if (this.blockedIPs.has(ip)) {
      this.blockedIPs.delete(ip);
      enhancedDbLogger.info('✅ IP разблокирован DDoS защитой', { ip });
      this.emit('ip_unblocked', { ip });
    }
  }

  /**
   * RUSSIAN: Проверка заблокированного IP
   */
  private isBlocked(ip: string): boolean {
    const blockInfo = this.blockedIPs.get(ip);
    if (!blockInfo) return false;

    // RUSSIAN: Проверяем, не истекла ли блокировка
    if (blockInfo.until < new Date()) {
      this.unblockIP(ip);
      return false;
    }

    return true;
  }

  /**
   * RUSSIAN: Проверка IP в белом списке
   */
  private isWhitelisted(ip: string): boolean {
    // RUSSIAN: Локальные адреса всегда в белом списке
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
      return true;
    }

    // RUSSIAN: Дополнительная логика белого списка
    return false;
  }

  /**
   * RUSSIAN: Получение IP адреса клиента
   */
  private getClientIP(req: Request): string {
    return req.get('CF-Connecting-IP') || 
           req.get('X-Forwarded-For')?.split(',')[0]?.trim() || 
           req.get('X-Real-IP') || 
           req.socket.remoteAddress || 
           'unknown';
  }

  /**
   * RUSSIAN: Запись запроса для анализа
   */
  private recordRequest(metrics: any): void {
    const key = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentWindow.set(key, metrics);

    // RUSSIAN: Ограничиваем размер окна (последние 10000 запросов)
    if (this.currentWindow.size > 10000) {
      const oldestKey = this.currentWindow.keys().next().value as string;
      this.currentWindow.delete(oldestKey);
    }
  }

  /**
   * RUSSIAN: Запись ответа для анализа
   */
  private recordResponse(ip: string, statusCode: number, responseTime: number): void {
    // RUSSIAN: Обновляем репутацию IP на основе поведения
    this.updateIPReputation(ip, statusCode, responseTime);

    // RUSSIAN: Анализируем медленные запросы (возможная Slowloris атака)
    if (this.config.attackTypes.slowloris && responseTime > this.config.thresholds.requestDuration) {
      this.handleSlowlorisDetection(ip, responseTime);
    }
  }

  /**
   * RUSSIAN: Обновление репутации IP
   */
  private updateIPReputation(ip: string, statusCode: number, responseTime: number): void {
    const currentReputation = this.ipReputation.get(ip) || 0.5;
    let adjustment = 0;

    // RUSSIAN: Положительные индикаторы
    if (statusCode >= 200 && statusCode < 300) {
      adjustment += 0.01; // Успешные запросы улучшают репутацию
    }

    // RUSSIAN: Отрицательные индикаторы
    if (statusCode >= 400 && statusCode < 500) {
      adjustment -= 0.02; // Ошибки клиента ухудшают репутацию
    }

    if (responseTime > 5000) {
      adjustment -= 0.01; // Медленные запросы подозрительны
    }

    const newReputation = Math.max(0, Math.min(1, currentReputation + adjustment));
    this.ipReputation.set(ip, newReputation);

    // RUSSIAN: Если репутация слишком низкая, добавляем в подозрительные
    if (newReputation < 0.2) {
      this.suspiciousIPs.add(ip);
    }
  }

  /**
   * RUSSIAN: Получение недавних запросов
   */
  private getRecentRequests(since: number): any[] {
    const recent: any[] = [];
    
    for (const metrics of this.currentWindow.values()) {
      if (metrics.timestamp.getTime() >= since) {
        recent.push(metrics);
      }
    }

    return recent;
  }

  /**
   * RUSSIAN: Обработка заблокированного запроса
   */
  private handleBlockedRequest(req: Request, res: Response, blockInfo: any): void {
    const timeRemaining = Math.ceil((blockInfo.until.getTime() - Date.now()) / 1000);

    res.status(403).json({
      error: 'Access Denied',
      message: 'Ваш IP адрес временно заблокирован',
      reason: blockInfo.reason,
      level: blockInfo.level,
      timeRemaining,
      retryAfter: timeRemaining,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * RUSSIAN: Обработка подозрительной активности
   */
  private handleSuspiciousActivity(req: Request, res: Response, ip: string, reason: string): void {
    enhancedDbLogger.warn('⚠️ Подозрительная активность обнаружена', { ip, reason });

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Обнаружена подозрительная активность',
      reason,
      ip,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * RUSSIAN: Получение статистики DDoS защиты
   */
  public getStatistics(): {
    activeAttacks: number;
    blockedIPs: number;
    suspiciousIPs: number;
    totalRequests: number;
    requestsPerSecond: number;
    topAttackTypes: Array<{ type: string; count: number }>;
    reputationDistribution: { low: number; medium: number; high: number };
  } {
    const now = Date.now();
    const recentRequests = this.getRecentRequests(now - 60000);

    // RUSSIAN: Распределение репутации
    const reputationCounts = { low: 0, medium: 0, high: 0 };
    for (const reputation of this.ipReputation.values()) {
      if (reputation < 0.3) reputationCounts.low++;
      else if (reputation < 0.7) reputationCounts.medium++;
      else reputationCounts.high++;
    }

    // RUSSIAN: Топ типов атак
    const attackTypeCounts = new Map<string, number>();
    for (const attack of this.attackHistory) {
      attackTypeCounts.set(attack.type, (attackTypeCounts.get(attack.type) || 0) + 1);
    }

    const topAttackTypes = Array.from(attackTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      activeAttacks: this.activeAttacks.size,
      blockedIPs: this.blockedIPs.size,
      suspiciousIPs: this.suspiciousIPs.size,
      totalRequests: this.currentWindow.size,
      requestsPerSecond: recentRequests.length / 60,
      topAttackTypes,
      reputationDistribution: reputationCounts
    };
  }

  /**
   * RUSSIAN: Получение детальной информации об атаках
   */
  public getAttackDetails(): {
    active: AttackSignature[];
    recent: AttackSignature[];
    blockedIPs: Array<{ ip: string; reason: string; until: Date; level: number }>;
  } {
    const recentAttacks = this.attackHistory
      .filter(attack => (Date.now() - attack.startTime.getTime()) < 3600000) // Последний час
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    const blockedIPsList = Array.from(this.blockedIPs.entries())
      .map(([ip, info]) => ({ ip, ...info }));

    return {
      active: Array.from(this.activeAttacks.values()),
      recent: recentAttacks,
      blockedIPs: blockedIPsList
    };
  }

  /**
   * RUSSIAN: Ручная блокировка IP
   */
  public async manualBlockIP(ip: string, reason: string, duration: number): Promise<void> {
    await this.blockIP(ip, `Manual: ${reason}`, duration, 999);
    enhancedDbLogger.info('👮 IP заблокирован вручную', { ip, reason, duration });
  }

  /**
   * RUSSIAN: Ручная разблокировка IP
   */
  public async manualUnblockIP(ip: string): Promise<void> {
    this.unblockIP(ip);
    enhancedDbLogger.info('👮 IP разблокирован вручную', { ip });
  }

  /**
   * RUSSIAN: Остановка DDoS защиты
   */
  public async shutdown(): Promise<void> {
    this.isActive = false;

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.currentWindow.clear();
    this.blockedIPs.clear();
    this.suspiciousIPs.clear();
    this.activeAttacks.clear();

    enhancedDbLogger.info('🛡️ DDoS защита остановлена');
  }

  // RUSSIAN: Заглушки для методов, которые будут реализованы позже
  private async loadPretrainedModel(): Promise<void> { /* TODO */ }
  private async loadMaliciousIPDatabase(): Promise<string[]> { return []; }
  private async loadTorExitNodes(): Promise<string[]> { return []; }
  private isSuspiciousUserAgent(userAgent: string): boolean { return false; }
  private async analyzeRequestPattern(metrics: any, req: Request): Promise<number> { return 0; }
  private async getMachineLearningScore(metrics: any, req: Request): Promise<number> { return 0; }
  private isSuspiciousGeolocation(country: string): boolean { return false; }
  private getCountryFromIP(ip: string): string { return 'unknown'; }
  private async performClusterAnalysis(requests: any[]): Promise<void> { /* TODO */ }
  private analyzeTimeDistribution(requests: any[]): any { return { periodicity: 0 }; }
  private analyzeGeographicDistribution(requests: any[]): any { return {}; }
  private calculateAttackConfidence(indicators: string[]): number { return 0.8; }
  private getTopTargetEndpoints(): string[] { return []; }
  private getCurrentAttackMetrics(): any { return {}; }
  private getEscalationLevel(severity: string): any { return {}; }
  private async applyEscalation(level: any, attack: AttackSignature): Promise<void> { /* TODO */ }
  private async notifyCloudflare(attack: AttackSignature): Promise<void> { /* TODO */ }
  private async notifyFail2Ban(attack: AttackSignature): Promise<void> { /* TODO */ }
  private handleSlowlorisDetection(ip: string, responseTime: number): void { /* TODO */ }
  private async updateMLModel(): Promise<void> { /* TODO */ }
  private generateTrafficStats(): void { /* TODO */ }
  private startCleanupTasks(): void { /* TODO */ }
}

/**
 * RUSSIAN: Дефолтная конфигурация DDoS защиты для crypto-mixer
 */
export const defaultDDoSConfig: DDoSConfig = {
  enabled: true,
  sensitivity: 'adaptive',
  
  thresholds: {
    requestsPerSecond: 100,        // 100 RPS общий лимит
    requestsPerIP: 20,             // 20 RPS с одного IP
    concurrentConnections: 1000,   // 1000 одновременных подключений
    uniqueIPsPerMinute: 500,       // 500 уникальных IP в минуту
    errorRate: 10,                 // 10% ошибок
    payloadSize: 10 * 1024 * 1024, // 10MB payload
    requestDuration: 30000         // 30 секунд на запрос
  },
  
  patternDetection: {
    enabled: true,
    algorithms: ['entropy', 'statistical'],
    analysisWindow: 60,            // Анализ каждую минуту
    minSamples: 50                 // Минимум 50 запросов для анализа
  },
  
  attackTypes: {
    volumetric: true,
    slowloris: true,
    httpFlood: true,
    amplification: true,
    botnet: true
  },
  
  mitigation: {
    autoBlock: true,
    blockDuration: 300,            // 5 минут базовой блокировки
    escalation: {
      enabled: true,
      levels: [
        { threshold: 10, action: 'throttle', duration: 60 },
        { threshold: 25, action: 'block', duration: 300 },
        { threshold: 50, action: 'block', duration: 3600 }
      ]
    }
  },
  
  machineLearning: {
    enabled: false,                // Пока отключено
    model: 'statistical',
    trainingPeriod: 24,           // 24 часа обучения
    adaptationRate: 0.1           // 10% скорость адаптации
  },
  
  reputation: {
    enabled: true,
    databases: ['tor', 'malware'],
    trustScore: {
      minScore: 0.3,              // Минимум 30% доверия
      decayRate: 0.95             // 5% деградация в день
    }
  },
  
  external: {
    cloudflare: {
      enabled: false
    },
    fail2ban: {
      enabled: false,
      logPath: '/var/log/crypto-mixer/security.log'
    }
  }
};