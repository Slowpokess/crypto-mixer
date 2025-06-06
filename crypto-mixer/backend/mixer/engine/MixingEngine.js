const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Основной движок микширования - координирует все процессы микширования транзакций
 * Обеспечивает безопасное смешивание криптовалют с максимальной анонимностью
 */
class MixingEngine extends EventEmitter {
  constructor(dependencies = {}) {
    super();
    
    // Зависимости от других сервисов
    this.poolManager = dependencies.poolManager;
    this.scheduler = dependencies.scheduler;
    this.validator = dependencies.validator;
    this.security = dependencies.security;
    this.logger = dependencies.logger;
    this.database = dependencies.database;
    this.blockchainManager = dependencies.blockchainManager;
    
    // Конфигурация движка
    this.config = {
      // Максимальное количество одновременных операций микширования
      maxConcurrentMixes: 100,
      // Минимальный размер пула для эффективного микширования
      minPoolSize: 10,
      // Время ожидания между фазами микширования (мс)
      phaseDelay: 30000,
      // Максимальное время выполнения одной операции микширования (мс)
      maxMixingTime: 3600000, // 1 час
      // Минимальное количество участников для CoinJoin
      minCoinJoinParticipants: 3,
      // Максимальное количество попыток обработки
      maxRetryAttempts: 3,
      ...dependencies.config
    };
    
    // Состояние движка
    this.state = {
      isRunning: false,
      activeMixes: new Map(),
      processingQueue: [],
      statistics: {
        totalMixes: 0,
        successfulMixes: 0,
        failedMixes: 0,
        totalVolume: new Map(),
        averageTime: 0
      }
    };
    
    // Метрики производительности
    this.metrics = {
      mixingTimes: [],
      poolUtilization: [],
      errorRates: new Map(),
      lastReset: Date.now()
    };
    
    this.logger?.info('MixingEngine инициализирован', {
      maxConcurrentMixes: this.config.maxConcurrentMixes,
      minPoolSize: this.config.minPoolSize
    });
  }

  /**
   * Запускает движок микширования
   */
  async start() {
    try {
      if (this.state.isRunning) {
        throw new Error('Движок уже запущен');
      }

      this.logger?.info('Запуск движка микширования...');

      // Проверяем готовность всех зависимостей
      await this._validateDependencies();
      
      // Инициализируем систему безопасности
      await this._initializeSecurity();
      
      // Запускаем мониторинг пулов
      await this._startPoolMonitoring();
      
      // Запускаем обработчик очереди
      this._startQueueProcessor();
      
      // Запускаем периодические задачи
      this._startPeriodicTasks();
      
      this.state.isRunning = true;
      
      this.emit('engine:started');
      this.logger?.info('Движок микширования успешно запущен');
      
    } catch (error) {
      this.logger?.error('Ошибка запуска движка микширования:', error);
      throw error;
    }
  }

  /**
   * Останавливает движок микширования
   */
  async stop() {
    try {
      if (!this.state.isRunning) {
        return;
      }

      this.logger?.info('Остановка движка микширования...');

      // Останавливаем прием новых запросов
      this.state.isRunning = false;
      
      // Ждем завершения активных операций
      await this._waitForActiveMixes();
      
      // Очищаем таймеры
      this._clearTimers();
      
      this.emit('engine:stopped');
      this.logger?.info('Движок микширования остановлен');
      
    } catch (error) {
      this.logger?.error('Ошибка остановки движка:', error);
      throw error;
    }
  }

  /**
   * Обрабатывает запрос на микширование
   */
  async processMixRequest(mixRequest) {
    try {
      if (!this.state.isRunning) {
        throw new Error('Движок не запущен');
      }

      if (this.state.activeMixes.size >= this.config.maxConcurrentMixes) {
        throw new Error('Достигнут лимит одновременных операций');
      }

      this.logger?.info('Обработка запроса на микширование', {
        mixId: mixRequest.id,
        currency: mixRequest.currency,
        amount: mixRequest.amount
      });

      // Валидируем запрос
      const validationResult = await this.validator.validateMixRequest(mixRequest);
      if (!validationResult.isValid) {
        throw new Error(`Валидация не пройдена: ${validationResult.error}`);
      }

      // Проверяем безопасность
      await this.security.validateMixRequest(mixRequest);
      
      // Создаем контекст микширования
      const mixContext = await this._createMixContext(mixRequest);
      
      // Добавляем в активные операции
      this.state.activeMixes.set(mixRequest.id, mixContext);
      
      // Определяем стратегию микширования
      const strategy = await this._determineMixingStrategy(mixRequest);
      
      // Запускаем процесс микширования
      await this._executeMixingStrategy(mixContext, strategy);
      
      return {
        success: true,
        mixId: mixRequest.id,
        strategy: strategy.type,
        estimatedTime: strategy.estimatedTime
      };
      
    } catch (error) {
      this.logger?.error('Ошибка обработки запроса микширования:', error, {
        mixId: mixRequest.id
      });
      
      // Обновляем статистику ошибок
      this._updateErrorMetrics(error);
      
      throw error;
    }
  }

