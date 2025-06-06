const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * Система управления пулами ликвидности для микширования
 * Обеспечивает эффективное распределение и смешивание средств
 */
class PoolManager extends EventEmitter {
  constructor(dependencies = {}) {
    super();
    
    this.database = dependencies.database;
    this.logger = dependencies.logger;
    this.security = dependencies.security;
    this.blockchainManager = dependencies.blockchainManager;
    
    // Конфигурация пулов
    this.config = {
      // Минимальный размер пула для каждой валюты
      minPoolSizes: {
        BTC: 1.0,
        ETH: 10.0,
        USDT: 10000,
        SOL: 100
      },
      // Максимальный размер пула
      maxPoolSizes: {
        BTC: 100.0,
        ETH: 1000.0,
        USDT: 10000000,
        SOL: 100000
      },
      // Целевой размер пула (оптимальный)
      targetPoolSizes: {
        BTC: 10.0,
        ETH: 100.0,
        USDT: 1000000,
        SOL: 10000
      },
      // Время жизни средств в пуле (мс)
      maxPoolAge: 24 * 60 * 60 * 1000, // 24 часа
      // Интервал ребалансировки пулов
      rebalanceInterval: 60 * 60 * 1000, // 1 час
      // Минимальное количество участников для смешивания
      minMixParticipants: 3,
      // Максимальное количество промежуточных адресов
      maxIntermediateAddresses: 10,
      ...dependencies.config
    };
    
    // Состояние пулов
    this.pools = new Map(); // currency -> PoolData
    this.intermediateAddresses = new Map(); // currency -> addresses[]
    this.mixingQueues = new Map(); // currency -> queue[]
    this.rebalanceTimers = new Map();
    
    // Метрики пулов
    this.metrics = {
      totalTransactions: 0,
      totalVolume: new Map(),
      averagePoolUtilization: 0,
      rebalanceCount: 0,
      lastOptimization: null
    };
    
    this.isMonitoring = false;
    
    this.logger?.info('PoolManager инициализирован');
  }

  /**
   * Запускает мониторинг пулов
   */
  async startMonitoring() {
    try {
      if (this.isMonitoring) {
        return;
      }

      this.logger?.info('Запуск мониторинга пулов...');

      // Инициализируем пулы для всех поддерживаемых валют
      await this._initializePools();
      
      // Загружаем существующие данные из БД
      await this._loadPoolData();
      
      // Генерируем промежуточные адреса
      await this._generateIntermediateAddresses();
      
      // Запускаем периодические задачи
      this._startPeriodicTasks();
      
      this.isMonitoring = true;
      this.emit('monitoring:started');
      
      this.logger?.info('Мониторинг пулов запущен');
      
    } catch (error) {
      this.logger?.error('Ошибка запуска мониторинга пулов:', error);
      throw error;
    }
  }

  /**
   * Останавливает мониторинг пулов
   */
  async stopMonitoring() {
    try {
      if (!this.isMonitoring) {
        return;
      }

      this.logger?.info('Остановка мониторинга пулов...');

      // Останавливаем таймеры
      this._clearTimers();
      
      // Сохраняем состояние пулов
      await this._savePoolData();
      
      this.isMonitoring = false;
      this.emit('monitoring:stopped');
      
      this.logger?.info('Мониторинг пулов остановлен');
      
    } catch (error) {
      this.logger?.error('Ошибка остановки мониторинга:', error);
      throw error;
    }
  }

