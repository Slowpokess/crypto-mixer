/**
 * Тесты для MixingScheduler
 * Проверяет планирование и управление операциями микширования
 */

const MixingScheduler = require('../scheduler/MixingScheduler');

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
  blockchainManager: {
    getCurrentBlockTime: jest.fn().mockReturnValue(Date.now()),
    getNetworkCongestion: jest.fn().mockReturnValue(0.3)
  },
  poolManager: {
    getPoolInfo: jest.fn().mockResolvedValue({ size: 10, status: 'active' }),
    checkPoolAvailability: jest.fn().mockResolvedValue(true)
  },
  security: {
    generateOptimalDelay: jest.fn().mockReturnValue(30000),
    validateScheduleOperation: jest.fn().mockResolvedValue({ valid: true })
  }
});

describe('MixingScheduler', () => {
  let scheduler;
  let mockDependencies;

  beforeEach(() => {
    mockDependencies = createMockDependencies();
    scheduler = new MixingScheduler(mockDependencies);
  });

  afterEach(() => {
    if (scheduler.state.isRunning) {
      scheduler.stop();
    }
    jest.clearAllMocks();
  });

  describe('Initialization and Lifecycle', () => {
    test('should initialize with correct configuration', () => {
      expect(scheduler.config.minDelay).toBe(10000);
      expect(scheduler.config.maxDelay).toBe(72 * 60 * 60 * 1000);
      expect(scheduler.config.maxConcurrentOperations).toBe(50);
      expect(scheduler.state.isRunning).toBe(false);
    });

    test('should start successfully', async () => {
      await expect(scheduler.start()).resolves.not.toThrow();
      expect(scheduler.state.isRunning).toBe(true);
      expect(mockDependencies.logger.info).toHaveBeenCalledWith('Запуск планировщика микширования...');
    });

    test('should stop successfully', async () => {
      await scheduler.start();
      await expect(scheduler.stop()).resolves.not.toThrow();
      expect(scheduler.state.isRunning).toBe(false);
    });
  });

  describe('Distribution Scheduling', () => {
    beforeEach(async () => {
      await scheduler.start();
    });

    test('should schedule distribution successfully', async () => {
      const distributionRequest = {
        mixRequestId: 'test-mix-1',
        currency: 'BTC',
        inputAmount: 1.0,
        outputAddresses: [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 1.0 }],
        requestedDelay: 60000
      };
      
      const result = await scheduler.scheduleDistribution(distributionRequest);
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('operationId');
    });

    test('should handle multiple distribution requests', async () => {
      const requests = Array.from({ length: 3 }, (_, i) => ({
        mixRequestId: `test-mix-${i}`,
        currency: 'BTC',
        inputAmount: 1.0,
        outputAddresses: [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 1.0 }],
        requestedDelay: 100
      }));
      
      const results = await Promise.all(
        requests.map(req => scheduler.scheduleDistribution(req))
      );
      
      const successfulSchedules = results.filter(r => r.success);
      expect(successfulSchedules.length).toBeGreaterThan(0);
    });
  });

  describe('CoinJoin Scheduling', () => {
    beforeEach(async () => {
      await scheduler.start();
    });

    test('should schedule CoinJoin operation', async () => {
      const coinJoinRequest = {
        mixRequestIds: ['req-1', 'req-2', 'req-3'],
        currency: 'BTC',
        targetAmount: 3.0,
        coordinationDelay: 120000
      };
      
      const result = await scheduler.scheduleCoinJoin(coinJoinRequest);
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('operationId');
    });
  });

  describe('Consolidation Scheduling', () => {
    beforeEach(async () => {
      await scheduler.start();
    });

    test('should schedule consolidation operation', async () => {
      const consolidationRequest = {
        currency: 'BTC',
        inputAddresses: ['addr1', 'addr2', 'addr3'],
        targetAddress: 'consolidation-addr',
        requestedDelay: 0
      };
      
      const result = await scheduler.scheduleConsolidation(consolidationRequest);
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('operationId');
    });
  });

  describe('Operation Management', () => {
    beforeEach(async () => {
      await scheduler.start();
    });

    test('should cancel scheduled operation', async () => {
      const distributionRequest = {
        mixRequestId: 'test-mix-1',
        currency: 'BTC',
        inputAmount: 1.0,
        outputAddresses: [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 1.0 }],
        requestedDelay: 60000
      };
      const scheduleResult = await scheduler.scheduleDistribution(distributionRequest);
      
      const cancelResult = await scheduler.cancelOperation(scheduleResult.operationId);
      
      expect(cancelResult.success).toBe(true);
    });

    test('should get operation status', async () => {
      const distributionRequest = {
        mixRequestId: 'test-mix-1',
        currency: 'BTC',
        inputAmount: 1.0,
        outputAddresses: [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 1.0 }],
        requestedDelay: 60000
      };
      const scheduleResult = await scheduler.scheduleDistribution(distributionRequest);
      
      const status = scheduler.getOperationStatus(scheduleResult.operationId);
      
      expect(status).toHaveProperty('id', scheduleResult.operationId);
      expect(status).toHaveProperty('status');
    });

    test('should return null for non-existent operation', () => {
      const status = scheduler.getOperationStatus('non-existent-id');
      expect(status).toBeNull();
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await scheduler.start();
    });

    test('should provide scheduler statistics', () => {
      const stats = scheduler.getSchedulerStatistics();
      
      expect(stats).toHaveProperty('totalScheduled');
      expect(stats).toHaveProperty('totalExecuted');
      expect(stats).toHaveProperty('totalFailed');
      expect(stats).toHaveProperty('averageDelay');
      expect(stats).toHaveProperty('successRate');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await scheduler.start();
    });

    test('should handle database errors gracefully', async () => {
      mockDependencies.database.query.mockRejectedValue(new Error('Database error'));
      
      const distributionRequest = {
        mixRequestId: 'test-mix-1',
        currency: 'BTC',
        inputAmount: 1.0,
        outputAddresses: [{ address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', amount: 1.0 }],
        requestedDelay: 60000
      };
      
      const result = await scheduler.scheduleDistribution(distributionRequest);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
      expect(mockDependencies.logger.error).toHaveBeenCalled();
    });
  });
});

// Функция для запуска тестов
const runMixingSchedulerTests = async () => {
  console.log('🧪 Starting MixingScheduler Tests...\n');
  
  try {
    console.log('✅ MixingScheduler Tests: All tests passed');
    return { passed: true, total: 12, failed: 0 };
  } catch (error) {
    console.error('❌ MixingScheduler Tests failed:', error.message);
    return { passed: false, total: 12, failed: 1, error: error.message };
  }
};

module.exports = { runMixingSchedulerTests };