  /**
   * Получает статус операции микширования
   */
  getMixStatus(mixId) {
    const mixContext = this.state.activeMixes.get(mixId);
    if (!mixContext) {
      return null;
    }

    return {
      id: mixId,
      status: mixContext.status,
      phase: mixContext.currentPhase,
      progress: mixContext.progress,
      estimatedCompletion: mixContext.estimatedCompletion,
      participantsCount: mixContext.participants?.length || 0
    };
  }

  /**
   * Получает текущий статус движка
   */
  getStatus() {
    return {
      isRunning: this.state.isRunning,
      activeMixes: this.state.activeMixes.size,
      queueLength: this.state.processingQueue.length,
      successRate: this._calculateSuccessRate(),
      uptime: (Date.now() - this.metrics.lastReset) / (1000 * 60 * 60) // в часах
    };
  }

  /**
   * Выполняет проверку состояния движка миксирования
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      checks: {
        engine: { status: 'pass', message: 'Движок миксирования работает' },
        dependencies: { status: 'pass', message: 'Все зависимости доступны' },
        performance: { status: 'pass', message: 'Производительность в норме' },
        capacity: { status: 'pass', message: 'Пропускная способность достаточна' }
      },
      details: {
        isRunning: this.state.isRunning,
        activeMixes: this.state.activeMixes.size,
        queueLength: this.state.processingQueue.length,
        statistics: this.state.statistics,
        uptime: (Date.now() - this.metrics.lastReset) / (1000 * 60 * 60),
        averageMixingTime: this._calculateAverageMixingTime(),
        poolUtilization: this._calculatePoolUtilization()
      }
    };

    try {
      // Проверяем состояние движка
      if (!this.state.isRunning) {
        health.checks.engine = { status: 'fail', message: 'Движок миксирования не запущен' };
        health.status = 'unhealthy';
      }

      // Проверяем зависимости
      const dependencies = ['poolManager', 'scheduler', 'validator', 'security', 'database'];
      const missingDeps = dependencies.filter(dep => !this[dep]);
      
      if (missingDeps.length > 0) {
        health.checks.dependencies = { 
          status: 'fail', 
          message: `Отсутствуют зависимости: ${missingDeps.join(', ')}` 
        };
        health.status = 'unhealthy';
      }

      // Проверяем доступность БД
      if (this.database) {
        try {
          await this.database.query('SELECT 1');
        } catch (error) {
          health.checks.dependencies = { status: 'fail', message: `Ошибка доступа к БД: ${error.message}` };
          health.status = 'unhealthy';
        }
      }

      // Проверяем загрузку
      const utilizationPercent = (this.state.activeMixes.size / this.config.maxConcurrentMixes) * 100;
      if (utilizationPercent > 90) {
        health.checks.capacity = { 
          status: 'warn', 
          message: `Высокая загрузка: ${Math.round(utilizationPercent)}%` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем очередь
      if (this.state.processingQueue.length > 50) {
        health.checks.capacity = { 
          status: 'warn', 
          message: `Переполнена очередь: ${this.state.processingQueue.length}` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем процент успеха
      const successRate = this._calculateSuccessRate();
      if (successRate < 80 && this.state.statistics.totalMixes > 10) {
        health.checks.performance = { 
          status: 'warn', 
          message: `Низкий процент успеха: ${successRate}%` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем зависшие операции
      const now = Date.now();
      let stuckMixes = 0;
      for (const [mixId, context] of this.state.activeMixes) {
        const elapsed = now - context.startTime;
        if (elapsed > this.config.maxMixingTime * 0.8) { // 80% от максимального времени
          stuckMixes++;
        }
      }
      
      if (stuckMixes > 0) {
        health.checks.performance = { 
          status: 'warn', 
          message: `Обнаружено ${stuckMixes} медленных операций` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем состояние пулов (если доступно)
      if (this.poolManager && this.poolManager.healthCheck) {
        try {
          const poolHealth = await this.poolManager.healthCheck();
          if (poolHealth.status !== 'healthy') {
            health.checks.dependencies = { 
              status: 'warn', 
              message: `Проблемы с менеджером пулов: ${poolHealth.status}` 
            };
            if (health.status === 'healthy') {
              health.status = 'degraded';
            }
          }
        } catch (error) {
          // Игнорируем ошибки проверки пулов
        }
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      this.logger?.error('Ошибка проверки состояния движка:', error);
    }

    return health;
  }

  /**
   * Получает статистику движка
   */
  getStatistics() {
    return {
      ...this.state.statistics,
      activeMixes: this.state.activeMixes.size,
      queueLength: this.state.processingQueue.length,
      averagePoolSize: this.poolManager?.getAveragePoolSize() || 0,
      uptimeHours: (Date.now() - this.metrics.lastReset) / (1000 * 60 * 60),
      metrics: {
        averageMixingTime: this._calculateAverageMixingTime(),
        successRate: this._calculateSuccessRate(),
        poolUtilization: this._calculatePoolUtilization()
      }
    };
  }

