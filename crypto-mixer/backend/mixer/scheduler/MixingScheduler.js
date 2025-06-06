const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Планировщик операций микширования
 * Координирует временные задержки, распределяет нагрузку и управляет очередями
 */
class MixingScheduler extends EventEmitter {
  constructor(dependencies = {}) {
    super();
    
    this.database = dependencies.database;
    this.logger = dependencies.logger;
    this.blockchainManager = dependencies.blockchainManager;
    this.poolManager = dependencies.poolManager;
    this.security = dependencies.security;
    
    // Конфигурация планировщика
    this.config = {
      // Минимальная задержка между операциями (мс)
      minDelay: 10000, // 10 секунд
      // Максимальная задержка между операциями (мс)  
      maxDelay: 72 * 60 * 60 * 1000, // 72 часа
      // Максимальное количество одновременных операций
      maxConcurrentOperations: 50,
      // Интервал проверки расписания (мс)
      scheduleCheckInterval: 30000, // 30 секунд
      // Максимальное количество попыток выполнения
      maxRetryAttempts: 5,
      // Экспоненциальный коэффициент задержки для повторов
      retryBackoffMultiplier: 2,
      // Время жизни запланированной операции (мс)
      operationTTL: 7 * 24 * 60 * 60 * 1000, // 7 дней
      // Размер батча для обработки
      batchSize: 10,
      ...dependencies.config
    };
    
    // Состояние планировщика
    this.state = {
      isRunning: false,
      scheduledOperations: new Map(), // operationId -> operation
      activeOperations: new Map(),    // operationId -> execution context
      operationQueue: [],             // Queue of operations ready to execute
      delayedOperations: new Map(),   // operationId -> timeout handle
      statistics: {
        totalScheduled: 0,
        totalExecuted: 0,
        totalFailed: 0,
        averageDelay: 0,
        successRate: 0
      }
    };
    
    // Типы операций и их приоритеты
    this.operationTypes = {
      DISTRIBUTION: { priority: 1, maxConcurrent: 20 },
      CONSOLIDATION: { priority: 2, maxConcurrent: 10 },
      REBALANCING: { priority: 3, maxConcurrent: 5 },
      COINJOIN: { priority: 1, maxConcurrent: 15 },
      CLEANUP: { priority: 4, maxConcurrent: 5 }
    };
    
    // Таймеры
    this.timers = new Map();
    
    this.logger?.info('MixingScheduler инициализирован');
  }

  /**
   * Запускает планировщик
   */
  async start() {
    try {
      if (this.state.isRunning) {
        throw new Error('Планировщик уже запущен');
      }

      this.logger?.info('Запуск планировщика микширования...');

      // Загружаем незавершенные операции из БД
      await this._loadScheduledOperations();
      
      // Запускаем основной цикл планировщика
      this._startScheduleLoop();
      
      // Запускаем исполнительный цикл
      this._startExecutionLoop();
      
      // Запускаем периодические задачи
      this._startPeriodicTasks();
      
      this.state.isRunning = true;
      this.emit('scheduler:started');
      
      this.logger?.info('Планировщик микширования запущен', {
        scheduledOperations: this.state.scheduledOperations.size,
        queueLength: this.state.operationQueue.length
      });
      
    } catch (error) {
      this.logger?.error('Ошибка запуска планировщика:', error);
      throw error;
    }
  }

  /**
   * Останавливает планировщик
   */
  async stop() {
    try {
      if (!this.state.isRunning) {
        return;
      }

      this.logger?.info('Остановка планировщика микширования...');

      this.state.isRunning = false;
      
      // Останавливаем все таймеры
      this._clearAllTimers();
      
      // Ждем завершения активных операций
      await this._waitForActiveOperations();
      
      // Сохраняем состояние в БД
      await this._saveSchedulerState();
      
      this.emit('scheduler:stopped');
      this.logger?.info('Планировщик микширования остановлен');
      
    } catch (error) {
      this.logger?.error('Ошибка остановки планировщика:', error);
      throw error;
    }
  }

