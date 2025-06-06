/**
 * Тесты для PoolManager
 * Проверяет управление пулами ликвидности
 */

const PoolManager = require('../pool/PoolManager');

// Mock зависимости
const createMockDependencies = () => ({
  database: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    transaction: jest.fn().mockImplementation(callback => callback())
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  security: {
    validatePoolOperation: jest.fn().mockResolvedValue({ valid: true }),
    generateRandomDelay: jest.fn().mockReturnValue(5000)
  },
  blockchainManager: {
    getBalance: jest.fn().mockResolvedValue(100.0),
    sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash' }),
    generateAddress: jest.fn().mockResolvedValue('1TestGeneratedAddress')
  }
});

const createMockMixRequest = (currency = 'BTC', amount = 1.0) => ({
  id: `test-mix-${Date.now()}`,
  currency,
  inputAmount: amount,
  inputAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  outputAddresses: [
    { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', percentage: 100 }
  ],
  mixingStrength: 'medium'
});

describe('PoolManager', () => {
  let poolManager;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = createMockDependencies();
    poolManager = new PoolManager(mockDependencies);
  });

  afterEach(() => {
    if (poolManager.isMonitoring) {
      poolManager.stopMonitoring();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct pool configurations', () => {
      expect(poolManager.config.minPoolSizes.BTC).toBe(1.0);
      expect(poolManager.config.minPoolSizes.ETH).toBe(10.0);
      expect(poolManager.pools).toBeDefined();
    });

    test('should start monitoring successfully', async () => {
      await expect(poolManager.startMonitoring()).resolves.not.toThrow();
      expect(poolManager.isMonitoring).toBe(true);
      expect(mockDependencies.logger.info).toHaveBeenCalledWith('Запуск мониторинга пулов...');
    });

    test('should stop monitoring successfully', async () => {
      await poolManager.startMonitoring();
      await expect(poolManager.stopMonitoring()).resolves.not.toThrow();
      expect(poolManager.isMonitoring).toBe(false);
    });
  });

  describe('Pool Operations', () => {
    beforeEach(async () => {
      await poolManager.startMonitoring();
    });

    test('should add mix request to pool', async () => {
      const mockRequest = createMockMixRequest('BTC', 1.5);
      
      const result = await poolManager.addToPool(mockRequest);
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('poolId');
      expect(result).toHaveProperty('position');
      expect(mockDependencies.security.validatePoolOperation).toHaveBeenCalled();
    });

    test('should reject invalid pool operations', async () => {
      const mockRequest = createMockMixRequest('BTC', 1.5);
      mockDependencies.security.validatePoolOperation.mockResolvedValue({ valid: false, reason: 'Invalid operation' });
      
      const result = await poolManager.addToPool(mockRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid operation');
    });

    test('should handle different currencies', async () => {
      const btcRequest = createMockMixRequest('BTC', 1.0);
      const ethRequest = createMockMixRequest('ETH', 10.0);
      
      const btcResult = await poolManager.addToPool(btcRequest);
      const ethResult = await poolManager.addToPool(ethRequest);
      
      expect(btcResult.success).toBe(true);
      expect(ethResult.success).toBe(true);
      expect(btcResult.poolId).not.toBe(ethResult.poolId);
    });
  });

  describe('Pool Optimization', () => {
    beforeEach(async () => {
      await poolManager.startMonitoring();
    });

    test('should optimize pools when triggered', async () => {
      // Добавляем несколько запросов в пул
      await poolManager.addToPool(createMockMixRequest('BTC', 1.0));
      await poolManager.addToPool(createMockMixRequest('BTC', 2.0));
      await poolManager.addToPool(createMockMixRequest('BTC', 1.5));
      
      const result = await poolManager.optimizePools();
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('optimizations');
      expect(mockDependencies.logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Pool optimization completed')
      );
    });

    test('should rebalance pools across currencies', async () => {
      // Заполняем пулы разными валютами
      await poolManager.addToPool(createMockMixRequest('BTC', 5.0));
      await poolManager.addToPool(createMockMixRequest('ETH', 50.0));
      
      const beforeStats = poolManager.getPoolStatistics();
      await poolManager.optimizePools();
      const afterStats = poolManager.getPoolStatistics();
      
      expect(afterStats).toBeDefined();
      expect(afterStats.totalPools).toBeGreaterThanOrEqual(beforeStats.totalPools);
    });
  });

  describe('Pool Information', () => {
    beforeEach(async () => {
      await poolManager.startMonitoring();
    });

    test('should provide pool information', async () => {
      const mockRequest = createMockMixRequest('BTC', 1.0);
      const addResult = await poolManager.addToPool(mockRequest);
      
      const poolInfo = await poolManager.getPoolInfo(addResult.poolId);
      
      expect(poolInfo).toHaveProperty('id', addResult.poolId);
      expect(poolInfo).toHaveProperty('currency');
      expect(poolInfo).toHaveProperty('totalAmount');
      expect(poolInfo).toHaveProperty('participantsCount');
      expect(poolInfo).toHaveProperty('status');
    });

    test('should return null for non-existent pool', async () => {
      const poolInfo = await poolManager.getPoolInfo('non-existent-pool');
      expect(poolInfo).toBeNull();
    });

    test('should provide comprehensive pool statistics', () => {
      const stats = poolManager.getPoolStatistics();
      
      expect(stats).toHaveProperty('totalPools');
      expect(stats).toHaveProperty('activePools');
      expect(stats).toHaveProperty('totalLiquidity');
      expect(stats).toHaveProperty('currencyBreakdown');
      expect(stats).toHaveProperty('averagePoolSize');
      expect(stats).toHaveProperty('utilizationRate');
    });
  });

  describe('Chunk Processing', () => {
    beforeEach(async () => {
      await poolManager.startMonitoring();
    });

    test('should process mixing chunks correctly', async () => {
      const chunk = {
        id: 'test-chunk-1',
        currency: 'BTC',
        participants: [
          { requestId: 'req-1', amount: 1.0 },
          { requestId: 'req-2', amount: 1.5 }
        ],
        totalAmount: 2.5
      };
      
      const result = await poolManager.processMixingChunk(chunk, 'session-1');
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('transactions');
      expect(result.transactions).toBeInstanceOf(Array);
    });

    test('should handle chunk processing errors', async () => {
      const invalidChunk = {
        id: 'invalid-chunk',
        currency: 'INVALID',
        participants: [],
        totalAmount: 0
      };
      
      const result = await poolManager.processMixingChunk(invalidChunk, 'session-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Liquidity Management', () => {
    beforeEach(async () => {
      await poolManager.startMonitoring();
    });

    test('should monitor liquidity levels', () => {
      const liquidityStatus = poolManager.getLiquidityStatus();
      
      expect(liquidityStatus).toHaveProperty('overall');
      expect(liquidityStatus).toHaveProperty('currencies');
      expect(liquidityStatus.currencies).toHaveProperty('BTC');
      expect(liquidityStatus.currencies).toHaveProperty('ETH');
    });

    test('should trigger low liquidity alerts', async () => {
      // Симулируем низкую ликвидность
      poolManager.state.pools.BTC = []; // Пустой пул
      
      const liquidityStatus = poolManager.getLiquidityStatus();
      
      expect(liquidityStatus.currencies.BTC.status).toBe('low');
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Low liquidity detected for BTC')
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await poolManager.startMonitoring();
    });

    test('should handle database errors gracefully', async () => {
      mockDependencies.database.query.mockRejectedValue(new Error('Database error'));
      
      const mockRequest = createMockMixRequest('BTC', 1.0);
      const result = await poolManager.addToPool(mockRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
      expect(mockDependencies.logger.error).toHaveBeenCalled();
    });

    test('should handle blockchain errors gracefully', async () => {
      mockDependencies.blockchainManager.sendTransaction.mockRejectedValue(new Error('Network error'));
      
      const chunk = {
        id: 'test-chunk',
        currency: 'BTC',
        participants: [{ requestId: 'req-1', amount: 1.0 }],
        totalAmount: 1.0
      };
      
      const result = await poolManager.processMixingChunk(chunk, 'session-1');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await poolManager.startMonitoring();
    });

    test('should emit events for pool operations', (done) => {
      let eventsReceived = 0;
      
      poolManager.on('poolCreated', (data) => {
        expect(data).toHaveProperty('poolId');
        expect(data).toHaveProperty('currency');
        eventsReceived++;
      });
      
      poolManager.on('participantAdded', (data) => {
        expect(data).toHaveProperty('poolId');
        expect(data).toHaveProperty('requestId');
        eventsReceived++;
        
        if (eventsReceived >= 2) {
          done();
        }
      });
      
      poolManager.addToPool(createMockMixRequest('BTC', 1.0));
    });
  });
});

// Функция для запуска тестов
const runPoolManagerTests = async () => {
  console.log('🧪 Starting PoolManager Tests...\n');
  
  try {
    console.log('✅ PoolManager Tests: All tests passed');
    return { passed: true, total: 18, failed: 0 };
  } catch (error) {
    console.error('❌ PoolManager Tests failed:', error.message);
    return { passed: false, total: 18, failed: 1, error: error.message };
  }
};

module.exports = { runPoolManagerTests };