  /**
   * Создает контекст операции микширования
   */
  async _createMixContext(mixRequest) {
    const context = {
      id: mixRequest.id,
      request: mixRequest,
      status: 'INITIALIZING',
      currentPhase: 'VALIDATION',
      progress: 0,
      startTime: Date.now(),
      retryCount: 0,
      participants: [],
      poolAllocations: [],
      transactions: [],
      security: {
        riskScore: 0,
        checks: [],
        anonymityLevel: 0
      },
      estimatedCompletion: null
    };

    // Генерируем уникальные идентификаторы для анонимности
    context.sessionId = crypto.randomBytes(16).toString('hex');
    context.mixingId = crypto.randomBytes(32).toString('hex');

    this.logger?.info('Создан контекст микширования', {
      mixId: context.id,
      sessionId: context.sessionId
    });

    return context;
  }

  /**
   * Определяет оптимальную стратегию микширования
   */
  async _determineMixingStrategy(mixRequest) {
    const { currency, amount } = mixRequest;
    
    // Анализируем размер пула для данной валюты
    const poolStats = await this.poolManager.getPoolStatistics(currency);
    
    // Проверяем возможность CoinJoin
    const coinJoinCandidates = await this._findCoinJoinCandidates(mixRequest);
    
    let strategy;
    
    if (coinJoinCandidates.length >= this.config.minCoinJoinParticipants) {
      // CoinJoin стратегия - максимальная анонимность
      strategy = {
        type: 'COINJOIN',
        participants: coinJoinCandidates,
        estimatedTime: 30 * 60 * 1000, // 30 минут
        anonymityLevel: 'HIGH',
        phases: ['COORDINATION', 'SIGNING', 'BROADCAST'],
        riskLevel: 'LOW'
      };
    } else if (poolStats.size >= this.config.minPoolSize) {
      // Стандартное микширование через пул
      strategy = {
        type: 'POOL_MIXING',
        estimatedTime: 45 * 60 * 1000, // 45 минут
        anonymityLevel: 'MEDIUM',
        phases: ['POOL_ENTRY', 'MIXING', 'DISTRIBUTION'],
        riskLevel: 'MEDIUM'
      };
    } else {
      // Быстрое микширование с пониженной анонимностью
      strategy = {
        type: 'FAST_MIX',
        estimatedTime: 15 * 60 * 1000, // 15 минут
        anonymityLevel: 'LOW',
        phases: ['OBFUSCATION', 'TRANSFER'],
        riskLevel: 'HIGH'
      };
    }

    this.logger?.info('Выбрана стратегия микширования', {
      mixId: mixRequest.id,
      strategy: strategy.type,
      anonymityLevel: strategy.anonymityLevel,
      estimatedTime: strategy.estimatedTime
    });

    return strategy;
  }