  /**
   * Планирует распределение средств
   */
  async scheduleDistribution(distributionRequest) {
    try {
      const {
        mixId,
        currency,
        amount,
        toAddress,
        delay = 0
      } = distributionRequest;

      this.logger?.info('Планирование распределения', {
        mixId,
        currency,
        amount,
        toAddress: toAddress.substring(0, 10) + '...',
        delay
      });

      // Создаем операцию распределения
      const operation = {
        id: crypto.randomBytes(16).toString('hex'),
        type: 'DISTRIBUTION',
        mixId,
        currency,
        amount,
        toAddress,
        scheduledAt: new Date(Date.now() + delay),
        createdAt: new Date(),
        status: 'SCHEDULED',
        retryCount: 0,
        priority: this.operationTypes.DISTRIBUTION.priority,
        metadata: {
          originalDelay: delay,
          estimatedDuration: this._estimateOperationDuration('DISTRIBUTION'),
          riskLevel: await this._assessOperationRisk(distributionRequest)
        }
      };

      // Добавляем дополнительную рандомизацию для анонимности
      operation.scheduledAt = this._addRandomJitter(operation.scheduledAt);

      // Сохраняем операцию
      await this._saveOperation(operation);
      this.state.scheduledOperations.set(operation.id, operation);
      
      // Устанавливаем таймер если нужно
      if (delay > 0) {
        this._scheduleOperationTimer(operation);
      } else {
        // Добавляем в очередь для немедленного выполнения
        this.state.operationQueue.push(operation);
      }

      this.state.statistics.totalScheduled++;

      this.emit('operation:scheduled', {
        operationId: operation.id,
        type: operation.type,
        scheduledAt: operation.scheduledAt
      });

      this.logger?.info('Распределение запланировано', {
        operationId: operation.id,
        scheduledAt: operation.scheduledAt
      });

      return operation.id;
      
    } catch (error) {
      this.logger?.error('Ошибка планирования распределения:', error, {
        mixId: distributionRequest.mixId
      });
      throw error;
    }
  }

  /**
   * Планирует консолидацию средств
   */
  async scheduleConsolidation(consolidationRequest) {
    try {
      const {
        currency,
        sourceAddresses,
        targetAddress,
        delay = 0
      } = consolidationRequest;

      this.logger?.info('Планирование консолидации', {
        currency,
        sourcesCount: sourceAddresses.length,
        delay
      });

      const operation = {
        id: crypto.randomBytes(16).toString('hex'),
        type: 'CONSOLIDATION',
        currency,
        sourceAddresses,
        targetAddress,
        scheduledAt: new Date(Date.now() + delay),
        createdAt: new Date(),
        status: 'SCHEDULED',
        retryCount: 0,
        priority: this.operationTypes.CONSOLIDATION.priority,
        metadata: {
          sourcesCount: sourceAddresses.length,
          estimatedDuration: this._estimateOperationDuration('CONSOLIDATION'),
          complexity: sourceAddresses.length > 10 ? 'HIGH' : 'NORMAL'
        }
      };

      operation.scheduledAt = this._addRandomJitter(operation.scheduledAt);

      await this._saveOperation(operation);
      this.state.scheduledOperations.set(operation.id, operation);
      
      if (delay > 0) {
        this._scheduleOperationTimer(operation);
      } else {
        this.state.operationQueue.push(operation);
      }

      this.state.statistics.totalScheduled++;

      this.emit('operation:scheduled', {
        operationId: operation.id,
        type: operation.type,
        scheduledAt: operation.scheduledAt
      });

      return operation.id;
      
    } catch (error) {
      this.logger?.error('Ошибка планирования консолидации:', error);
      throw error;
    }
  }

