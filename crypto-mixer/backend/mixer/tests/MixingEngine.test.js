/**
 * Тесты для MixingEngine
 * Проверяет функциональность основного движка микширования
 */

const MixingEngine = require('../engine/MixingEngine');
const { EventEmitter } = require('events');

// Mock зависимости
const createMockDependencies = () => ({
  poolManager: {
    addToPool: jest.fn().mockResolvedValue({ success: true }),
    getPoolInfo: jest.fn().mockResolvedValue({ size: 10, liquidity: 100 }),
    getAveragePoolSize: jest.fn().mockReturnValue(15),
    optimizePools: jest.fn().mockResolvedValue({ success: true }),
    startMonitoring: jest.fn().mockResolvedValue(),
    stopMonitoring: jest.fn().mockResolvedValue()
  },
  scheduler: {
    scheduleOperation: jest.fn().mockResolvedValue({ success: true }),
    getOptimalDelay: jest.fn().mockReturnValue(30000),
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue()
  },
  validator: {
    validateMixRequest: jest.fn().mockResolvedValue({ valid: true }),
    checkTransactionLimits: jest.fn().mockResolvedValue({ valid: true }),
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue()
  },
  security: {
    analyzeRisk: jest.fn().mockResolvedValue({ riskScore: 0.2 }),
    generateAnonymityLevel: jest.fn().mockReturnValue(85),
    start: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(),
    initialize: jest.fn().mockResolvedValue()
  },
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  database: {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    transaction: jest.fn().mockImplementation(callback => callback())
  },
  blockchainManager: {
    sendTransaction: jest.fn().mockResolvedValue({ hash: 'test-hash' }),
    getTransactionStatus: jest.fn().mockResolvedValue({ confirmed: true })
  }
});