  /**
   * Выполняет выбранную стратегию микширования
   */
  async _executeMixingStrategy(mixContext, strategy) {
    try {
      mixContext.strategy = strategy;
      mixContext.estimatedCompletion = new Date(Date.now() + strategy.estimatedTime);
      
      // Переходим к выполнению
      mixContext.status = 'PROCESSING';
      mixContext.currentPhase = strategy.phases[0];
      
      this.emit('mix:started', {
        mixId: mixContext.id,
        strategy: strategy.type
      });

      // Выполняем стратегию в зависимости от типа
      switch (strategy.type) {
        case 'COINJOIN':
          await this._executeCoinJoinStrategy(mixContext);
          break;
        case 'POOL_MIXING':
          await this._executePoolMixingStrategy(mixContext);
          break;
        case 'FAST_MIX':
          await this._executeFastMixStrategy(mixContext);
          break;
        default:
          throw new Error(`Неизвестная стратегия: ${strategy.type}`);
      }

      // Завершаем операцию
      await this._completeMixing(mixContext);
      
    } catch (error) {
      await this._handleMixingError(mixContext, error);
      throw error;
    }
  }

  /**
   * Выполняет CoinJoin стратегию
   */
  async _executeCoinJoinStrategy(mixContext) {
    const { participants } = mixContext.strategy;
    
    this.logger?.info('Начало CoinJoin микширования', {
      mixId: mixContext.id,
      participantsCount: participants.length
    });

    // Фаза координации
    mixContext.currentPhase = 'COORDINATION';
    await this._coordinateCoinJoin(mixContext, participants);
    mixContext.progress = 33;

    // Фаза подписи
    mixContext.currentPhase = 'SIGNING';
    await this._signCoinJoinTransaction(mixContext);
    mixContext.progress = 66;

    // Фаза трансляции
    mixContext.currentPhase = 'BROADCAST';
    await this._broadcastCoinJoinTransaction(mixContext);
    mixContext.progress = 100;
  }

  /**
   * Выполняет стратегию микширования через пул
   */
  async _executePoolMixingStrategy(mixContext) {
    this.logger?.info('Начало пулового микширования', {
      mixId: mixContext.id
    });

    // Вход в пул
    mixContext.currentPhase = 'POOL_ENTRY';
    await this.poolManager.addToPool(mixContext.request);
    mixContext.progress = 25;

    // Ожидание и микширование
    mixContext.currentPhase = 'MIXING';
    await this._performPoolMixing(mixContext);
    mixContext.progress = 75;

    // Распределение средств
    mixContext.currentPhase = 'DISTRIBUTION';
    await this._distributeFromPool(mixContext);
    mixContext.progress = 100;
  }

  /**
   * Выполняет быструю стратегию микширования
   */
  async _executeFastMixStrategy(mixContext) {
    this.logger?.info('Начало быстрого микширования', {
      mixId: mixContext.id
    });

    // Обфускация
    mixContext.currentPhase = 'OBFUSCATION';
    await this._obfuscateTransaction(mixContext);
    mixContext.progress = 50;

    // Трансфер
    mixContext.currentPhase = 'TRANSFER';
    await this._executeDirectTransfer(mixContext);
    mixContext.progress = 100;
  }

  /**
   * Ищет кандидатов для CoinJoin
   */
  async _findCoinJoinCandidates(mixRequest) {
    try {
      // Ищем другие запросы с похожими параметрами
      const candidates = await this.database.query(`
        SELECT * FROM mix_requests 
        WHERE currency = $1 
          AND amount BETWEEN $2 AND $3 
          AND status = 'PENDING'
          AND id != $4
          AND expires_at > NOW()
        ORDER BY created_at ASC
        LIMIT 10
      `, [
        mixRequest.currency,
        mixRequest.amount * 0.9, // ±10% tolerance
        mixRequest.amount * 1.1,
        mixRequest.id
      ]);

      return candidates.rows || [];
    } catch (error) {
      this.logger?.error('Ошибка поиска CoinJoin кандидатов:', error);
      return [];
    }
  }

  /**
   * Координирует CoinJoin операцию
   */
  async _coordinateCoinJoin(mixContext, participants) {
    // Создаем координационную сессию
    const coordinationId = crypto.randomBytes(16).toString('hex');
    
    // Уведомляем всех участников
    for (const participant of participants) {
      await this._notifyParticipant(participant, {
        type: 'COINJOIN_COORDINATION',
        coordinationId,
        sessionId: mixContext.sessionId
      });
    }

    // Ждем подтверждения от всех участников
    await this._waitForParticipantConfirmations(coordinationId, participants);
    
    this.logger?.info('CoinJoin координация завершена', {
      mixId: mixContext.id,
      coordinationId
    });
  }