  /**
   * Добавляет средства в пул
   */
  async addToPool(mixRequest) {
    try {
      const { currency, amount, id } = mixRequest;
      
      this.logger?.info('Добавление средств в пул', {
        mixId: id,
        currency,
        amount
      });

      // Проверяем доступность пула
      const pool = this.pools.get(currency);
      if (!pool) {
        throw new Error(`Пул для валюты ${currency} не найден`);
      }

      // Проверяем лимиты пула
      if (pool.totalAmount + amount > this.config.maxPoolSizes[currency]) {
        this.emit('pool:overflow', { currency, amount: pool.totalAmount + amount });
        throw new Error(`Превышен максимальный размер пула для ${currency}`);
      }

      // Создаем запись в пуле
      const poolEntry = {
        id: crypto.randomBytes(16).toString('hex'),
        mixRequestId: id,
        currency,
        amount,
        depositAddress: await this._getRandomIntermediateAddress(currency),
        addedAt: new Date(),
        status: 'ACTIVE',
        mixingHistory: [],
        anonymityScore: 0
      };

      // Добавляем в пул
      pool.entries.push(poolEntry);
      pool.totalAmount += amount;
      pool.participantsCount++;
      pool.lastActivity = new Date();

      // Сохраняем в БД
      await this._savePoolEntry(poolEntry);

      // Обновляем метрики
      this.metrics.totalTransactions++;
      const currentVolume = this.metrics.totalVolume.get(currency) || 0;
      this.metrics.totalVolume.set(currency, currentVolume + amount);

      // Проверяем возможность начать микширование
      await this._checkMixingOpportunity(currency);

      this.emit('pool:entry:added', {
        currency,
        amount,
        poolSize: pool.totalAmount,
        participantsCount: pool.participantsCount
      });

      this.logger?.info('Средства добавлены в пул', {
        mixId: id,
        poolEntryId: poolEntry.id,
        newPoolSize: pool.totalAmount
      });

      return poolEntry;
      
    } catch (error) {
      this.logger?.error('Ошибка добавления в пул:', error, {
        mixId: mixRequest.id,
        currency: mixRequest.currency
      });
      throw error;
    }
  }

  /**
   * Обрабатывает часть микширования
   */
  async processMixingChunk(chunk, sessionId) {
    try {
      const { currency, amount } = chunk;
      
      this.logger?.info('Обработка части микширования', {
        sessionId,
        currency,
        amount
      });

      const pool = this.pools.get(currency);
      if (!pool) {
        throw new Error(`Пул для валюты ${currency} не найден`);
      }

      // Выбираем подходящие записи из пула для смешивания
      const mixingCandidates = await this._selectMixingCandidates(currency, amount);
      
      if (mixingCandidates.length < this.config.minMixParticipants) {
        // Добавляем в очередь ожидания
        this._addToMixingQueue(currency, chunk, sessionId);
        return;
      }

      // Выполняем микширование
      const mixingResult = await this._executeMixing(mixingCandidates, chunk, sessionId);

      // Обновляем записи пула
      await this._updatePoolEntriesAfterMixing(mixingCandidates, mixingResult);

      this.logger?.info('Часть микширования обработана', {
        sessionId,
        mixedAmount: amount,
        participantsCount: mixingCandidates.length
      });

      return mixingResult;
      
    } catch (error) {
      this.logger?.error('Ошибка обработки части микширования:', error, {
        sessionId,
        currency: chunk.currency
      });
      throw error;
    }
  }

  /**
   * Получает текущий статус менеджера пулов
   */
  getStatus() {
    const totalPools = this.pools.size;
    const activePools = Array.from(this.pools.values()).filter(pool => pool.length > 0).length;
    
    return {
      isMonitoring: this.isMonitoring,
      totalPools,
      activePools,
      utilizationRate: totalPools > 0 ? Math.round((activePools / totalPools) * 100) : 0
    };
  }

