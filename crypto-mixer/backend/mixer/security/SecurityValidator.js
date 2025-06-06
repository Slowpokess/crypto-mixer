const crypto = require('crypto');
const { EventEmitter } = require('events');

/**
 * Система безопасности и валидации транзакций для микширования
 * Обеспечивает проверку всех аспектов безопасности миксера
 */
class SecurityValidator extends EventEmitter {
  constructor(dependencies = {}) {
    super();
    
    this.database = dependencies.database;
    this.logger = dependencies.logger;
    this.blockchainManager = dependencies.blockchainManager;
    this.riskAnalyzer = dependencies.riskAnalyzer;
    
    // Конфигурация безопасности
    this.config = {
      // Максимальные лимиты для транзакций
      maxTransactionLimits: {
        BTC: 10.0,
        ETH: 100.0,
        USDT: 100000,
        SOL: 1000
      },
      // Минимальные лимиты
      minTransactionLimits: {
        BTC: 0.001,
        ETH: 0.01,
        USDT: 10,
        SOL: 0.1
      },
      // Максимальное количество транзакций в день для одного пользователя
      dailyTransactionLimits: {
        BTC: 5,
        ETH: 10,
        USDT: 20,
        SOL: 15
      },
      // Временные окна для анализа паттернов
      analysisWindows: {
        short: 1 * 60 * 60 * 1000,     // 1 час
        medium: 24 * 60 * 60 * 1000,    // 24 часа
        long: 7 * 24 * 60 * 60 * 1000   // 7 дней
      },
      // Пороговые значения для подозрительной активности
      suspiciousThresholds: {
        velocityMultiplier: 5.0,        // В 5 раз больше обычного
        amountDeviation: 3.0,           // Отклонение в 3 сигмы
        frequencyThreshold: 10,         // Более 10 транзакций в час
        roundAmountPercentage: 0.8      // 80% круглых сумм
      },
      // Blacklist и whitelist настройки
      addressValidation: {
        enableBlacklist: true,
        enableWhitelist: false,
        checkSanctions: true,
        checkExchanges: true
      },
      // Настройки KYT (Know Your Transaction)
      kytSettings: {
        enabled: true,
        riskScoreThreshold: 75,
        requireManualReview: 85,
        autoRejectThreshold: 95
      },
      ...dependencies.config
    };
    
    // Кеши для быстрого доступа
    this.blacklistedAddresses = new Set();
    this.whitelistedAddresses = new Set();
    this.suspiciousPatterns = new Map();
    this.userRiskProfiles = new Map();
    
    // Метрики безопасности
    this.securityMetrics = {
      totalValidations: 0,
      rejectedTransactions: 0,
      suspiciousActivities: 0,
      falsePositives: 0,
      averageRiskScore: 0,
      lastUpdate: new Date()
    };
    
    this.logger?.info('SecurityValidator инициализирован');
  }

  /**
   * Валидирует запрос на микширование
   */
  async validateMixRequest(mixRequest) {
    try {
      const { id, currency, amount, inputAddresses, inputAddress, outputAddresses, userId } = mixRequest;
      
      this.logger?.info('Валидация запроса на микширование', {
        mixId: id,
        currency,
        amount,
        userId: userId || 'anonymous'
      });

      const validationResult = {
        isValid: true,
        riskScore: 0,
        warnings: [],
        errors: [],
        recommendations: [],
        metadata: {
          validatedAt: new Date(),
          validatorVersion: '1.0.0',
          checks: []
        }
      };

      // 1. Базовая валидация параметров
      await this._validateBasicParameters(mixRequest, validationResult);
      
      // 2. Проверка лимитов
      await this._validateTransactionLimits(mixRequest, validationResult);
      
      // 3. Проверка адресов на blacklist/whitelist
      await this._validateAddresses(mixRequest, validationResult);
      
      // 4. Анализ паттернов поведения
      await this._analyzeUserPatterns(mixRequest, validationResult);
      
      // 5. KYT (Know Your Transaction) анализ
      await this._performKYTAnalysis(mixRequest, validationResult);
      
      // 6. Анализ рисков отмывания денег
      await this._analyzeAMLRisks(mixRequest, validationResult);
      
      // 7. Проверка соответствия санкциям
      await this._checkSanctionsCompliance(mixRequest, validationResult);

      // Финальная оценка риска
      validationResult.riskScore = this._calculateFinalRiskScore(validationResult);
      
      // Определяем финальное решение
      if (validationResult.riskScore >= this.config.kytSettings.autoRejectThreshold) {
        validationResult.isValid = false;
        validationResult.errors.push('Слишком высокий риск для автоматической обработки');
      } else if (validationResult.riskScore >= this.config.kytSettings.requireManualReview) {
        validationResult.warnings.push('Требуется ручная проверка');
        validationResult.recommendations.push('manual_review');
      }

      // Обновляем метрики
      this._updateSecurityMetrics(validationResult);
      
      // Сохраняем результат валидации
      await this._saveValidationResult(mixRequest.id, validationResult);

      this.emit('validation:completed', {
        mixId: id,
        isValid: validationResult.isValid,
        riskScore: validationResult.riskScore,
        requiresReview: validationResult.riskScore >= this.config.kytSettings.requireManualReview
      });

      this.logger?.info('Валидация завершена', {
        mixId: id,
        isValid: validationResult.isValid,
        riskScore: validationResult.riskScore,
        warnings: validationResult.warnings.length,
        errors: validationResult.errors.length
      });

      return validationResult;
      
    } catch (error) {
      this.logger?.error('Ошибка валидации запроса:', error, {
        mixId: mixRequest.id
      });
      throw error;
    }
  }