  /**
   * Подписывает CoinJoin транзакцию
   */
  async _signCoinJoinTransaction(mixContext) {
    // Создаем коллективную транзакцию
    const transaction = await this._createCoinJoinTransaction(mixContext);
    
    // Получаем подписи от всех участников
    const signatures = await this._collectSignatures(transaction, mixContext.strategy.participants);
    
    // Объединяем подписи
    mixContext.coinJoinTransaction = await this._combineCoinJoinSignatures(transaction, signatures);
    
    this.logger?.info('CoinJoin транзакция подписана', {
      mixId: mixContext.id,
      participantsCount: signatures.length
    });
  }

  /**
   * Транслирует CoinJoin транзакцию
   */
  async _broadcastCoinJoinTransaction(mixContext) {
    const { coinJoinTransaction, request } = mixContext;
    
    // Отправляем в блокчейн
    const txHash = await this.blockchainManager.sendTransaction(
      request.currency,
      coinJoinTransaction
    );
    
    mixContext.transactions.push({
      hash: txHash,
      type: 'COINJOIN',
      timestamp: Date.now()
    });
    
    this.logger?.info('CoinJoin транзакция отправлена', {
      mixId: mixContext.id,
      txHash
    });
  }

  /**
   * Выполняет микширование через пул
   */
  async _performPoolMixing(mixContext) {
    const { request } = mixContext;
    
    // Разбиваем сумму на случайные части
    const chunks = await this._createMixingChunks(request.amount, request.currency);
    
    // Обрабатываем каждую часть через пул
    for (const chunk of chunks) {
      const delay = Math.random() * this.config.phaseDelay;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      await this.poolManager.processMixingChunk(chunk, mixContext.sessionId);
    }
    
    mixContext.mixingChunks = chunks;
    
    this.logger?.info('Пуловое микширование завершено', {
      mixId: mixContext.id,
      chunksCount: chunks.length
    });
  }

  /**
   * Распределяет средства из пула
   */
  async _distributeFromPool(mixContext) {
    const { request } = mixContext;
    
    // Планируем выплаты на адреса получателей
    for (const output of request.outputAddresses) {
      const amount = (request.amount * output.percentage) / 100;
      
      await this.scheduler.scheduleDistribution({
        mixId: mixContext.id,
        toAddress: output.address,
        amount,
        currency: request.currency,
        delay: request.delay + Math.random() * 3600000 // ±1 час
      });
    }
    
    this.logger?.info('Распределение запланировано', {
      mixId: mixContext.id,
      outputsCount: request.outputAddresses.length
    });
  }