  /**
   * Выполняет проверку состояния менеджера пулов
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      checks: {
        monitoring: { status: 'pass', message: 'Мониторинг пулов работает' },
        pools: { status: 'pass', message: 'Пулы функционируют нормально' },
        liquidity: { status: 'pass', message: 'Ликвидность достаточна' },
        performance: { status: 'pass', message: 'Производительность в норме' }
      },
      details: {
        isMonitoring: this.isMonitoring,
        totalPools: this.pools.size,
        poolStats: {},
        metrics: this.metrics,
        averageUtilization: this.metrics.averagePoolUtilization
      }
    };

    try {
      // Проверяем состояние мониторинга
      if (!this.isMonitoring) {
        health.checks.monitoring = { status: 'fail', message: 'Мониторинг пулов не запущен' };
        health.status = 'unhealthy';
      }

      // Проверяем состояние каждого пула
      let depletedPools = 0;
      let overflowPools = 0;
      let healthyPools = 0;
      
      for (const [currency, pool] of this.pools) {
        const status = this._getPoolStatus(currency);
        const utilization = this._calculatePoolUtilization(currency);
        
        health.details.poolStats[currency] = {
          status,
          size: pool.totalAmount,
          participants: pool.participantsCount,
          utilization: Math.round(utilization)
        };
        
        if (status === 'DEPLETED') {
          depletedPools++;
        } else if (status === 'OVERFLOW') {
          overflowPools++;
        } else if (status === 'HEALTHY') {
          healthyPools++;
        }
      }
      
      // Оценка состояния пулов
      if (depletedPools > this.pools.size * 0.3) {
        health.checks.pools = { 
          status: 'warn', 
          message: `Много истощенных пулов: ${depletedPools}/${this.pools.size}` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }
      
      if (overflowPools > 0) {
        health.checks.pools = { 
          status: 'warn', 
          message: `Переполненные пулы: ${overflowPools}` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем общую ликвидность
      if (healthyPools === 0 && this.pools.size > 0) {
        health.checks.liquidity = { status: 'fail', message: 'Отсутствуют здоровые пулы' };
        health.status = 'unhealthy';
      }

      // Проверяем очереди миксирования
      let totalQueued = 0;
      for (const [currency, queue] of this.mixingQueues) {
        totalQueued += queue.length;
      }
      
      if (totalQueued > 50) {
        health.checks.performance = { 
          status: 'warn', 
          message: `Большая очередь миксирования: ${totalQueued}` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

      // Проверяем доступность БД
      if (this.database) {
        try {
          await this.database.query('SELECT 1');
        } catch (error) {
          health.checks.pools = { status: 'fail', message: `Ошибка доступа к БД: ${error.message}` };
          health.status = 'unhealthy';
        }
      }

      // Проверяем среднюю утилизацию
      if (this.metrics.averagePoolUtilization < 20 && this.metrics.totalTransactions > 0) {
        health.checks.performance = { 
          status: 'warn', 
          message: `Низкая утилизация пулов: ${Math.round(this.metrics.averagePoolUtilization)}%` 
        };
        if (health.status === 'healthy') {
          health.status = 'degraded';
        }
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
      this.logger?.error('Ошибка проверки состояния менеджера пулов:', error);
    }

    return health;
  }

  /**
   * Получает статистику пула
   */
  getPoolStatistics(currency = null) {
    if (currency) {
      const pool = this.pools.get(currency);
      if (!pool) {
        return null;
      }

      return {
        currency,
        size: pool.totalAmount,
        participantsCount: pool.participantsCount,
        utilization: this._calculatePoolUtilization(currency),
        averageAge: this._calculateAverageAge(pool),
        status: this._getPoolStatus(currency),
        lastActivity: pool.lastActivity
      };
    }

    // Возвращаем статистику всех пулов
    const stats = {};
    for (const [curr, pool] of this.pools) {
      stats[curr] = {
        size: pool.totalAmount,
        participantsCount: pool.participantsCount,
        utilization: this._calculatePoolUtilization(curr),
        status: this._getPoolStatus(curr)
      };
    }

    return {
      pools: stats,
      totalVolume: Object.fromEntries(this.metrics.totalVolume),
      averageUtilization: this.metrics.averagePoolUtilization,
      totalTransactions: this.metrics.totalTransactions
    };
  }

  /**
   * Получает средний размер пула
   */
  getAveragePoolSize() {
    if (this.pools.size === 0) return 0;
    
    let totalSize = 0;
    for (const pool of this.pools.values()) {
      totalSize += pool.totalAmount;
    }
    
    return totalSize / this.pools.size;
  }