  /**
   * Валидирует транзакцию микширования
   */
  async validateMixingTransaction(transaction) {
    try {
      this.logger?.info('Валидация транзакции микширования', {
        txId: transaction.id,
        inputsCount: transaction.inputs?.length || 0,
        outputsCount: transaction.outputs?.length || 0
      });

      const validationResult = {
        isValid: true,
        riskScore: 0,
        warnings: [],
        errors: [],
        checks: {
          balanceCheck: false,
          signatureCheck: false,
          duplicateCheck: false,
          amountCheck: false,
          addressCheck: false
        }
      };

      // 1. Проверка баланса входов и выходов
      const balanceValid = await this._validateTransactionBalance(transaction);
      validationResult.checks.balanceCheck = balanceValid;
      if (!balanceValid) {
        validationResult.errors.push('Баланс входов и выходов не сходится');
        validationResult.isValid = false;
      }

      // 2. Проверка подписей (если есть)
      if (transaction.signatures) {
        const signaturesValid = await this._validateTransactionSignatures(transaction);
        validationResult.checks.signatureCheck = signaturesValid;
        if (!signaturesValid) {
          validationResult.errors.push('Неверные подписи транзакции');
          validationResult.isValid = false;
        }
      }

      // 3. Проверка на дублирование
      const isDuplicate = await this._checkTransactionDuplicate(transaction);
      validationResult.checks.duplicateCheck = !isDuplicate;
      if (isDuplicate) {
        validationResult.errors.push('Транзакция уже существует');
        validationResult.isValid = false;
      }

      // 4. Проверка корректности сумм
      const amountsValid = await this._validateTransactionAmounts(transaction);
      validationResult.checks.amountCheck = amountsValid;
      if (!amountsValid) {
        validationResult.errors.push('Некорректные суммы в транзакции');
        validationResult.isValid = false;
      }

      // 5. Проверка адресов
      const addressesValid = await this._validateTransactionAddresses(transaction);
      validationResult.checks.addressCheck = addressesValid;
      if (!addressesValid) {
        validationResult.warnings.push('Обнаружены подозрительные адреса');
        validationResult.riskScore += 20;
      }

      this.emit('transaction:validated', {
        txId: transaction.id,
        isValid: validationResult.isValid,
        riskScore: validationResult.riskScore
      });

      return validationResult;
      
    } catch (error) {
      this.logger?.error('Ошибка валидации транзакции:', error, {
        txId: transaction.id
      });
      throw error;
    }
  }

  /**
   * Проверяет адрес на предмет безопасности
   */
  async checkAddressSecurity(address, currency) {
    try {
      const securityInfo = {
        address,
        currency,
        isBlacklisted: false,
        isWhitelisted: false,
        riskLevel: 'LOW',
        riskScore: 0,
        flags: [],
        sources: [],
        lastChecked: new Date()
      };

      // Проверяем в blacklist
      if (this._isAddressBlacklisted(address)) {
        securityInfo.isBlacklisted = true;
        securityInfo.riskLevel = 'CRITICAL';
        securityInfo.riskScore = 100;
        securityInfo.flags.push('BLACKLISTED');
      }

      // Проверяем в whitelist
      if (this._isAddressWhitelisted(address)) {
        securityInfo.isWhitelisted = true;
        securityInfo.riskLevel = 'LOW';
        securityInfo.riskScore = Math.max(0, securityInfo.riskScore - 50);
        securityInfo.flags.push('WHITELISTED');
      }

      // Проверяем санкционные списки
      const sanctionsCheck = await this._checkAddressSanctions(address, currency);
      if (sanctionsCheck.isListed) {
        securityInfo.riskLevel = 'CRITICAL';
        securityInfo.riskScore = 100;
        securityInfo.flags.push('SANCTIONS');
        securityInfo.sources.push(...sanctionsCheck.sources);
      }

      // Проверяем принадлежность к биржам
      const exchangeCheck = await this._checkExchangeAddress(address, currency);
      if (exchangeCheck.isExchange) {
        securityInfo.riskScore += 30;
        securityInfo.flags.push('EXCHANGE');
        securityInfo.sources.push(exchangeCheck.exchange);
        
        if (securityInfo.riskLevel === 'LOW') {
          securityInfo.riskLevel = 'MEDIUM';
        }
      }

      // Проверяем историю транзакций
      const historyRisk = await this._analyzeAddressHistory(address, currency);
      securityInfo.riskScore += historyRisk.score;
      securityInfo.flags.push(...historyRisk.flags);

      // Определяем финальный уровень риска
      if (securityInfo.riskScore >= 80) {
        securityInfo.riskLevel = 'CRITICAL';
      } else if (securityInfo.riskScore >= 50) {
        securityInfo.riskLevel = 'HIGH';
      } else if (securityInfo.riskScore >= 25) {
        securityInfo.riskLevel = 'MEDIUM';
      }

      return securityInfo;
      
    } catch (error) {
      this.logger?.error('Ошибка проверки безопасности адреса:', error, {
        address: address.substring(0, 16) + '...',
        currency
      });
      throw error;
    }
  }