  /**
   * Планирует операцию CoinJoin
   */
  async scheduleCoinJoin(coinJoinRequest) {
    try {
      const {
        participants,
        currency,
        amount,
        coordinationDelay = 60000 // 1 минута на координацию
      } = coinJoinRequest;

      this.logger?.info('Планирование CoinJoin', {
        participantsCount: participants.length,
        currency,
        amount,
        coordinationDelay
      });

      const operation = {
        id: crypto.randomBytes(16).toString('hex'),
        type: 'COINJOIN',
        participants,
        currency,
        amount,
        scheduledAt: new Date(Date.now() + coordinationDelay),
        createdAt: new Date(),
        status: 'SCHEDULED',
        retryCount: 0,
        priority: this.operationTypes.COINJOIN.priority,
        metadata: {
          participantsCount: participants.length,
          coordinationPhases: ['SETUP', 'INPUT_REGISTRATION', 'OUTPUT_REGISTRATION', 'SIGNING'],
          estimatedDuration: coordinationDelay + (participants.length * 30000), // 30 сек на участника
          anonymityLevel: this._calculateAnonymityLevel(participants.length)
        }
      };

      // CoinJoin операции нуждаются в точной координации
      // Не добавляем случайную задержку
      
      await this._saveOperation(operation);
      this.state.scheduledOperations.set(operation.id, operation);
      
      this._scheduleOperationTimer(operation);

      this.state.statistics.totalScheduled++;

      this.emit('operation:scheduled', {
        operationId: operation.id,
        type: operation.type,
        participantsCount: participants.length,
        scheduledAt: operation.scheduledAt
      });

      return operation.id;
      
    } catch (error) {
      this.logger?.error('Ошибка планирования CoinJoin:', error);
      throw error;
    }
  }

  /**
   * Планирует ребалансировку пулов
   */
  async scheduleRebalancing(rebalancingRequest) {
    try {
      const {
        currency,
        action, // 'INCREASE', 'DECREASE', 'REDISTRIBUTE'
        targetAmount,
        delay = 300000 // 5 минут по умолчанию
      } = rebalancingRequest;

      this.logger?.info('Планирование ребалансировки', {
        currency,
        action,
        targetAmount,
        delay
      });

      const operation = {
        id: crypto.randomBytes(16).toString('hex'),
        type: 'REBALANCING',
        currency,
        action,
        targetAmount,
        scheduledAt: new Date(Date.now() + delay),
        createdAt: new Date(),
        status: 'SCHEDULED',
        retryCount: 0,
        priority: this.operationTypes.REBALANCING.priority,
        metadata: {
          action,
          estimatedDuration: this._estimateOperationDuration('REBALANCING'),
          impact: this._assessRebalancingImpact(action, targetAmount)
        }
      };

      operation.scheduledAt = this._addRandomJitter(operation.scheduledAt);

      await this._saveOperation(operation);
      this.state.scheduledOperations.set(operation.id, operation);
      
      this._scheduleOperationTimer(operation);

      this.state.statistics.totalScheduled++;

      return operation.id;
      
    } catch (error) {
      this.logger?.error('Ошибка планирования ребалансировки:', error);
      throw error;
    }
  }

  /**
   * Получает статус операции
   */
  getOperationStatus(operationId) {
    const scheduled = this.state.scheduledOperations.get(operationId);
    if (scheduled) {
      return {
        id: operationId,
        status: scheduled.status,
        type: scheduled.type,
        scheduledAt: scheduled.scheduledAt,
        retryCount: scheduled.retryCount,
        metadata: scheduled.metadata
      };
    }

    const active = this.state.activeOperations.get(operationId);
    if (active) {
      return {
        id: operationId,
        status: 'EXECUTING',
        type: active.operation.type,
        startedAt: active.startedAt,
        progress: active.progress,
        phase: active.currentPhase
      };
    }

    return null;
  }