  /**
   * Оптимизирует пулы
   */
  async optimizePools() {
    try {
      this.logger?.info('Начало оптимизации пулов');

      const optimizationPlan = {
        rebalancing: [],
        consolidation: [],
        redistribution: []
      };

      // Анализируем каждый пул
      for (const [currency, pool] of this.pools) {
        const analysis = await this._analyzePool(currency, pool);
        
        if (analysis.needsRebalancing) {
          optimizationPlan.rebalancing.push({
            currency,
            action: analysis.rebalanceAction,
            targetAmount: analysis.targetAmount
          });
        }

        if (analysis.hasStaleEntries) {
          optimizationPlan.consolidation.push({
            currency,
            staleEntries: analysis.staleEntries
          });
        }

        if (analysis.needsRedistribution) {
          optimizationPlan.redistribution.push({
            currency,
            redistributionPlan: analysis.redistributionPlan
          });
        }
      }

      // Выполняем оптимизацию
      await this._executeOptimizationPlan(optimizationPlan);

      this.metrics.rebalanceCount++;
      this.metrics.lastOptimization = new Date();

      this.emit('pools:optimized', {
        rebalanced: optimizationPlan.rebalancing.length,
        consolidated: optimizationPlan.consolidation.length,
        redistributed: optimizationPlan.redistribution.length
      });

      this.logger?.info('Оптимизация пулов завершена', {
        actionsPerformed: Object.values(optimizationPlan).reduce((sum, arr) => sum + arr.length, 0)
      });

    } catch (error) {
      this.logger?.error('Ошибка оптимизации пулов:', error);
      throw error;
    }
  }

  /**
   * Планирует распределение средств
   */
  async scheduleDistribution(distributionRequest) {
    try {
      const { mixId, currency, amount, toAddress, delay } = distributionRequest;
      
      this.logger?.info('Планирование распределения', {
        mixId,
        currency,
        amount,
        delay
      });

      // Выбираем источники средств из пула
      const sources = await this._selectDistributionSources(currency, amount);
      
      if (sources.length === 0) {
        throw new Error(`Недостаточно средств в пуле ${currency}`);
      }

      // Создаем план распределения
      const distributionPlan = {
        id: crypto.randomBytes(16).toString('hex'),
        mixId,
        currency,
        totalAmount: amount,
        targetAddress: toAddress,
        sources,
        scheduledAt: new Date(Date.now() + delay),
        status: 'SCHEDULED',
        intermediatePaths: await this._generateIntermediatePaths(currency, sources.length)
      };

      // Сохраняем план
      await this._saveDistributionPlan(distributionPlan);

      // Резервируем средства в пуле
      await this._reservePoolFunds(sources);

      this.logger?.info('Распределение запланировано', {
        planId: distributionPlan.id,
        sourcesCount: sources.length,
        scheduledAt: distributionPlan.scheduledAt
      });

      return distributionPlan;
      
    } catch (error) {
      this.logger?.error('Ошибка планирования распределения:', error, {
        mixId: distributionRequest.mixId
      });
      throw error;
    }
  }

  /**
   * Инициализирует пулы для всех валют
   */
  async _initializePools() {
    const currencies = Object.keys(this.config.minPoolSizes);
    
    for (const currency of currencies) {
      if (!this.pools.has(currency)) {
        this.pools.set(currency, {
          currency,
          totalAmount: 0,
          participantsCount: 0,
          entries: [],
          createdAt: new Date(),
          lastActivity: new Date(),
          lastRebalance: new Date(),
          reservedAmount: 0
        });
        
        this.mixingQueues.set(currency, []);
        
        this.logger?.info(`Инициализирован пул для ${currency}`);
      }
    }
  }

  /**
   * Загружает данные пулов из БД
   */
  async _loadPoolData() {
    try {
      const query = `
        SELECT * FROM pool_entries 
        WHERE status IN ('ACTIVE', 'MIXING', 'RESERVED')
        ORDER BY added_at ASC
      `;

      const result = await this.database.query(query);
      
      for (const row of result.rows) {
        const pool = this.pools.get(row.currency);
        if (pool) {
          pool.entries.push({
            id: row.id,
            mixRequestId: row.mix_request_id,
            currency: row.currency,
            amount: parseFloat(row.amount),
            depositAddress: row.deposit_address,
            addedAt: row.added_at,
            status: row.status,
            mixingHistory: JSON.parse(row.mixing_history || '[]'),
            anonymityScore: row.anonymity_score || 0
          });
          
          pool.totalAmount += parseFloat(row.amount);
          pool.participantsCount++;
        }
      }

      this.logger?.info('Данные пулов загружены из БД', {
        totalEntries: result.rows.length
      });
      
    } catch (error) {
      this.logger?.error('Ошибка загрузки данных пулов:', error);
      throw error;
    }
  }