  /**
   * Анализирует паттерны пользователя на предмет подозрительной активности
   */
  async analyzeUserBehaviorPatterns(userId, timeWindow = '24h') {
    try {
      const analysis = {
        userId,
        timeWindow,
        patterns: {
          velocityPattern: 'NORMAL',
          amountPattern: 'NORMAL',
          timingPattern: 'NORMAL',
          addressPattern: 'NORMAL'
        },
        riskScore: 0,
        flags: [],
        recommendations: []
      };

      // Получаем историю активности пользователя
      const userActivity = await this._getUserActivity(userId, timeWindow);
      
      if (userActivity.length === 0) {
        analysis.patterns.velocityPattern = 'NEW_USER';
        analysis.riskScore += 10;
        analysis.flags.push('NEW_USER');
        return analysis;
      }

      // Анализ частоты транзакций (velocity)
      const velocityAnalysis = this._analyzeTransactionVelocity(userActivity);
      analysis.patterns.velocityPattern = velocityAnalysis.pattern;
      analysis.riskScore += velocityAnalysis.riskScore;
      analysis.flags.push(...velocityAnalysis.flags);

      // Анализ паттернов сумм
      const amountAnalysis = this._analyzeAmountPatterns(userActivity);
      analysis.patterns.amountPattern = amountAnalysis.pattern;
      analysis.riskScore += amountAnalysis.riskScore;
      analysis.flags.push(...amountAnalysis.flags);

      // Анализ временных паттернов
      const timingAnalysis = this._analyzeTimingPatterns(userActivity);
      analysis.patterns.timingPattern = timingAnalysis.pattern;
      analysis.riskScore += timingAnalysis.riskScore;
      analysis.flags.push(...timingAnalysis.flags);

      // Анализ паттернов адресов
      const addressAnalysis = this._analyzeAddressPatterns(userActivity);
      analysis.patterns.addressPattern = addressAnalysis.pattern;
      analysis.riskScore += addressAnalysis.riskScore;
      analysis.flags.push(...addressAnalysis.flags);

      // Генерируем рекомендации
      if (analysis.riskScore >= 70) {
        analysis.recommendations.push('ENHANCED_MONITORING');
        analysis.recommendations.push('MANUAL_REVIEW');
      } else if (analysis.riskScore >= 40) {
        analysis.recommendations.push('INCREASED_MONITORING');
      }

      // Кешируем профиль риска пользователя
      this.userRiskProfiles.set(userId, {
        riskScore: analysis.riskScore,
        lastAnalysis: new Date(),
        flags: analysis.flags
      });

      return analysis;
      
    } catch (error) {
      this.logger?.error('Ошибка анализа паттернов пользователя:', error, {
        userId
      });
      throw error;
    }
  }

