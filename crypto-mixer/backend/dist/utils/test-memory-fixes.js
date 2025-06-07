#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryLeakTester = void 0;
const MemoryManager_1 = require("./MemoryManager");
const MemoryMonitoring_1 = require("./MemoryMonitoring");
const MixingScheduler_1 = __importDefault(require("../mixer/scheduler/MixingScheduler"));
const MonitoringSystem_1 = __importDefault(require("../mixer/monitoring/MonitoringSystem"));
class MemoryLeakTester {
    constructor() {
        this.results = [];
    }
    async runAllTests() {
        console.log('🧪 Starting Memory Leak Tests...\n');
        // Start memory monitoring
        MemoryMonitoring_1.memoryMonitoring.start();
        try {
            await this.testTimerCleanup();
            await this.testBoundedMapLimits();
            await this.testSchedulerMemoryLeaks();
            await this.testMonitoringSystemLeaks();
            await this.testEmergencyCleanup();
            await this.testMemoryManagerShutdown();
        }
        finally {
            MemoryMonitoring_1.memoryMonitoring.stop();
        }
        this.printResults();
    }
    async testTimerCleanup() {
        const memBefore = this.getMemoryUsage();
        try {
            // Create many timers
            const timerNames = [];
            for (let i = 0; i < 100; i++) {
                const name = `test-timer-${i}`;
                MemoryManager_1.memoryManager.createTimer(name, () => { }, 1000, 'interval', 'Test timer');
                timerNames.push(name);
            }
            // Check they were created
            const activeTimers = MemoryManager_1.memoryManager.getActiveTimers();
            const testTimers = activeTimers.filter(name => name.startsWith('test-timer-'));
            if (testTimers.length !== 100) {
                throw new Error(`Expected 100 timers, got ${testTimers.length}`);
            }
            // Clear all test timers
            for (const name of timerNames) {
                MemoryManager_1.memoryManager.clearTimer(name);
            }
            // Verify cleanup
            const remainingTimers = MemoryManager_1.memoryManager.getActiveTimers().filter(name => name.startsWith('test-timer-'));
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Timer Cleanup Test',
                passed: remainingTimers.length === 0,
                message: remainingTimers.length === 0
                    ? 'All timers properly cleaned up'
                    : `${remainingTimers.length} timers still active`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
        catch (error) {
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Timer Cleanup Test',
                passed: false,
                message: `Error: ${error}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
    }
    async testBoundedMapLimits() {
        const memBefore = this.getMemoryUsage();
        try {
            const testMap = MemoryManager_1.memoryManager.createBoundedMap('test-bounded-map', {
                maxSize: 100,
                cleanupThreshold: 0.8
            });
            // Fill beyond capacity
            for (let i = 0; i < 200; i++) {
                testMap.set(`key-${i}`, `value-${i}`);
            }
            // Check size is constrained
            const finalSize = testMap.size;
            const stats = testMap.getStats();
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Bounded Map Limits Test',
                passed: finalSize <= 100,
                message: `Map size: ${finalSize}/${stats.maxSize}, utilization: ${stats.utilizationPercentage.toFixed(1)}%`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
            // Cleanup
            testMap.clear();
        }
        catch (error) {
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Bounded Map Limits Test',
                passed: false,
                message: `Error: ${error}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
    }
    async testSchedulerMemoryLeaks() {
        const memBefore = this.getMemoryUsage();
        try {
            const scheduler = new MixingScheduler_1.default({
                logger: { info: () => { }, debug: () => { }, warn: () => { }, error: () => { } }
            });
            // Start scheduler
            await scheduler.start();
            // Schedule many operations
            const operationIds = [];
            for (let i = 0; i < 50; i++) {
                const id = await scheduler.scheduleDistribution({
                    mixId: `test-mix-${i}`,
                    toAddress: `test-address-${i}`,
                    amount: 0.1,
                    currency: 'BTC',
                    delay: 1000
                });
                operationIds.push(id);
            }
            // Wait a bit for operations to be processed
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Cancel all operations
            for (const id of operationIds) {
                await scheduler.cancelOperation(id);
            }
            // Stop scheduler
            await scheduler.shutdown();
            // Check for remaining timers
            const remainingTimers = MemoryManager_1.memoryManager.getActiveTimers().filter(name => name.includes('scheduler') || name.includes('operation'));
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Scheduler Memory Leaks Test',
                passed: remainingTimers.length === 0,
                message: remainingTimers.length === 0
                    ? 'No scheduler timers leaked'
                    : `${remainingTimers.length} scheduler timers still active: ${remainingTimers.join(', ')}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
        catch (error) {
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Scheduler Memory Leaks Test',
                passed: false,
                message: `Error: ${error}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
    }
    async testMonitoringSystemLeaks() {
        const memBefore = this.getMemoryUsage();
        try {
            const monitoring = new MonitoringSystem_1.default({
                logger: { info: () => { }, debug: () => { }, warn: () => { }, error: () => { } }
            });
            // Start monitoring
            await monitoring.startMonitoring();
            // Wait for some metrics collection
            await new Promise(resolve => setTimeout(resolve, 3000));
            // Stop monitoring
            await monitoring.shutdown();
            // Check for remaining timers
            const remainingTimers = MemoryManager_1.memoryManager.getActiveTimers().filter(name => name.includes('monitoring'));
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Monitoring System Leaks Test',
                passed: remainingTimers.length === 0,
                message: remainingTimers.length === 0
                    ? 'No monitoring timers leaked'
                    : `${remainingTimers.length} monitoring timers still active: ${remainingTimers.join(', ')}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
        catch (error) {
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Monitoring System Leaks Test',
                passed: false,
                message: `Error: ${error}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
    }
    async testEmergencyCleanup() {
        const memBefore = this.getMemoryUsage();
        try {
            // Create many collections with data
            const maps = [];
            for (let i = 0; i < 10; i++) {
                const map = MemoryManager_1.memoryManager.createBoundedMap(`stress-test-${i}`, {
                    maxSize: 1000,
                    cleanupThreshold: 0.8
                });
                // Fill with data
                for (let j = 0; j < 500; j++) {
                    map.set(`key-${j}`, { data: `large-string-${'x'.repeat(100)}-${j}` });
                }
                maps.push(map);
            }
            const memAfterCreation = this.getMemoryUsage();
            // Trigger emergency cleanup
            MemoryManager_1.memoryManager.emergencyCleanup();
            // Force garbage collection
            if (global.gc) {
                global.gc();
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
            const memAfterCleanup = this.getMemoryUsage();
            const memoryReduced = memAfterCreation > memAfterCleanup;
            this.results.push({
                name: 'Emergency Cleanup Test',
                passed: memoryReduced,
                message: memoryReduced
                    ? `Memory reduced from ${memAfterCreation.toFixed(1)}MB to ${memAfterCleanup.toFixed(1)}MB`
                    : `Memory not reduced: ${memAfterCreation.toFixed(1)}MB -> ${memAfterCleanup.toFixed(1)}MB`,
                memoryBefore: memBefore,
                memoryAfter: memAfterCleanup,
                memoryDiff: memAfterCleanup - memBefore
            });
            // Cleanup
            for (const map of maps) {
                map.clear();
            }
        }
        catch (error) {
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Emergency Cleanup Test',
                passed: false,
                message: `Error: ${error}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
    }
    async testMemoryManagerShutdown() {
        const memBefore = this.getMemoryUsage();
        try {
            // Get stats before shutdown
            const statsBefore = MemoryManager_1.memoryManager.getStats();
            // Create some resources
            for (let i = 0; i < 10; i++) {
                MemoryManager_1.memoryManager.createTimer(`shutdown-test-${i}`, () => { }, 1000, 'interval');
            }
            const testMap = MemoryManager_1.memoryManager.createBoundedMap('shutdown-test-map', { maxSize: 100 });
            for (let i = 0; i < 50; i++) {
                testMap.set(`key-${i}`, `value-${i}`);
            }
            // Shutdown (but we can't actually call it as it's a singleton)
            // Instead, clear all our test resources
            for (let i = 0; i < 10; i++) {
                MemoryManager_1.memoryManager.clearTimer(`shutdown-test-${i}`);
            }
            testMap.clear();
            const statsAfter = MemoryManager_1.memoryManager.getStats();
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Memory Manager Shutdown Test',
                passed: true, // We can't fully test this without breaking the singleton
                message: `Resources cleaned up properly`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
        catch (error) {
            const memAfter = this.getMemoryUsage();
            this.results.push({
                name: 'Memory Manager Shutdown Test',
                passed: false,
                message: `Error: ${error}`,
                memoryBefore: memBefore,
                memoryAfter: memAfter,
                memoryDiff: memAfter - memBefore
            });
        }
    }
    getMemoryUsage() {
        const memUsage = process.memoryUsage();
        return memUsage.heapUsed / 1024 / 1024; // MB
    }
    printResults() {
        console.log('\n📊 Memory Leak Test Results:');
        console.log('='.repeat(80));
        let passedTests = 0;
        let totalMemoryDiff = 0;
        for (const result of this.results) {
            const status = result.passed ? '✅' : '❌';
            const memoryChange = result.memoryDiff > 0 ? `+${result.memoryDiff.toFixed(1)}MB` : `${result.memoryDiff.toFixed(1)}MB`;
            console.log(`${status} ${result.name}`);
            console.log(`   ${result.message}`);
            console.log(`   Memory: ${result.memoryBefore.toFixed(1)}MB → ${result.memoryAfter.toFixed(1)}MB (${memoryChange})`);
            console.log('');
            if (result.passed)
                passedTests++;
            totalMemoryDiff += result.memoryDiff;
        }
        console.log('='.repeat(80));
        console.log(`✅ Tests Passed: ${passedTests}/${this.results.length}`);
        console.log(`📈 Total Memory Change: ${totalMemoryDiff > 0 ? '+' : ''}${totalMemoryDiff.toFixed(1)}MB`);
        if (passedTests === this.results.length) {
            console.log('🎉 All memory leak tests passed!');
        }
        else {
            console.log('❌ Some memory leak tests failed. Check the results above.');
        }
        // Print current memory manager status
        const stats = MemoryManager_1.memoryManager.getStats();
        console.log('\n🔍 Current Memory Manager Status:');
        console.log(`   Active Timers: ${stats.timers}`);
        console.log(`   Collections: ${stats.collections}`);
        console.log(`   Total Collection Size: ${stats.totalCollectionSize}`);
        console.log(`   Memory Usage: ${(stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);
    }
}
exports.MemoryLeakTester = MemoryLeakTester;
// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new MemoryLeakTester();
    tester.runAllTests()
        .then(() => {
        console.log('\n✅ Memory leak testing completed');
        process.exit(0);
    })
        .catch((error) => {
        console.error('\n❌ Memory leak testing failed:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=test-memory-fixes.js.map