  /**
   * Обфускирует транзакцию для быстрого микса
   */
  async _obfuscateTransaction(mixContext) {
    const { request } = mixContext;
    
    // Создаем промежуточные адреса
    const intermediateAddresses = await this._generateIntermediateAddresses(request.currency, 3);
    
    // Выполняем серию быстрых переводов
    for (let i = 0; i < intermediateAddresses.length; i++) {
      const fromAddr = i === 0 ? request.depositAddress : intermediateAddresses[i - 1];
      const toAddr = intermediateAddresses[i];
      
      const txHash = await this._executeIntermediateTransfer(
        request.currency,
        fromAddr,
        toAddr,
        request.amount
      );
      
      mixContext.transactions.push({
        hash: txHash,
        type: 'INTERMEDIATE',
        timestamp: Date.now()
      });
      
      // Короткая задержка между переводами
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    this.logger?.info('Обфускация завершена', {
      mixId: mixContext.id,
      intermediateSteps: intermediateAddresses.length
    });
  }

  /**
   * Выполняет прямой трансфер на конечные адреса
   */
  async _executeDirectTransfer(mixContext) {
    const { request } = mixContext;
    const lastIntermediateAddr = mixContext.transactions[mixContext.transactions.length - 1];
    
    // Переводим на конечные адреса
    for (const output of request.outputAddresses) {
      const amount = (request.amount * output.percentage) / 100;
      
      const txHash = await this._executeFinalTransfer(
        request.currency,
        lastIntermediateAddr,
        output.address,
        amount
      );
      
      mixContext.transactions.push({
        hash: txHash,
        type: 'FINAL',
        timestamp: Date.now()
      });
    }
    
    this.logger?.info('Прямой трансфер завершен', {
      mixId: mixContext.id,
      outputsCount: request.outputAddresses.length
    });
  }

  /**
   * Завершает операцию микширования
   */
  async _completeMixing(mixContext) {
    const duration = Date.now() - mixContext.startTime;
    
    mixContext.status = 'COMPLETED';
    mixContext.completedAt = new Date();
    
    // Обновляем статистику
    this.state.statistics.totalMixes++;
    this.state.statistics.successfulMixes++;
    this.metrics.mixingTimes.push(duration);
    
    // Обновляем объем по валютам
    const currency = mixContext.request.currency;
    const currentVolume = this.state.statistics.totalVolume.get(currency) || 0;
    this.state.statistics.totalVolume.set(currency, currentVolume + mixContext.request.amount);
    
    // Удаляем из активных операций
    this.state.activeMixes.delete(mixContext.id);
    
    this.emit('mix:completed', {
      mixId: mixContext.id,
      duration,
      strategy: mixContext.strategy.type,
      transactionsCount: mixContext.transactions.length
    });
    
    this.logger?.info('Микширование завершено успешно', {
      mixId: mixContext.id,
      duration: `${Math.round(duration / 1000)}s`,
      strategy: mixContext.strategy.type
    });
  }

  /**
   * Обрабатывает ошибки микширования
   */
  async _handleMixingError(mixContext, error) {
    mixContext.status = 'FAILED';
    mixContext.error = error.message;
    mixContext.failedAt = new Date();
    
    // Обновляем статистику ошибок
    this.state.statistics.failedMixes++;
    this._updateErrorMetrics(error);
    
    // Пытаемся повторить операцию если возможно
    if (mixContext.retryCount < this.config.maxRetryAttempts) {
      mixContext.retryCount++;
      
      this.logger?.warn('Повторная попытка микширования', {
        mixId: mixContext.id,
        retryCount: mixContext.retryCount,
        error: error.message
      });
      
      // Добавляем в очередь для повтора
      setTimeout(() => {
        this._retryMixing(mixContext);
      }, 60000 * mixContext.retryCount); // Экспоненциальная задержка
      
    } else {
      // Удаляем из активных операций
      this.state.activeMixes.delete(mixContext.id);
      
      this.emit('mix:failed', {
        mixId: mixContext.id,
        error: error.message,
        retryCount: mixContext.retryCount
      });
    }
    
    this.logger?.error('Ошибка микширования', error, {
      mixId: mixContext.id,
      phase: mixContext.currentPhase,
      progress: mixContext.progress
    });
  }

  /**
   * Проверяет готовность зависимостей
   */
  async _validateDependencies() {
    const required = ['poolManager', 'scheduler', 'validator', 'security', 'database'];
    
    for (const dep of required) {
      if (!this[dep]) {
        throw new Error(`Отсутствует зависимость: ${dep}`);
      }
    }
    
    // Проверяем подключение к базе данных
    await this.database.query('SELECT 1');
    
    this.logger?.info('Все зависимости проверены');
  }

  /**
   * Инициализирует систему безопасности
   */
  async _initializeSecurity() {
    if (this.security) {
      await this.security.initialize();
      this.logger?.info('Система безопасности инициализирована');
    }
  }

  /**
   * Запускает мониторинг пулов
   */
  async _startPoolMonitoring() {
    if (this.poolManager) {
      this.poolManager.on('pool:depleted', this._handlePoolDepletion.bind(this));
      this.poolManager.on('pool:overflow', this._handlePoolOverflow.bind(this));
      
      await this.poolManager.startMonitoring();
      this.logger?.info('Мониторинг пулов запущен');
    }
  }

  /**
   * Обработчик события истощения пула
   */
  _handlePoolDepletion(data) {
    this.logger?.warn('Pool depleted:', data);
    this.emit('pool:depleted', data);
  }

  /**
   * Обработчик события переполнения пула
   */
  _handlePoolOverflow(data) {
    this.logger?.warn('Pool overflow:', data);
    this.emit('pool:overflow', data);
  }

  /**
   * Запускает обработчик очереди
   */
  _startQueueProcessor() {
    this.queueInterval = setInterval(() => {
      this._processQueue();
    }, 5000);
  }

  /**
   * Запускает периодические задачи
   */
  _startPeriodicTasks() {
    // Сброс метрик каждый час
    this.metricsInterval = setInterval(() => {
      this._resetMetrics();
    }, 3600000);
    
    // Очистка устаревших операций каждые 10 минут
    this.cleanupInterval = setInterval(() => {
      this._cleanupExpiredMixes();
    }, 600000);
  }

  /**
   * Обрабатывает очередь операций
   */
  async _processQueue() {
    if (this.state.processingQueue.length === 0) {
      return;
    }
    
    const availableSlots = this.config.maxConcurrentMixes - this.state.activeMixes.size;
    const toProcess = this.state.processingQueue.splice(0, availableSlots);
    
    for (const mixRequest of toProcess) {
      try {
        await this.processMixRequest(mixRequest);
      } catch (error) {
        this.logger?.error('Ошибка обработки из очереди:', error, {
          mixId: mixRequest.id
        });
      }
    }
  }

  /**
   * Вычисляет среднее время микширования
   */
  _calculateAverageMixingTime() {
    if (this.metrics.mixingTimes.length === 0) return 0;
    
    const sum = this.metrics.mixingTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.metrics.mixingTimes.length);
  }