  /**
   * Получает текущий статус системы безопасности
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized || false,
      blacklistedAddresses: this.state.blacklistedAddresses?.size || 0,
      checkedTransactions: this.state.checkedTransactions || 0,
      blockedTransactions: this.state.blockedTransactions || 0
    };
  }

  /**
   * Выполняет проверку состояния системы безопасности
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      checks: {
        initialization: { status: 'pass', message: 'Система безопасности инициализирована' },
        blacklist: { status: 'pass', message: 'Blacklist загружен и функционирует' },
        validation: { status: 'pass', message: 'Валидация работает корректно' },
        kyt: { status: 'pass', message: 'KYT анализ доступен' }
      },
      details: {
        blacklistedAddresses: this.blacklistedAddresses.size,
        whitelistedAddresses: this.whitelistedAddresses.size,
        kytEnabled: this.config.kytSettings.enabled,
        sanctionsCheckEnabled: this.config.addressValidation.checkSanctions,
        metrics: this.securityMetrics
      }
    };

    try {
      // Проверяем инициализацию
      if (this.blacklistedAddresses.size === 0 && this.whitelistedAddresses.size === 0) {
        health.checks.initialization = { status: 'warn', message: 'Списки адресов не загружены' };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем доступность базы данных
      if (this.database) {
        try {
          await this.database.query('SELECT 1');
        } catch (error) {
          health.checks.validation = { status: 'fail', message: `Ошибка доступа к БД: ${error.message}` };
          health.status = 'unhealthy';
        }
      }

      // Проверяем конфигурацию KYT
      if (this.config.kytSettings.enabled && !this.config.kytSettings.riskScoreThreshold) {
        health.checks.kyt = { status: 'warn', message: 'Неполная конфигурация KYT' };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем актуальность метрик
      const metricsAge = Date.now() - new Date(this.securityMetrics.lastUpdate).getTime();
      if (metricsAge > 24 * 60 * 60 * 1000) { // более 24 часов
        health.checks.validation = { status: 'warn', message: 'Метрики безопасности устарели' };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем высокий уровень отклонений
      if (this.securityMetrics.rejectedTransactions > this.securityMetrics.totalValidations * 0.5) {
        health.checks.validation = { 
          status: 'warn', 
          message: `Высокий уровень отклонений: ${Math.round((this.securityMetrics.rejectedTransactions / this.securityMetrics.totalValidations) * 100)}%` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      this.logger?.error('Ошибка проверки состояния системы безопасности:', error);
    }

    return health;
  }

  /**
   * Получает метрики безопасности
   */
  getSecurityMetrics() {
    return {
      ...this.securityMetrics,
      blacklistedAddressesCount: this.blacklistedAddresses.size,
      whitelistedAddressesCount: this.whitelistedAddresses.size,
      suspiciousPatternsCached: this.suspiciousPatterns.size,
      userRiskProfilesCached: this.userRiskProfiles.size,
      configurationSummary: {
        kytEnabled: this.config.kytSettings.enabled,
        riskThreshold: this.config.kytSettings.riskScoreThreshold,
        sanctionsCheckEnabled: this.config.addressValidation.checkSanctions
      }
    };
  }

  /**
   * Обновляет blacklist адресов
   */
  async updateBlacklist(addresses) {
    try {
      this.logger?.info('Обновление blacklist адресов', {
        newAddressesCount: addresses.length,
        totalBlacklistedBefore: this.blacklistedAddresses.size
      });

      for (const address of addresses) {
        this.blacklistedAddresses.add(address.toLowerCase());
      }

      // Сохраняем в БД
      await this._saveBlacklistToDB(addresses);

      this.emit('blacklist:updated', {
        newAddressesCount: addresses.length,
        totalBlacklisted: this.blacklistedAddresses.size
      });

      this.logger?.info('Blacklist обновлен', {
        totalBlacklisted: this.blacklistedAddresses.size
      });
      
    } catch (error) {
      this.logger?.error('Ошибка обновления blacklist:', error);
      throw error;
    }
  }

  /**
   * Инициализирует систему безопасности
   */
  async initialize() {
    try {
      this.logger?.info('Инициализация системы безопасности...');

      // Загружаем blacklist и whitelist из БД
      await this._loadAddressLists();
      
      // Загружаем известные паттерны
      await this._loadSuspiciousPatterns();
      
      // Инициализируем внешние сервисы проверки
      await this._initializeExternalServices();

      this.logger?.info('Система безопасности инициализирована', {
        blacklistedAddresses: this.blacklistedAddresses.size,
        whitelistedAddresses: this.whitelistedAddresses.size,
        suspiciousPatterns: this.suspiciousPatterns.size
      });
      
    } catch (error) {
      this.logger?.error('Ошибка инициализации системы безопасности:', error);
      throw error;
    }
  }

  // Приватные методы валидации

  async _validateBasicParameters(mixRequest, result) {
    const { currency, amount, inputAddresses, inputAddress, outputAddresses } = mixRequest;

    // Проверяем валюту
    if (!this.config.maxTransactionLimits[currency]) {
      result.errors.push(`Неподдерживаемая валюта: ${currency}`);
      result.isValid = false;
    }

    // Проверяем сумму
    if (typeof amount !== 'number' || amount <= 0) {
      result.errors.push('Некорректная сумма');
      result.isValid = false;
    }

    // Получение входных адресов с поддержкой обоих форматов
    const addresses = inputAddresses || (inputAddress ? [inputAddress] : []);
    
    // Проверяем адреса
    if (!addresses || addresses.length === 0) {
      result.errors.push('Отсутствуют входящие адреса');
      result.isValid = false;
    }

    if (!outputAddresses || outputAddresses.length === 0) {
      result.errors.push('Отсутствуют исходящие адреса');
      result.isValid = false;
    }

    result.metadata.checks.push('basic_parameters');
  }

