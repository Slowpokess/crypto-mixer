#!/usr/bin/env ts-node
declare class MemoryLeakTester {
    private results;
    runAllTests(): Promise<void>;
    private testTimerCleanup;
    private testBoundedMapLimits;
    private testSchedulerMemoryLeaks;
    private testMonitoringSystemLeaks;
    private testEmergencyCleanup;
    private testMemoryManagerShutdown;
    private getMemoryUsage;
    private printResults;
}
export { MemoryLeakTester };