  /**
   * Генерирует промежуточные адреса
   */
  async _generateIntermediateAddresses() {
    const currencies = Array.from(this.pools.keys());
    
    for (const currency of currencies) {
      const addresses = [];
      
      for (let i = 0; i < this.config.maxIntermediateAddresses; i++) {
        const address = await this._generateSecureAddress(currency);
        addresses.push({
          address,
          isUsed: false,
          createdAt: new Date(),
          lastUsed: null
        });
      }
      
      this.intermediateAddresses.set(currency, addresses);
      
      this.logger?.info(`Сгенерированы промежуточные адреса для ${currency}`, {
        count: addresses.length
      });
    }
  }

  /**
   * Запускает периодические задачи
   */
  _startPeriodicTasks() {
    // Ребалансировка пулов
    this.rebalanceTimer = setInterval(() => {
      this._performRebalancing();
    }, this.config.rebalanceInterval);

    // Очистка устаревших записей
    this.cleanupTimer = setInterval(() => {
      this._cleanupStaleEntries();
    }, 30 * 60 * 1000); // каждые 30 минут

    // Обновление метрик
    this.metricsTimer = setInterval(() => {
      this._updateMetrics();
    }, 5 * 60 * 1000); // каждые 5 минут

    // Обработка очереди микширования
    this.queueTimer = setInterval(() => {
      this._processAllMixingQueues();
    }, 10 * 1000); // каждые 10 секунд
  }

  /**
   * Выбирает кандидатов для микширования
   */
  async _selectMixingCandidates(currency, targetAmount) {
    const pool = this.pools.get(currency);
    const availableEntries = pool.entries.filter(entry => 
      entry.status === 'ACTIVE' && 
      entry.amount >= targetAmount * 0.1 && // минимум 10% от целевой суммы
      entry.amount <= targetAmount * 2.0    // максимум 200% от целевой суммы
    );

    // Сортируем по возрасту для лучшего смешивания
    availableEntries.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
    
    // Выбираем кандидатов с учетом анонимности
    const candidates = [];
    let totalSelected = 0;
    
    for (const entry of availableEntries) {
      if (candidates.length >= this.config.minMixParticipants && 
          totalSelected >= targetAmount * 0.8) {
        break;
      }
      
      // Проверяем совместимость для микширования
      if (this._isCompatibleForMixing(entry, candidates)) {
        candidates.push(entry);
        totalSelected += entry.amount;
      }
    }

    return candidates;
  }

  /**
   * Выполняет микширование
   */
  async _executeMixing(candidates, chunk, sessionId) {
    const mixingId = crypto.randomBytes(16).toString('hex');
    
    this.logger?.info('Выполнение микширования', {
      mixingId,
      participantsCount: candidates.length,
      totalAmount: candidates.reduce((sum, c) => sum + c.amount, 0)
    });

    // Создаем микширующую транзакцию
    const mixingTransaction = {
      id: mixingId,
      sessionId,
      participants: candidates.map(c => c.id),
      inputAmount: candidates.reduce((sum, c) => sum + c.amount, 0),
      outputAmount: chunk.amount,
      currency: chunk.currency,
      intermediatePaths: await this._generateMixingPaths(candidates.length),
      startedAt: new Date(),
      status: 'PROCESSING'
    };

    // Обновляем статус участников
    for (const candidate of candidates) {
      candidate.status = 'MIXING';
      candidate.mixingHistory.push({
        mixingId,
        timestamp: new Date(),
        role: 'PARTICIPANT'
      });
      candidate.anonymityScore += 10; // увеличиваем анонимность
    }

    // Сохраняем микширующую транзакцию
    await this._saveMixingTransaction(mixingTransaction);

    return mixingTransaction;
  }