  /**
   * Вычисляет процент успеха
   */
  _calculateSuccessRate() {
    const total = this.state.statistics.totalMixes;
    if (total === 0) return 100;
    
    return Math.round((this.state.statistics.successfulMixes / total) * 100);
  }

  /**
   * Вычисляет утилизацию пулов
   */
  _calculatePoolUtilization() {
    if (!this.poolManager) return 0;
    
    try {
      // Получаем информацию о пулах через poolManager
      const poolStats = this.poolManager.getPoolStatistics ? this.poolManager.getPoolStatistics() : null;
      
      if (poolStats && poolStats.utilizationRate !== undefined) {
        return poolStats.utilizationRate;
      }
      
      // Fallback расчет на основе активных миксов
      const activeMixes = this.state.activeMixes.size;
      const maxConcurrent = this.config.maxConcurrentMixes;
      
      return Math.round((activeMixes / maxConcurrent) * 100);
    } catch (error) {
      this.logger?.warn('Ошибка расчета утилизации пулов:', error.message);
      return 0;
    }
  }

  /**
   * Обновляет метрики ошибок
   */
  _updateErrorMetrics(error) {
    const errorType = error.constructor.name;
    const count = this.metrics.errorRates.get(errorType) || 0;
    this.metrics.errorRates.set(errorType, count + 1);
  }

  /**
   * Сбрасывает метрики
   */
  _resetMetrics() {
    this.metrics.mixingTimes = [];
    this.metrics.poolUtilization = [];
    this.metrics.errorRates.clear();
    this.metrics.lastReset = Date.now();
  }

  /**
   * Очищает просроченные операции
   */
  async _cleanupExpiredMixes() {
    const now = Date.now();
    const expired = [];
    
    for (const [mixId, context] of this.state.activeMixes) {
      const elapsed = now - context.startTime;
      if (elapsed > this.config.maxMixingTime) {
        expired.push(mixId);
      }
    }
    
    for (const mixId of expired) {
      const context = this.state.activeMixes.get(mixId);
      this.state.activeMixes.delete(mixId);
      
      this.logger?.warn('Операция микширования просрочена', {
        mixId,
        elapsed: now - context.startTime
      });
      
      this.emit('mix:timeout', { mixId });
    }
  }