  async _validateTransactionLimits(mixRequest, result) {
    const { currency, amount, userId } = mixRequest;

    const maxLimit = this.config.maxTransactionLimits[currency];
    const minLimit = this.config.minTransactionLimits[currency];

    if (amount > maxLimit) {
      result.errors.push(`Сумма превышает максимальный лимит: ${amount} > ${maxLimit}`);
      result.isValid = false;
    }

    if (amount < minLimit) {
      result.errors.push(`Сумма меньше минимального лимита: ${amount} < ${minLimit}`);
      result.isValid = false;
    }

    // Проверяем дневные лимиты пользователя
    if (userId) {
      const dailyVolume = await this._getUserDailyVolume(userId, currency);
      const dailyLimit = this.config.dailyTransactionLimits[currency];
      
      if (dailyVolume.transactionCount >= dailyLimit) {
        result.errors.push(`Превышен дневной лимит транзакций: ${dailyVolume.transactionCount}/${dailyLimit}`);
        result.isValid = false;
      }
    }

    result.metadata.checks.push('transaction_limits');
  }

  async _validateAddresses(mixRequest, result) {
    // Поддержка как inputAddress (единственный), так и inputAddresses (массив)
    const inputAddresses = mixRequest.inputAddresses || 
                          (mixRequest.inputAddress ? [mixRequest.inputAddress] : []);
    
    const allAddresses = [
      ...inputAddresses,
      ...mixRequest.outputAddresses.map(out => out.address)
    ];

    for (const address of allAddresses) {
      const securityInfo = await this.checkAddressSecurity(address, mixRequest.currency);
      
      if (securityInfo.isBlacklisted) {
        result.errors.push(`Обнаружен blacklisted адрес: ${address.substring(0, 16)}...`);
        result.isValid = false;
      }

      result.riskScore += securityInfo.riskScore / allAddresses.length;
      
      if (securityInfo.flags.length > 0) {
        result.warnings.push(`Флаги для адреса ${address.substring(0, 16)}...: ${securityInfo.flags.join(', ')}`);
      }
    }

    result.metadata.checks.push('address_validation');
  }

  async _analyzeUserPatterns(mixRequest, result) {
    if (!mixRequest.userId) {
      result.warnings.push('Анонимный пользователь - ограниченный анализ паттернов');
      result.riskScore += 15;
      return;
    }

    const behaviorAnalysis = await this.analyzeUserBehaviorPatterns(mixRequest.userId);
    result.riskScore += behaviorAnalysis.riskScore * 0.3; // 30% веса от пользовательского риска

    if (behaviorAnalysis.flags.includes('SUSPICIOUS_VELOCITY')) {
      result.warnings.push('Подозрительная частота транзакций');
    }

    if (behaviorAnalysis.flags.includes('UNUSUAL_AMOUNTS')) {
      result.warnings.push('Нетипичные суммы транзакций');
    }

    result.metadata.checks.push('user_patterns');
  }

  async _performKYTAnalysis(mixRequest, result) {
    if (!this.config.kytSettings.enabled) {
      return;
    }

    // KYT анализ через внешний сервис или собственную логику
    const kytScore = await this._calculateKYTScore(mixRequest);
    result.riskScore = Math.max(result.riskScore, kytScore);

    if (kytScore >= this.config.kytSettings.riskScoreThreshold) {
      result.warnings.push(`Высокий KYT риск: ${kytScore}`);
    }

    result.metadata.checks.push('kyt_analysis');
  }

  async _analyzeAMLRisks(mixRequest, result) {
    // Анализ рисков отмывания денег
    let amlRisk = 0;

    // Проверяем круглые суммы (признак отмывания)
    if (this._isRoundAmount(mixRequest.amount)) {
      amlRisk += 10;
      result.warnings.push('Круглая сумма может указывать на отмывание денег');
    }

    // Проверяем структурирование (разбиение крупных сумм)
    const structuringRisk = await this._checkStructuring(mixRequest);
    amlRisk += structuringRisk;

    result.riskScore += amlRisk;
    result.metadata.checks.push('aml_analysis');
  }

  async _checkSanctionsCompliance(mixRequest, result) {
    if (!this.config.addressValidation.checkSanctions) {
      return;
    }

    // Поддержка как inputAddress (единственный), так и inputAddresses (массив)
    const inputAddresses = mixRequest.inputAddresses || 
                          (mixRequest.inputAddress ? [mixRequest.inputAddress] : []);
    
    const allAddresses = [
      ...inputAddresses,
      ...mixRequest.outputAddresses.map(out => out.address)
    ];

    for (const address of allAddresses) {
      const sanctionsCheck = await this._checkAddressSanctions(address, mixRequest.currency);
      
      if (sanctionsCheck.isListed) {
        result.errors.push(`Адрес в санкционном списке: ${address.substring(0, 16)}...`);
        result.isValid = false;
      }
    }

    result.metadata.checks.push('sanctions_compliance');
  }