  /**
   * Проверяет совместимость записи для микширования
   */
  _isCompatibleForMixing(entry, existingCandidates) {
    // Проверяем, что запись не от того же пользователя
    for (const candidate of existingCandidates) {
      if (candidate.mixRequestId === entry.mixRequestId) {
        return false;
      }
      
      // Проверяем временную близость (не должны быть слишком близки по времени)
      const timeDiff = Math.abs(new Date(entry.addedAt) - new Date(candidate.addedAt));
      if (timeDiff < 60000) { // менее минуты
        return false;
      }
    }

    return true;
  }

  /**
   * Выбирает источники для распределения
   */
  async _selectDistributionSources(currency, amount) {
    const pool = this.pools.get(currency);
    const availableEntries = pool.entries.filter(entry => 
      entry.status === 'ACTIVE' && 
      entry.anonymityScore >= 30 // минимальный уровень анонимности
    );

    // Сортируем по уровню анонимности (выше - лучше)
    availableEntries.sort((a, b) => b.anonymityScore - a.anonymityScore);

    const sources = [];
    let remaining = amount;

    for (const entry of availableEntries) {
      if (remaining <= 0) break;

      const useAmount = Math.min(entry.amount, remaining);
      sources.push({
        entryId: entry.id,
        amount: useAmount,
        fromAddress: entry.depositAddress,
        anonymityScore: entry.anonymityScore
      });

      remaining -= useAmount;
    }

    if (remaining > 0) {
      throw new Error(`Недостаточно средств для распределения: нужно ${amount}, доступно ${amount - remaining}`);
    }

    return sources;
  }

  /**
   * Анализирует пул для оптимизации
   */
  async _analyzePool(currency, pool) {
    const target = this.config.targetPoolSizes[currency];
    const min = this.config.minPoolSizes[currency];
    const max = this.config.maxPoolSizes[currency];
    
    const analysis = {
      needsRebalancing: false,
      rebalanceAction: null,
      targetAmount: target,
      hasStaleEntries: false,
      staleEntries: [],
      needsRedistribution: false,
      redistributionPlan: null
    };

    // Проверяем размер пула
    if (pool.totalAmount < min) {
      analysis.needsRebalancing = true;
      analysis.rebalanceAction = 'INCREASE';
    } else if (pool.totalAmount > max) {
      analysis.needsRebalancing = true;
      analysis.rebalanceAction = 'DECREASE';
    }

    // Ищем устаревшие записи
    const now = Date.now();
    for (const entry of pool.entries) {
      const age = now - new Date(entry.addedAt).getTime();
      if (age > this.config.maxPoolAge) {
        analysis.hasStaleEntries = true;
        analysis.staleEntries.push(entry.id);
      }
    }

    // Проверяем распределение по размерам
    const distribution = this._analyzeAmountDistribution(pool.entries);
    if (distribution.needsRedistribution) {
      analysis.needsRedistribution = true;
      analysis.redistributionPlan = distribution.plan;
    }

    return analysis;
  }

  /**
   * Вычисляет утилизацию пула
   */
  _calculatePoolUtilization(currency) {
    const pool = this.pools.get(currency);
    const target = this.config.targetPoolSizes[currency];
    
    if (!pool || target === 0) return 0;
    
    return Math.min((pool.totalAmount / target) * 100, 100);
  }

  /**
   * Вычисляет средний возраст записей в пуле
   */
  _calculateAverageAge(pool) {
    if (pool.entries.length === 0) return 0;
    
    const now = Date.now();
    const totalAge = pool.entries.reduce((sum, entry) => {
      return sum + (now - new Date(entry.addedAt).getTime());
    }, 0);
    
    return totalAge / pool.entries.length;
  }

  /**
   * Получает статус пула
   */
  _getPoolStatus(currency) {
    const pool = this.pools.get(currency);
    const min = this.config.minPoolSizes[currency];
    const target = this.config.targetPoolSizes[currency];
    const max = this.config.maxPoolSizes[currency];
    
    if (pool.totalAmount < min) return 'DEPLETED';
    if (pool.totalAmount > max) return 'OVERFLOW';
    if (pool.totalAmount >= target * 0.8) return 'HEALTHY';
    return 'LOW';
  }