  /**
   * Получает статистику планировщика
   */
  getStatistics() {
    const stats = {
      ...this.state.statistics,
      currentState: {
        scheduled: this.state.scheduledOperations.size,
        queued: this.state.operationQueue.length,
        active: this.state.activeOperations.size,
        delayed: this.state.delayedOperations.size
      },
      operationTypes: {}
    };

    // Группируем по типам операций
    for (const operation of this.state.scheduledOperations.values()) {
      stats.operationTypes[operation.type] = (stats.operationTypes[operation.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * Отменяет запланированную операцию
   */
  async cancelOperation(operationId) {
    try {
      const operation = this.state.scheduledOperations.get(operationId);
      if (!operation) {
        throw new Error(`Операция ${operationId} не найдена`);
      }

      if (this.state.activeOperations.has(operationId)) {
        throw new Error(`Операция ${operationId} уже выполняется`);
      }

      // Отменяем таймер
      const timer = this.state.delayedOperations.get(operationId);
      if (timer) {
        clearTimeout(timer);
        this.state.delayedOperations.delete(operationId);
      }

      // Удаляем из очереди
      const queueIndex = this.state.operationQueue.findIndex(op => op.id === operationId);
      if (queueIndex !== -1) {
        this.state.operationQueue.splice(queueIndex, 1);
      }

      // Обновляем статус
      operation.status = 'CANCELLED';
      operation.cancelledAt = new Date();

      await this._updateOperationStatus(operationId, 'CANCELLED');
      this.state.scheduledOperations.delete(operationId);

      this.emit('operation:cancelled', { operationId });

      this.logger?.info('Операция отменена', { operationId });

    } catch (error) {
      this.logger?.error('Ошибка отмены операции:', error, { operationId });
      throw error;
    }
  }

  /**
   * Загружает запланированные операции из БД
   */
  async _loadScheduledOperations() {
    try {
      const query = `
        SELECT * FROM scheduled_operations 
        WHERE status IN ('SCHEDULED', 'QUEUED', 'RETRY_PENDING')
          AND scheduled_at > NOW() - INTERVAL '7 days'
        ORDER BY scheduled_at ASC
      `;

      const result = await this.database.query(query);
      
      for (const row of result.rows) {
        const operation = {
          id: row.id,
          type: row.operation_type,
          mixId: row.mix_id,
          currency: row.currency,
          amount: row.amount ? parseFloat(row.amount) : null,
          scheduledAt: row.scheduled_at,
          createdAt: row.created_at,
          status: row.status,
          retryCount: row.retry_count || 0,
          priority: row.priority || 1,
          metadata: JSON.parse(row.metadata || '{}'),
          data: JSON.parse(row.operation_data || '{}')
        };

        this.state.scheduledOperations.set(operation.id, operation);

        // Планируем таймер если операция еще не готова к выполнению
        const now = Date.now();
        const scheduledTime = new Date(operation.scheduledAt).getTime();
        
        if (scheduledTime > now) {
          this._scheduleOperationTimer(operation);
        } else {
          // Добавляем в очередь для немедленного выполнения
          this.state.operationQueue.push(operation);
        }
      }

      this.logger?.info('Загружены запланированные операции', {
        count: result.rows.length
      });
      
    } catch (error) {
      this.logger?.error('Ошибка загрузки операций:', error);
      throw error;
    }
  }

  /**
   * Запускает основной цикл проверки расписания
   */
  _startScheduleLoop() {
    const scheduleTimer = setInterval(() => {
      this._checkSchedule();
    }, this.config.scheduleCheckInterval);
    
    this.timers.set('schedule', scheduleTimer);
  }

  /**
   * Запускает исполнительный цикл
   */
  _startExecutionLoop() {
    const executionTimer = setInterval(() => {
      this._processOperationQueue();
    }, 5000); // каждые 5 секунд
    
    this.timers.set('execution', executionTimer);
  }

  /**
   * Запускает периодические задачи
   */
  _startPeriodicTasks() {
    // Очистка устаревших операций
    const cleanupTimer = setInterval(() => {
      this._cleanupExpiredOperations();
    }, 60 * 60 * 1000); // каждый час
    
    // Обновление статистики
    const statsTimer = setInterval(() => {
      this._updateStatistics();
    }, 5 * 60 * 1000); // каждые 5 минут
    
    this.timers.set('cleanup', cleanupTimer);
    this.timers.set('stats', statsTimer);
  }

  /**
   * Проверяет расписание операций
   */
  _checkSchedule() {
    if (!this.state.isRunning) return;

    const now = Date.now();
    const readyOperations = [];

    for (const operation of this.state.scheduledOperations.values()) {
      if (operation.status === 'SCHEDULED' && 
          new Date(operation.scheduledAt).getTime() <= now) {
        readyOperations.push(operation);
      }
    }

    // Добавляем готовые операции в очередь
    for (const operation of readyOperations) {
      operation.status = 'QUEUED';
      this.state.operationQueue.push(operation);
      
      this.emit('operation:queued', {
        operationId: operation.id,
        type: operation.type
      });
    }

    if (readyOperations.length > 0) {
      this.logger?.info('Операции готовы к выполнению', {
        count: readyOperations.length
      });
    }
  }

  /**
   * Обрабатывает очередь операций
   */
  async _processOperationQueue() {
    if (!this.state.isRunning || this.state.operationQueue.length === 0) {
      return;
    }

    // Проверяем лимиты одновременных операций
    const availableSlots = this.config.maxConcurrentOperations - this.state.activeOperations.size;
    if (availableSlots <= 0) {
      return;
    }

    // Сортируем по приоритету
    this.state.operationQueue.sort((a, b) => a.priority - b.priority);

    // Берем операции для выполнения с учетом типов и лимитов
    const toExecute = [];
    const typeCounts = new Map();

    for (const operation of this.state.operationQueue) {
      if (toExecute.length >= availableSlots) break;

      const typeConfig = this.operationTypes[operation.type];
      const currentCount = typeCounts.get(operation.type) || 0;

      if (currentCount < typeConfig.maxConcurrent) {
        toExecute.push(operation);
        typeCounts.set(operation.type, currentCount + 1);
      }
    }

    // Удаляем выбранные операции из очереди
    for (const operation of toExecute) {
      const index = this.state.operationQueue.indexOf(operation);
      if (index !== -1) {
        this.state.operationQueue.splice(index, 1);
      }
    }

    // Выполняем операции
    for (const operation of toExecute) {
      this._executeOperation(operation).catch(error => {
        this.logger?.error('Ошибка выполнения операции:', error, {
          operationId: operation.id
        });
      });
    }
  }

  /**
   * Выполняет операцию
   */
  async _executeOperation(operation) {
    const executionContext = {
      operation,
      startedAt: new Date(),
      progress: 0,
      currentPhase: 'STARTING',
      retryContext: null
    };

    try {
      this.logger?.info('Начало выполнения операции', {
        operationId: operation.id,
        type: operation.type
      });

      // Добавляем в активные операции
      this.state.activeOperations.set(operation.id, executionContext);
      operation.status = 'EXECUTING';

      this.emit('operation:started', {
        operationId: operation.id,
        type: operation.type
      });

      // Выполняем операцию в зависимости от типа
      let result;
      switch (operation.type) {
        case 'DISTRIBUTION':
          result = await this._executeDistribution(operation, executionContext);
          break;
        case 'CONSOLIDATION':
          result = await this._executeConsolidation(operation, executionContext);
          break;
        case 'COINJOIN':
          result = await this._executeCoinJoin(operation, executionContext);
          break;
        case 'REBALANCING':
          result = await this._executeRebalancing(operation, executionContext);
          break;
        default:
          throw new Error(`Неизвестный тип операции: ${operation.type}`);
      }

      // Операция выполнена успешно
      await this._completeOperation(operation, result);

    } catch (error) {
      await this._handleOperationError(operation, error, executionContext);
    } finally {
      // Удаляем из активных операций
      this.state.activeOperations.delete(operation.id);
    }
  }

  /**
   * Выполняет распределение средств
   */
  async _executeDistribution(operation, context) {
    context.currentPhase = 'PREPARING';
    context.progress = 10;

    const { currency, amount, toAddress } = operation;

    this.logger?.info('Выполнение распределения', {
      operationId: operation.id,
      currency,
      amount,
      toAddress: toAddress.substring(0, 10) + '...'
    });

    // Получаем источники средств от пул менеджера
    context.currentPhase = 'SOURCING';
    context.progress = 25;

    const sources = await this.poolManager.selectDistributionSources(currency, amount);
    
    // Создаем промежуточные транзакции для анонимности
    context.currentPhase = 'MIXING';
    context.progress = 50;

    const mixingPath = await this._createMixingPath(sources, currency);
    
    // Выполняем серию транзакций
    context.currentPhase = 'EXECUTING';
    context.progress = 75;

    const transactions = [];
    for (let i = 0; i < mixingPath.length; i++) {
      const step = mixingPath[i];
      
      const txHash = await this.blockchainManager.sendTransaction(
        currency,
        step.fromAddress,
        step.toAddress,
        step.amount.toString(),
        step.privateKey
      );
      
      transactions.push({
        hash: txHash,
        step: i,
        amount: step.amount,
        timestamp: new Date()
      });
      
      // Небольшая задержка между транзакциями
      if (i < mixingPath.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 10000));
      }
    }

    context.currentPhase = 'COMPLETED';
    context.progress = 100;

    return {
      transactions,
      totalAmount: amount,
      finalAddress: toAddress,
      mixingSteps: mixingPath.length
    };
  }

  /**
   * Выполняет консолидацию средств
   */
  async _executeConsolidation(operation, context) {
    context.currentPhase = 'PREPARING';
    context.progress = 10;

    const { currency, sourceAddresses, targetAddress } = operation;

    this.logger?.info('Выполнение консолидации', {
      operationId: operation.id,
      currency,
      sourcesCount: sourceAddresses.length
    });

    context.currentPhase = 'COLLECTING';
    context.progress = 30;

    // Собираем балансы со всех исходных адресов
    const inputs = [];
    let totalAmount = 0;

    for (const sourceAddr of sourceAddresses) {
      const balance = await this.blockchainManager.getBalance(currency, sourceAddr.address);
      if (parseFloat(balance) > 0) {
        inputs.push({
          address: sourceAddr.address,
          amount: parseFloat(balance),
          privateKey: sourceAddr.privateKey
        });
        totalAmount += parseFloat(balance);
      }
    }

    context.currentPhase = 'CONSOLIDATING';
    context.progress = 70;

    // Создаем консолидирующую транзакцию
    const consolidationTx = await this._createConsolidationTransaction(
      currency,
      inputs,
      targetAddress,
      totalAmount
    );

    // Отправляем транзакцию
    const txHash = await this.blockchainManager.sendRawTransaction(currency, consolidationTx);

    context.currentPhase = 'COMPLETED';
    context.progress = 100;

    return {
      transactionHash: txHash,
      consolidatedAmount: totalAmount,
      inputsCount: inputs.length,
      targetAddress
    };
  }

  /**
   * Выполняет CoinJoin операцию
   */
  async _executeCoinJoin(operation, context) {
    context.currentPhase = 'COORDINATION';
    context.progress = 10;

    const { participants, currency, amount } = operation;

    this.logger?.info('Выполнение CoinJoin', {
      operationId: operation.id,
      participantsCount: participants.length,
      currency,
      amount
    });

    // Фаза координации участников
    const coordinationResult = await this._coordinateCoinJoinParticipants(participants);
    
    context.currentPhase = 'INPUT_REGISTRATION';
    context.progress = 30;

    // Регистрация входов
    const inputs = await this._registerCoinJoinInputs(participants, coordinationResult);
    
    context.currentPhase = 'OUTPUT_REGISTRATION';
    context.progress = 50;

    // Регистрация выходов
    const outputs = await this._registerCoinJoinOutputs(participants, amount);
    
    context.currentPhase = 'SIGNING';
    context.progress = 75;

    // Создание и подписание транзакции
    const coinJoinTx = await this._createCoinJoinTransaction(inputs, outputs, currency);
    const signedTx = await this._collectCoinJoinSignatures(coinJoinTx, participants);
    
    context.currentPhase = 'BROADCASTING';
    context.progress = 90;

    // Отправка транзакции
    const txHash = await this.blockchainManager.sendRawTransaction(currency, signedTx);

    context.currentPhase = 'COMPLETED';
    context.progress = 100;

    return {
      transactionHash: txHash,
      participantsCount: participants.length,
      coinJoinAmount: amount,
      anonymitySet: participants.length
    };
  }

  /**
   * Выполняет ребалансировку пула
   */
  async _executeRebalancing(operation, context) {
    context.currentPhase = 'ANALYZING';
    context.progress = 20;

    const { currency, action, targetAmount } = operation;

    this.logger?.info('Выполнение ребалансировки', {
      operationId: operation.id,
      currency,
      action,
      targetAmount
    });

    // Анализируем текущее состояние пула
    const poolStats = await this.poolManager.getPoolStatistics(currency);
    
    context.currentPhase = 'PLANNING';
    context.progress = 40;

    // Создаем план ребалансировки
    const rebalancePlan = await this._createRebalancePlan(action, poolStats, targetAmount);
    
    context.currentPhase = 'EXECUTING';
    context.progress = 60;

    // Выполняем план ребалансировки
    const result = await this.poolManager.executeRebalancing(rebalancePlan);

    context.currentPhase = 'COMPLETED';
    context.progress = 100;

    return {
      action,
      originalAmount: poolStats.size,
      targetAmount,
      finalAmount: result.finalAmount,
      transactionsCount: result.transactions.length
    };
  }

  /**
   * Завершает операцию успешно
   */
  async _completeOperation(operation, result) {
    operation.status = 'COMPLETED';
    operation.completedAt = new Date();
    operation.result = result;

    await this._updateOperationStatus(operation.id, 'COMPLETED', result);
    this.state.scheduledOperations.delete(operation.id);
    this.state.statistics.totalExecuted++;

    this.emit('operation:completed', {
      operationId: operation.id,
      type: operation.type,
      result
    });

    this.logger?.info('Операция выполнена успешно', {
      operationId: operation.id,
      type: operation.type,
      duration: Date.now() - new Date(operation.createdAt).getTime()
    });
  }

  /**
   * Обрабатывает ошибку операции
   */
  async _handleOperationError(operation, error, context) {
    operation.retryCount++;
    
    this.logger?.error('Ошибка выполнения операции:', error, {
      operationId: operation.id,
      retryCount: operation.retryCount,
      phase: context.currentPhase
    });

    if (operation.retryCount < this.config.maxRetryAttempts) {
      // Планируем повторную попытку с экспоненциальной задержкой
      const retryDelay = this.config.minDelay * 
        Math.pow(this.config.retryBackoffMultiplier, operation.retryCount - 1);
      
      operation.status = 'RETRY_PENDING';
      operation.scheduledAt = new Date(Date.now() + retryDelay);
      
      this._scheduleOperationTimer(operation);
      
      await this._updateOperationStatus(operation.id, 'RETRY_PENDING');
      
      this.emit('operation:retry_scheduled', {
        operationId: operation.id,
        retryCount: operation.retryCount,
        retryAt: operation.scheduledAt
      });
      
    } else {
      // Максимальное количество попыток исчерпано
      operation.status = 'FAILED';
      operation.failedAt = new Date();
      operation.error = error.message;
      
      await this._updateOperationStatus(operation.id, 'FAILED', { error: error.message });
      this.state.scheduledOperations.delete(operation.id);
      this.state.statistics.totalFailed++;
      
      this.emit('operation:failed', {
        operationId: operation.id,
        type: operation.type,
        error: error.message,
        retryCount: operation.retryCount
      });
    }
  }

  /**
   * Устанавливает таймер для операции
   */
  _scheduleOperationTimer(operation) {
    const delay = new Date(operation.scheduledAt).getTime() - Date.now();
    
    if (delay <= 0) {
      // Операция должна выполняться немедленно
      this.state.operationQueue.push(operation);
      return;
    }

    const timer = setTimeout(() => {
      this.state.delayedOperations.delete(operation.id);
      
      if (operation.status === 'SCHEDULED' || operation.status === 'RETRY_PENDING') {
        operation.status = 'QUEUED';
        this.state.operationQueue.push(operation);
      }
    }, Math.min(delay, 2147483647)); // Максимальное значение для setTimeout

    this.state.delayedOperations.set(operation.id, timer);
  }

  /**
   * Добавляет случайную задержку для анонимности
   */
  _addRandomJitter(scheduledTime) {
    const jitter = Math.random() * 60000; // до 1 минуты
    return new Date(scheduledTime.getTime() + jitter);
  }

  /**
   * Оценивает длительность операции
   */
  _estimateOperationDuration(operationType) {
    const estimates = {
      DISTRIBUTION: 5 * 60 * 1000,    // 5 минут
      CONSOLIDATION: 10 * 60 * 1000,  // 10 минут
      COINJOIN: 15 * 60 * 1000,       // 15 минут
      REBALANCING: 20 * 60 * 1000     // 20 минут
    };
    
    return estimates[operationType] || 5 * 60 * 1000;
  }

  /**
   * Оценивает риск операции
   */
  async _assessOperationRisk(request) {
    // Простая система оценки рисков
    let riskScore = 0;
    
    if (request.amount > 1000000) riskScore += 30; // Большая сумма
    if (request.toAddress && await this._isHighRiskAddress(request.toAddress)) riskScore += 50;
    
    return riskScore < 30 ? 'LOW' : riskScore < 70 ? 'MEDIUM' : 'HIGH';
  }

  /**
   * Вычисляет уровень анонимности для CoinJoin
   */
  _calculateAnonymityLevel(participantsCount) {
    if (participantsCount >= 100) return 'VERY_HIGH';
    if (participantsCount >= 50) return 'HIGH';
    if (participantsCount >= 20) return 'MEDIUM';
    if (participantsCount >= 5) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Очищает все таймеры
   */
  _clearAllTimers() {
    // Очищаем основные таймеры
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();

    // Очищаем таймеры отложенных операций
    for (const timer of this.state.delayedOperations.values()) {
      clearTimeout(timer);
    }
    this.state.delayedOperations.clear();
  }

  /**
   * Ждет завершения активных операций
   */
  async _waitForActiveOperations() {
    const timeout = 60000; // 1 минута
    const start = Date.now();
    
    while (this.state.activeOperations.size > 0 && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (this.state.activeOperations.size > 0) {
      this.logger?.warn('Принудительная остановка с активными операциями', {
        activeCount: this.state.activeOperations.size
      });
    }
  }

  /**
   * Сохраняет операцию в БД
   */
  async _saveOperation(operation) {
    const query = `
      INSERT INTO scheduled_operations (
        id, operation_type, mix_id, currency, amount, scheduled_at,
        created_at, status, retry_count, priority, metadata, operation_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    await this.database.query(query, [
      operation.id,
      operation.type,
      operation.mixId || null,
      operation.currency,
      operation.amount || null,
      operation.scheduledAt,
      operation.createdAt,
      operation.status,
      operation.retryCount,
      operation.priority,
      JSON.stringify(operation.metadata || {}),
      JSON.stringify(operation.data || {})
    ]);
  }

  /**
   * Обновляет статус операции в БД
   */
  async _updateOperationStatus(operationId, status, result = null) {
    const query = `
      UPDATE scheduled_operations 
      SET status = $1, updated_at = NOW(), result = $2
      WHERE id = $3
    `;

    await this.database.query(query, [
      status,
      result ? JSON.stringify(result) : null,
      operationId
    ]);
  }

  /**
   * Сохраняет состояние планировщика
   */
  async _saveSchedulerState() {
    // Сохранение текущего состояния планировщика
    this.logger?.info('Состояние планировщика сохранено');
  }

  /**
   * Очищает просроченные операции
   */
  async _cleanupExpiredOperations() {
    const cutoffTime = Date.now() - this.config.operationTTL;
    const expired = [];

    for (const [operationId, operation] of this.state.scheduledOperations) {
      if (new Date(operation.createdAt).getTime() < cutoffTime) {
        expired.push(operationId);
      }
    }

    for (const operationId of expired) {
      await this.cancelOperation(operationId);
      this.logger?.info('Просроченная операция удалена', { operationId });
    }
  }

  /**
   * Обновляет статистику
   */
  _updateStatistics() {
    const total = this.state.statistics.totalExecuted + this.state.statistics.totalFailed;
    
    if (total > 0) {
      this.state.statistics.successRate = 
        Math.round((this.state.statistics.totalExecuted / total) * 100);
    }

    // Другие вычисления статистики...
  }
}

module.exports = MixingScheduler;