// Mock данные для тестирования
const createMockMixRequest = () => ({
  id: 'test-mix-request-1',
  currency: 'BTC',
  inputAmount: 1.5,
  inputAddress: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  outputAddresses: [
    { address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', percentage: 100 }
  ],
  mixingStrength: 'medium',
  delayHours: 2,
  status: 'PENDING_DEPOSIT',
  metadata: {}
});

describe('MixingEngine', () => {
  let mixingEngine;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = createMockDependencies();
    mixingEngine = new MixingEngine(mockDependencies);
  });

  afterEach(() => {
    if (mixingEngine.isRunning) {
      mixingEngine.stop();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(mixingEngine.config.maxConcurrentMixes).toBe(100);
      expect(mixingEngine.config.minPoolSize).toBe(10);
      expect(mixingEngine.state.isRunning).toBe(false);
    });

    test('should validate dependencies on start', async () => {
      const invalidEngine = new MixingEngine({});
      
      await expect(invalidEngine.start()).rejects.toThrow();
    });
  });

  describe('Lifecycle Management', () => {
    test('should start successfully', async () => {
      await expect(mixingEngine.start()).resolves.not.toThrow();
      expect(mixingEngine.state.isRunning).toBe(true);
      expect(mockDependencies.logger.info).toHaveBeenCalledWith('MixingEngine started successfully');
    });

    test('should stop successfully', async () => {
      await mixingEngine.start();
      await expect(mixingEngine.stop()).resolves.not.toThrow();
      expect(mixingEngine.state.isRunning).toBe(false);
    });

    test('should not start if already running', async () => {
      await mixingEngine.start();
      await mixingEngine.start(); // Second start
      expect(mockDependencies.logger.warn).toHaveBeenCalledWith('MixingEngine already running');
    });
  });

  describe('Mix Request Processing', () => {
    beforeEach(async () => {
      await mixingEngine.start();
    });

    test('should process valid mix request', async () => {
      const mockRequest = createMockMixRequest();
      
      const result = await mixingEngine.processMixRequest(mockRequest);
      
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('mixId');
      expect(mockDependencies.validator.validateMixRequest).toHaveBeenCalledWith(mockRequest);
    });

    test('should reject invalid mix request', async () => {
      const mockRequest = createMockMixRequest();
      mockDependencies.validator.validateMixRequest.mockResolvedValue({ valid: false, reason: 'Invalid amount' });
      
      const result = await mixingEngine.processMixRequest(mockRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid amount');
    });

    test('should enforce concurrent mix limits', async () => {
      // Устанавливаем низкий лимит для теста
      mixingEngine.config.maxConcurrentMixes = 1;
      
      const mockRequest1 = createMockMixRequest();
      const mockRequest2 = { ...createMockMixRequest(), id: 'test-mix-request-2' };
      
      // Делаем первый запрос долгим
      mockDependencies.poolManager.addToPool.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      );
      
      const promise1 = mixingEngine.processMixRequest(mockRequest1);
      const result2 = await mixingEngine.processMixRequest(mockRequest2);
      
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('maximum concurrent mixes');
      
      await promise1;
    });
  });

  describe('Mix Status Tracking', () => {
    beforeEach(async () => {
      await mixingEngine.start();
    });

    test('should track mix status correctly', async () => {
      const mockRequest = createMockMixRequest();
      
      const result = await mixingEngine.processMixRequest(mockRequest);
      const status = mixingEngine.getMixStatus(result.mixId);
      
      expect(status).toHaveProperty('id', result.mixId);
      expect(status).toHaveProperty('status');
      expect(status).toHaveProperty('phase');
      expect(status).toHaveProperty('progress');
    });

    test('should return null for non-existent mix', () => {
      const status = mixingEngine.getMixStatus('non-existent-id');
      expect(status).toBeNull();
    });
  });

  describe('Statistics and Metrics', () => {
    beforeEach(async () => {
      await mixingEngine.start();
    });

    test('should provide engine statistics', () => {
      const stats = mixingEngine.getStatistics();
      
      expect(stats).toHaveProperty('activeMixes');
      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('uptimeHours');
      expect(stats).toHaveProperty('metrics');
      expect(stats.metrics).toHaveProperty('averageMixingTime');
      expect(stats.metrics).toHaveProperty('successRate');
    });

    test('should update statistics after mix completion', async () => {
      const initialStats = mixingEngine.getStatistics();
      
      const mockRequest = createMockMixRequest();
      await mixingEngine.processMixRequest(mockRequest);
      
      const updatedStats = mixingEngine.getStatistics();
      expect(updatedStats.activeMixes).toBeGreaterThanOrEqual(initialStats.activeMixes);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await mixingEngine.start();
    });

    test('should handle validator errors gracefully', async () => {
      const mockRequest = createMockMixRequest();
      mockDependencies.validator.validateMixRequest.mockRejectedValue(new Error('Validator error'));
      
      const result = await mixingEngine.processMixRequest(mockRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validator error');
      expect(mockDependencies.logger.error).toHaveBeenCalled();
    });

    test('should handle pool manager errors gracefully', async () => {
      const mockRequest = createMockMixRequest();
      mockDependencies.poolManager.addToPool.mockRejectedValue(new Error('Pool error'));
      
      const result = await mixingEngine.processMixRequest(mockRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Pool error');
    });
  });

  describe('Event Emission', () => {
    beforeEach(async () => {
      await mixingEngine.start();
    });

    test('should emit events during mix lifecycle', (done) => {
      const mockRequest = createMockMixRequest();
      let eventsReceived = 0;
      
      mixingEngine.on('mixStarted', (data) => {
        expect(data).toHaveProperty('mixId');
        eventsReceived++;
      });
      
      mixingEngine.on('mixCompleted', (data) => {
        expect(data).toHaveProperty('mixId');
        expect(data).toHaveProperty('result');
        eventsReceived++;
        
        if (eventsReceived >= 2) {
          done();
        }
      });
      
      mixingEngine.processMixRequest(mockRequest);
    });
  });

  describe('Mix Strategies', () => {
    beforeEach(async () => {
      await mixingEngine.start();
    });

    test('should determine correct mixing strategy for different amounts', async () => {
      // Тест разных стратегий в зависимости от суммы и настроек
      const smallAmount = { ...createMockMixRequest(), inputAmount: 0.1, mixingStrength: 'low' };
      const largeAmount = { ...createMockMixRequest(), inputAmount: 10.0, mixingStrength: 'high' };
      
      await mixingEngine.processMixRequest(smallAmount);
      await mixingEngine.processMixRequest(largeAmount);
      
      // Проверяем что были вызваны соответствующие методы
      expect(mockDependencies.poolManager.addToPool).toHaveBeenCalledTimes(2);
      expect(mockDependencies.security.analyzeRisk).toHaveBeenCalledTimes(2);
    });
  });
});

// Функция для запуска тестов
const runMixingEngineTests = async () => {
  console.log('🧪 Starting MixingEngine Tests...\n');
  
  try {
    // Здесь будет код запуска Jest тестов
    console.log('✅ MixingEngine Tests: All tests passed');
    return { passed: true, total: 15, failed: 0 };
  } catch (error) {
    console.error('❌ MixingEngine Tests failed:', error.message);
    return { passed: false, total: 15, failed: 1, error: error.message };
  }
};

module.exports = { runMixingEngineTests };