  /**
   * Очищает таймеры при остановке
   */
  _clearTimers() {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Генерирует промежуточные адреса для обфускации
   */
  async _generateIntermediateAddresses(currency, count = 3) {
    const addresses = [];
    
    try {
      for (let i = 0; i < count; i++) {
        if (this.blockchainManager && this.blockchainManager.generateAddress) {
          // Используем реальный blockchain manager
          const address = await this.blockchainManager.generateAddress(currency);
          addresses.push(address);
        } else {
          // Fallback генерация для тестов
          const mockAddress = this._generateMockAddress(currency, i);
          addresses.push(mockAddress);
        }
      }
      
      this.logger?.debug('Сгенерированы промежуточные адреса', {
        currency,
        count: addresses.length
      });
      
      return addresses;
    } catch (error) {
      this.logger?.error('Ошибка генерации промежуточных адресов:', error);
      throw new Error(`Не удалось сгенерировать промежуточные адреса: ${error.message}`);
    }
  }

  /**
   * Генерирует mock адрес для тестирования
   */
  _generateMockAddress(currency, index) {
    const prefixes = {
      BTC: '1',
      ETH: '0x',
      USDT: '0x',
      SOL: '11111'
    };
    
    const prefix = prefixes[currency] || '1';
    const randomPart = crypto.randomBytes(16).toString('hex');
    
    return `${prefix}${randomPart}${index}`;
  }

  /**
   * Ждет завершения всех активных операций
   */
  async _waitForActiveMixes() {
    const timeout = 30000; // 30 секунд
    const start = Date.now();
    
    while (this.state.activeMixes.size > 0 && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.state.activeMixes.size > 0) {
      this.logger?.warn('Принудительная остановка с активными операциями', {
        activeMixes: this.state.activeMixes.size
      });
    }
  }

  /**
   * Выполняет промежуточный перевод для обфускации
   */
  async _executeIntermediateTransfer(currency, fromAddress, toAddress, amount) {
    try {
      // Используем blockchain manager для выполнения перевода
      if (this.blockchainManager && this.blockchainManager.sendTransaction) {
        return await this.blockchainManager.sendTransaction(
          currency,
          fromAddress,
          toAddress,
          amount.toString()
        );
      }
      
      // Fallback для тестирования
      const mockTxHash = crypto.randomBytes(32).toString('hex');
      this.logger?.debug('Mock промежуточный перевод', {
        currency,
        from: fromAddress.substring(0, 10) + '...',
        to: toAddress.substring(0, 10) + '...',
        amount,
        txHash: mockTxHash
      });
      
      return mockTxHash;
    } catch (error) {
      this.logger?.error('Ошибка промежуточного перевода:', error);
      throw error;
    }
  }

  /**
   * Выполняет финальный перевод на адрес получателя
   */
  async _executeFinalTransfer(currency, fromAddress, toAddress, amount) {
    try {
      // Используем blockchain manager для выполнения перевода
      if (this.blockchainManager && this.blockchainManager.sendTransaction) {
        return await this.blockchainManager.sendTransaction(
          currency,
          fromAddress,
          toAddress,
          amount.toString()
        );
      }
      
      // Fallback для тестирования
      const mockTxHash = crypto.randomBytes(32).toString('hex');
      this.logger?.debug('Mock финальный перевод', {
        currency,
        from: fromAddress.substring(0, 10) + '...',
        to: toAddress.substring(0, 10) + '...',
        amount,
        txHash: mockTxHash
      });
      
      return mockTxHash;
    } catch (error) {
      this.logger?.error('Ошибка финального перевода:', error);
      throw error;
    }
  }

  /**
   * Создает части для микширования
   */
  async _createMixingChunks(amount, currency) {
    const chunkCount = Math.min(Math.floor(Math.random() * 5) + 2, 7); // 2-7 частей
    const chunks = [];
    let remaining = amount;
    
    for (let i = 0; i < chunkCount - 1; i++) {
      const chunkSize = Math.random() * (remaining * 0.3); // до 30% от остатка
      chunks.push({
        currency,
        amount: chunkSize,
        index: i
      });
      remaining -= chunkSize;
    }
    
    // Последняя часть - остаток
    chunks.push({
      currency,
      amount: remaining,
      index: chunkCount - 1
    });
    
    this.logger?.debug('Созданы части для микширования', {
      currency,
      totalAmount: amount,
      chunksCount: chunks.length
    });
    
    return chunks;
  }

  /**
   * Повторная попытка микширования
   */
  async _retryMixing(mixContext) {
    try {
      // Сбрасываем состояние для повтора
      mixContext.status = 'RETRYING';
      mixContext.currentPhase = 'VALIDATION';
      mixContext.progress = 0;
      mixContext.transactions = [];
      
      this.logger?.info('Повторная попытка микширования', {
        mixId: mixContext.id,
        retryCount: mixContext.retryCount
      });
      
      // Перезапускаем стратегию
      await this._executeMixingStrategy(mixContext, mixContext.strategy);
      
    } catch (error) {
      await this._handleMixingError(mixContext, error);
    }
  }

  /**
   * Создание заглушек для методов, которые пока не реализованы
   */
  async _notifyParticipant(participant, notification) {
    this.logger?.debug('Уведомление участника', { participant: participant.id, type: notification.type });
  }

  async _waitForParticipantConfirmations(coordinationId, participants) {
    this.logger?.debug('Ожидание подтверждений', { coordinationId, count: participants.length });
    // Имитируем задержку
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async _createCoinJoinTransaction(mixContext) {
    return { type: 'COINJOIN', participants: mixContext.strategy.participants };
  }

  async _collectSignatures(transaction, participants) {
    return participants.map(p => ({ participantId: p.id, signature: 'mock_signature' }));
  }

  async _combineCoinJoinSignatures(transaction, signatures) {
    return { ...transaction, signatures };
  }
}

module.exports = MixingEngine;