  // Приватные вспомогательные методы

  _calculateFinalRiskScore(validationResult) {
    let baseScore = validationResult.riskScore;
    
    // Увеличиваем риск за каждую ошибку
    baseScore += validationResult.errors.length * 25;
    
    // Увеличиваем риск за каждое предупреждение
    baseScore += validationResult.warnings.length * 10;
    
    return Math.min(100, Math.max(0, baseScore));
  }

  _updateSecurityMetrics(validationResult) {
    this.securityMetrics.totalValidations++;
    
    if (!validationResult.isValid) {
      this.securityMetrics.rejectedTransactions++;
    }
    
    if (validationResult.riskScore >= 50) {
      this.securityMetrics.suspiciousActivities++;
    }
    
    // Обновляем средний риск
    const totalRisk = this.securityMetrics.averageRiskScore * (this.securityMetrics.totalValidations - 1);
    this.securityMetrics.averageRiskScore = (totalRisk + validationResult.riskScore) / this.securityMetrics.totalValidations;
    
    this.securityMetrics.lastUpdate = new Date();
  }

  async _saveValidationResult(mixId, result) {
    if (!this.database) return;

    try {
      const query = `
        INSERT INTO validation_results (
          mix_id, is_valid, risk_score, warnings, errors, 
          recommendations, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await this.database.query(query, [
        mixId,
        result.isValid,
        result.riskScore,
        JSON.stringify(result.warnings),
        JSON.stringify(result.errors),
        JSON.stringify(result.recommendations),
        JSON.stringify(result.metadata),
        new Date()
      ]);
    } catch (error) {
      this.logger?.error('Ошибка сохранения результата валидации:', error);
    }
  }

  async _validateTransactionBalance(transaction) {
    if (!transaction.inputs || !transaction.outputs) return false;

    const totalInput = transaction.inputs.reduce((sum, input) => sum + (input.amount || 0), 0);
    const totalOutput = transaction.outputs.reduce((sum, output) => sum + (output.amount || 0), 0);
    const fee = transaction.fee || 0;

    // Допускаем небольшую погрешность
    const tolerance = 0.000001;
    return Math.abs(totalInput - totalOutput - fee) <= tolerance;
  }

  async _validateTransactionSignatures(transaction) {
    // Упрощенная проверка подписей
    if (!transaction.signatures || transaction.signatures.length === 0) {
      return false;
    }

    for (const signature of transaction.signatures) {
      if (!signature.signature || !signature.publicKey) {
        return false;
      }
      
      // В реальной реализации здесь была бы криптографическая проверка
      if (signature.signature.length < 64) {
        return false;
      }
    }

    return true;
  }

  async _checkTransactionDuplicate(transaction) {
    if (!this.database) return false;

    try {
      const query = `
        SELECT id FROM mixing_transactions 
        WHERE id = $1 OR transaction_hash = $2
      `;

      const result = await this.database.query(query, [
        transaction.id,
        transaction.hash || ''
      ]);

      return result.rows.length > 0;
    } catch (error) {
      this.logger?.error('Ошибка проверки дублирования транзакции:', error);
      return false;
    }
  }

  async _validateTransactionAmounts(transaction) {
    if (!transaction.inputs || !transaction.outputs) return false;

    // Проверяем, что все суммы положительные
    for (const input of transaction.inputs) {
      if (!input.amount || input.amount <= 0) {
        return false;
      }
    }

    for (const output of transaction.outputs) {
      if (!output.amount || output.amount <= 0) {
        return false;
      }
    }

    return true;
  }

  async _validateTransactionAddresses(transaction) {
    if (!transaction.inputs || !transaction.outputs) return false;

    const allAddresses = [
      ...transaction.inputs.map(inp => inp.address).filter(Boolean),
      ...transaction.outputs.map(out => out.address).filter(Boolean)
    ];

    for (const address of allAddresses) {
      if (this._isAddressBlacklisted(address)) {
        return false;
      }
    }

    return true;
  }

  _isAddressBlacklisted(address) {
    return this.blacklistedAddresses.has(address.toLowerCase());
  }

  _isAddressWhitelisted(address) {
    return this.whitelistedAddresses.has(address.toLowerCase());
  }

  async _checkAddressSanctions(address, currency) {
    // Упрощенная проверка санкций
    const knownSanctionedAddresses = new Set([
      // Здесь были бы реальные адреса из санкционных списков
    ]);

    return {
      isListed: knownSanctionedAddresses.has(address.toLowerCase()),
      sources: knownSanctionedAddresses.has(address.toLowerCase()) ? ['OFAC'] : []
    };
  }

  async _checkExchangeAddress(address, currency) {
    // Упрощенная проверка принадлежности к биржам
    const exchangePatterns = {
      BTC: /^(1|3|bc1)/,
      ETH: /^0x[a-fA-F0-9]{40}$/,
      USDT: /^0x[a-fA-F0-9]{40}$/,
      SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
    };

    // В реальной реализации здесь был бы запрос к API или БД
    return {
      isExchange: false,
      exchange: null
    };
  }

  async _analyzeAddressHistory(address, currency) {
    // Анализ истории адреса
    return {
      score: 0,
      flags: []
    };
  }

  async _getUserActivity(userId, timeWindow) {
    if (!this.database) return [];

    try {
      const hours = timeWindow === '24h' ? 24 : (timeWindow === '7d' ? 168 : 1);
      
      const query = `
        SELECT * FROM mix_requests 
        WHERE user_id = $1 
        AND created_at >= NOW() - INTERVAL '${hours} hours'
        ORDER BY created_at DESC
      `;

      const result = await this.database.query(query, [userId]);
      return result.rows;
    } catch (error) {
      this.logger?.error('Ошибка получения активности пользователя:', error);
      return [];
    }
  }

  _analyzeTransactionVelocity(userActivity) {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    const recentTransactions = userActivity.filter(tx => 
      now - new Date(tx.created_at).getTime() < oneHour
    );

    const hourlyCount = recentTransactions.length;
    const threshold = this.config.suspiciousThresholds.frequencyThreshold;

    if (hourlyCount > threshold) {
      return {
        pattern: 'SUSPICIOUS_VELOCITY',
        riskScore: 40,
        flags: ['HIGH_FREQUENCY']
      };
    } else if (hourlyCount > threshold * 0.7) {
      return {
        pattern: 'ELEVATED_VELOCITY',
        riskScore: 20,
        flags: ['MODERATE_FREQUENCY']
      };
    }

    return {
      pattern: 'NORMAL',
      riskScore: 0,
      flags: []
    };
  }

  _analyzeAmountPatterns(userActivity) {
    if (userActivity.length < 3) {
      return { pattern: 'INSUFFICIENT_DATA', riskScore: 5, flags: [] };
    }

    const amounts = userActivity.map(tx => tx.amount);
    const roundAmounts = amounts.filter(amount => this._isRoundAmount(amount));
    
    const roundPercentage = roundAmounts.length / amounts.length;
    const threshold = this.config.suspiciousThresholds.roundAmountPercentage;

    if (roundPercentage >= threshold) {
      return {
        pattern: 'SUSPICIOUS_AMOUNTS',
        riskScore: 35,
        flags: ['UNUSUAL_AMOUNTS', 'ROUND_AMOUNTS']
      };
    }

    // Проверяем на структурирование
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const isStructuring = amounts.every(amt => 
      amt < avgAmount * 1.2 && amt > avgAmount * 0.8
    );

    if (isStructuring && amounts.length > 5) {
      return {
        pattern: 'POTENTIAL_STRUCTURING',
        riskScore: 30,
        flags: ['STRUCTURING_PATTERN']
      };
    }

    return {
      pattern: 'NORMAL',
      riskScore: 0,
      flags: []
    };
  }

  _analyzeTimingPatterns(userActivity) {
    if (userActivity.length < 5) {
      return { pattern: 'INSUFFICIENT_DATA', riskScore: 0, flags: [] };
    }

    const timestamps = userActivity.map(tx => new Date(tx.created_at).getTime());
    const intervals = [];
    
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i-1] - timestamps[i]);
    }

    // Проверяем на регулярные интервалы (ботоподобное поведение)
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Если стандартное отклонение очень мало, это может указывать на автоматизацию
    if (stdDev < avgInterval * 0.1 && intervals.length > 3) {
      return {
        pattern: 'ROBOTIC_TIMING',
        riskScore: 25,
        flags: ['AUTOMATED_PATTERN']
      };
    }

    return {
      pattern: 'NORMAL',
      riskScore: 0,
      flags: []
    };
  }

  _analyzeAddressPatterns(userActivity) {
    const allInputs = userActivity.flatMap(tx => tx.input_addresses || []);
    const allOutputs = userActivity.flatMap(tx => 
      (tx.output_addresses ? JSON.parse(tx.output_addresses) : []).map(out => out.address)
    );

    const uniqueInputs = new Set(allInputs);
    const uniqueOutputs = new Set(allOutputs);

    // Проверяем на повторное использование адресов
    const inputReuse = allInputs.length > 0 ? (allInputs.length - uniqueInputs.size) / allInputs.length : 0;
    const outputReuse = allOutputs.length > 0 ? (allOutputs.length - uniqueOutputs.size) / allOutputs.length : 0;

    if (inputReuse > 0.5 || outputReuse > 0.5) {
      return {
        pattern: 'HIGH_ADDRESS_REUSE',
        riskScore: 15,
        flags: ['ADDRESS_REUSE']
      };
    }

    return {
      pattern: 'NORMAL',
      riskScore: 0,
      flags: []
    };
  }

  async _getUserDailyVolume(userId, currency) {
    if (!this.database) {
      return { transactionCount: 0, totalAmount: 0 };
    }

    try {
      const query = `
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
        FROM mix_requests 
        WHERE user_id = $1 
        AND currency = $2
        AND created_at >= CURRENT_DATE
      `;

      const result = await this.database.query(query, [userId, currency]);
      
      return {
        transactionCount: parseInt(result.rows[0].count),
        totalAmount: parseFloat(result.rows[0].total)
      };
    } catch (error) {
      this.logger?.error('Ошибка получения дневного объема пользователя:', error);
      return { transactionCount: 0, totalAmount: 0 };
    }
  }

  async _calculateKYTScore(mixRequest) {
    // Упрощенный расчет KYT риска
    let kytScore = 0;

    // Базовый риск по валюте
    const currencyRisk = {
      BTC: 20,
      ETH: 15,
      USDT: 10,
      SOL: 25
    };

    kytScore += currencyRisk[mixRequest.currency] || 20;

    // Риск по сумме
    const maxLimit = this.config.maxTransactionLimits[mixRequest.currency];
    const amountRisk = (mixRequest.amount / maxLimit) * 30;
    kytScore += amountRisk;

    return Math.min(100, kytScore);
  }

  _isRoundAmount(amount) {
    // Проверяем, является ли сумма "круглой"
    const roundThresholds = [1, 5, 10, 50, 100, 500, 1000, 5000, 10000];
    
    return roundThresholds.some(threshold => 
      Math.abs(amount - threshold) < threshold * 0.01
    );
  }

  async _checkStructuring(mixRequest) {
    // Проверка на структурирование (разбиение крупных сумм)
    if (!mixRequest.userId) return 0;

    const recentActivity = await this._getUserActivity(mixRequest.userId, '24h');
    const totalAmount = recentActivity.reduce((sum, tx) => sum + tx.amount, 0) + mixRequest.amount;
    
    const structuringThreshold = this.config.maxTransactionLimits[mixRequest.currency] * 0.8;
    
    if (totalAmount > structuringThreshold && recentActivity.length > 3) {
      return 25; // Высокий риск структурирования
    }

    return 0;
  }

  async _loadAddressLists() {
    if (!this.database) return;

    try {
      // Загружаем blacklist
      const blacklistQuery = 'SELECT address FROM blacklisted_addresses';
      const blacklistResult = await this.database.query(blacklistQuery);
      
      for (const row of blacklistResult.rows) {
        this.blacklistedAddresses.add(row.address.toLowerCase());
      }

      // Загружаем whitelist
      const whitelistQuery = 'SELECT address FROM whitelisted_addresses';
      const whitelistResult = await this.database.query(whitelistQuery);
      
      for (const row of whitelistResult.rows) {
        this.whitelistedAddresses.add(row.address.toLowerCase());
      }

      this.logger?.info('Загружены списки адресов', {
        blacklisted: this.blacklistedAddresses.size,
        whitelisted: this.whitelistedAddresses.size
      });

    } catch (error) {
      this.logger?.error('Ошибка загрузки списков адресов:', error);
    }
  }

  async _loadSuspiciousPatterns() {
    // Загружаем известные подозрительные паттерны
    this.suspiciousPatterns.set('round_amounts', {
      description: 'Круглые суммы',
      riskMultiplier: 1.2
    });

    this.suspiciousPatterns.set('high_frequency', {
      description: 'Высокая частота транзакций',
      riskMultiplier: 1.5
    });
  }

  async _initializeExternalServices() {
    // Инициализация внешних сервисов проверки
    this.logger?.info('Инициализация внешних сервисов безопасности...');
  }

  async _saveBlacklistToDB(addresses) {
    if (!this.database) return;

    try {
      const query = `
        INSERT INTO blacklisted_addresses (address, added_at, source)
        VALUES ($1, $2, $3)
        ON CONFLICT (address) DO NOTHING
      `;

      for (const address of addresses) {
        await this.database.query(query, [
          address.toLowerCase(),
          new Date(),
          'manual'
        ]);
      }
    } catch (error) {
      this.logger?.error('Ошибка сохранения blacklist в БД:', error);
    }
  }
}

module.exports = SecurityValidator;