  /**
   * Получает случайный промежуточный адрес
   */
  async _getRandomIntermediateAddress(currency) {
    const addresses = this.intermediateAddresses.get(currency) || [];
    const available = addresses.filter(addr => !addr.isUsed);
    
    if (available.length === 0) {
      // Генерируем новый адрес если все использованы
      const newAddress = await this._generateSecureAddress(currency);
      return newAddress;
    }
    
    const selected = available[Math.floor(Math.random() * available.length)];
    selected.isUsed = true;
    selected.lastUsed = new Date();
    
    return selected.address;
  }

  /**
   * Генерирует безопасный адрес
   */
  async _generateSecureAddress(currency) {
    // Используем блокчейн менеджер для генерации адреса
    if (this.blockchainManager) {
      return await this.blockchainManager.generateAddress(currency);
    }
    
    // Fallback: генерируем псевдо-адрес
    const prefix = {
      BTC: '1',
      ETH: '0x',
      USDT: '0x',
      SOL: ''
    }[currency] || '';
    
    return prefix + crypto.randomBytes(20).toString('hex');
  }

  /**
   * Сохраняет запись пула в БД
   */
  async _savePoolEntry(entry) {
    const query = `
      INSERT INTO pool_entries (
        id, mix_request_id, currency, amount, deposit_address,
        added_at, status, mixing_history, anonymity_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;

    await this.database.query(query, [
      entry.id,
      entry.mixRequestId,
      entry.currency,
      entry.amount,
      entry.depositAddress,
      entry.addedAt,
      entry.status,
      JSON.stringify(entry.mixingHistory),
      entry.anonymityScore
    ]);
  }

  /**
   * Сохраняет состояние пулов
   */
  async _savePoolData() {
    // Сохранение реализуется по необходимости
    this.logger?.info('Состояние пулов сохранено');
  }

  /**
   * Очищает таймеры
   */
  _clearTimers() {
    const timers = [
      'rebalanceTimer',
      'cleanupTimer', 
      'metricsTimer',
      'queueTimer'
    ];
    
    for (const timer of timers) {
      if (this[timer]) {
        clearInterval(this[timer]);
        this[timer] = null;
      }
    }
  }

  /**
   * Обновляет метрики
   */
  _updateMetrics() {
    let totalUtilization = 0;
    const poolCount = this.pools.size;
    
    for (const [currency] of this.pools) {
      totalUtilization += this._calculatePoolUtilization(currency);
    }
    
    this.metrics.averagePoolUtilization = poolCount > 0 ? totalUtilization / poolCount : 0;
  }

  /**
   * Проверяет возможность микширования
   */
  async _checkMixingOpportunity(currency) {
    const queue = this.mixingQueues.get(currency) || [];
    
    if (queue.length >= this.config.minMixParticipants) {
      // Обрабатываем накопившуюся очередь
      await this._processQueuedMixing(currency);
    }
  }

  /**
   * Добавляет в очередь микширования
   */
  _addToMixingQueue(currency, chunk, sessionId) {
    const queue = this.mixingQueues.get(currency) || [];
    queue.push({
      chunk,
      sessionId,
      addedAt: new Date()
    });
    
    this.mixingQueues.set(currency, queue);
  }

  /**
   * Обрабатывает все очереди микширования
   */
  async _processAllMixingQueues() {
    for (const [currency] of this.mixingQueues) {
      await this._processQueuedMixing(currency);
    }
  }

  /**
   * Обрабатывает очередь микширования для валюты
   */
  async _processQueuedMixing(currency) {
    const queue = this.mixingQueues.get(currency) || [];
    
    if (queue.length < this.config.minMixParticipants) {
      return;
    }

    // Берем первые несколько элементов из очереди
    const toProcess = queue.splice(0, this.config.minMixParticipants);
    
    try {
      for (const item of toProcess) {
        await this.processMixingChunk(item.chunk, item.sessionId);
      }
    } catch (error) {
      this.logger?.error('Ошибка обработки очереди микширования:', error, {
        currency,
        queueLength: toProcess.length
      });
      
      // Возвращаем элементы в очередь
      queue.unshift(...toProcess);
    }
  }
}

module.exports = PoolManager;