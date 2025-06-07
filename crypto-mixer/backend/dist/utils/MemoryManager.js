"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryManager = exports.BoundedMap = exports.MemoryManager = void 0;
const events_1 = require("events");
class MemoryManager extends events_1.EventEmitter {
    constructor() {
        super();
        this.timers = new Map();
        this.collections = new Map();
        this.MONITORING_INTERVAL = 30000; // 30 seconds
        this.MEMORY_WARNING_THRESHOLD = 0.8; // 80% of heap limit
        this.startMemoryMonitoring();
    }
    static getInstance() {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager();
        }
        return MemoryManager.instance;
    }
    // Timer Management
    createTimer(name, callback, interval, type = 'interval', description) {
        // Clear existing timer with same name
        this.clearTimer(name);
        const timerId = type === 'interval'
            ? setInterval(callback, interval)
            : setTimeout(callback, interval);
        this.timers.set(name, {
            id: timerId,
            type,
            createdAt: Date.now(),
            description
        });
        return name;
    }
    clearTimer(name) {
        const timer = this.timers.get(name);
        if (!timer)
            return false;
        if (timer.type === 'interval') {
            clearInterval(timer.id);
        }
        else {
            clearTimeout(timer.id);
        }
        this.timers.delete(name);
        return true;
    }
    clearAllTimers() {
        for (const [name] of this.timers) {
            this.clearTimer(name);
        }
    }
    getActiveTimers() {
        return Array.from(this.timers.keys());
    }
    // Collection Management
    createBoundedMap(name, options) {
        // Clean up existing collection with same name
        const existing = this.collections.get(name);
        if (existing) {
            existing.clear();
            this.collections.delete(name);
        }
        const boundedMap = new BoundedMap(options);
        this.collections.set(name, boundedMap);
        return boundedMap;
    }
    getBoundedMap(name) {
        return this.collections.get(name);
    }
    // Memory Monitoring
    startMemoryMonitoring() {
        this.monitoringInterval = setInterval(() => {
            this.checkMemoryUsage();
            this.cleanupExpiredEntries();
        }, this.MONITORING_INTERVAL);
    }
    checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
        const usagePercentage = heapUsedMB / heapTotalMB;
        this.emit('memory-usage', {
            heapUsed: heapUsedMB,
            heapTotal: heapTotalMB,
            percentage: usagePercentage,
            rss: memUsage.rss / 1024 / 1024,
            external: memUsage.external / 1024 / 1024
        });
        if (usagePercentage > this.MEMORY_WARNING_THRESHOLD) {
            this.emit('memory-warning', {
                message: `High memory usage detected: ${(usagePercentage * 100).toFixed(2)}%`,
                heapUsed: heapUsedMB,
                heapTotal: heapTotalMB
            });
            // Trigger aggressive cleanup
            this.triggerEmergencyCleanup();
        }
    }
    cleanupExpiredEntries() {
        for (const [name, collection] of this.collections) {
            try {
                collection.cleanup();
            }
            catch (error) {
                console.error(`Error cleaning up collection ${name}:`, error);
            }
        }
    }
    triggerEmergencyCleanup() {
        console.warn('🚨 Emergency memory cleanup triggered');
        // Force cleanup on all collections
        for (const [name, collection] of this.collections) {
            collection.emergencyCleanup();
        }
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        this.emit('emergency-cleanup', {
            timestamp: new Date(),
            collections: this.collections.size,
            timers: this.timers.size
        });
    }
    // Emergency cleanup for critical memory situations
    emergencyCleanup() {
        console.warn('🚨 MemoryManager emergency cleanup triggered');
        // Force cleanup on all collections
        for (const [name, collection] of this.collections) {
            try {
                collection.emergencyCleanup();
            }
            catch (error) {
                console.error(`Error during emergency cleanup of ${name}:`, error);
            }
        }
        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }
        this.emit('emergency-cleanup', {
            timestamp: new Date(),
            collections: this.collections.size,
            timers: this.timers.size
        });
    }
    // Shutdown cleanup
    async shutdown() {
        console.log('🧹 MemoryManager shutdown - cleaning up resources...');
        // Clear monitoring
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        // Clear all timers
        this.clearAllTimers();
        // Clear all collections
        for (const [name, collection] of this.collections) {
            collection.clear();
        }
        this.collections.clear();
        // Remove all listeners
        this.removeAllListeners();
        console.log('✅ MemoryManager cleanup completed');
    }
    // Statistics
    getStats() {
        let totalSize = 0;
        for (const collection of this.collections.values()) {
            totalSize += collection.size;
        }
        return {
            timers: this.timers.size,
            collections: this.collections.size,
            totalCollectionSize: totalSize,
            memoryUsage: process.memoryUsage()
        };
    }
}
exports.MemoryManager = MemoryManager;
class BoundedMap {
    constructor(options) {
        this.map = new Map();
        this.maxSize = options.maxSize;
        this.cleanupThreshold = options.cleanupThreshold || 0.8;
        this.ttl = options.ttl;
    }
    set(key, value) {
        // Check if we need cleanup before adding
        if (this.map.size >= this.maxSize * this.cleanupThreshold) {
            this.cleanup();
        }
        // If still at max size, remove oldest entries until we have space
        while (this.map.size >= this.maxSize) {
            this.removeOldest();
        }
        const entry = {
            value,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 1
        };
        this.map.set(key, entry);
        return this;
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        // Check TTL
        if (this.ttl && Date.now() - entry.createdAt > this.ttl) {
            this.map.delete(key);
            return undefined;
        }
        // Update access info
        entry.lastAccessed = Date.now();
        entry.accessCount++;
        return entry.value;
    }
    has(key) {
        const entry = this.map.get(key);
        if (!entry)
            return false;
        // Check TTL
        if (this.ttl && Date.now() - entry.createdAt > this.ttl) {
            this.map.delete(key);
            return false;
        }
        return true;
    }
    delete(key) {
        return this.map.delete(key);
    }
    clear() {
        this.map.clear();
    }
    get size() {
        return this.map.size;
    }
    keys() {
        return this.map.keys();
    }
    values() {
        const valueIterator = this.map.values();
        return (function* () {
            for (const entry of valueIterator) {
                yield entry.value;
            }
        })();
    }
    entries() {
        const entryIterator = this.map.entries();
        return (function* () {
            for (const [key, entry] of entryIterator) {
                yield [key, entry.value];
            }
        })();
    }
    [Symbol.iterator]() {
        return this.entries();
    }
    forEach(callbackfn, thisArg) {
        for (const [key, entry] of this.map.entries()) {
            callbackfn.call(thisArg, entry.value, key, this);
        }
    }
    get [Symbol.toStringTag]() {
        return 'BoundedMap';
    }
    cleanup() {
        if (!this.ttl)
            return;
        const now = Date.now();
        const toDelete = [];
        for (const [key, entry] of this.map.entries()) {
            if (now - entry.createdAt > this.ttl) {
                toDelete.push(key);
            }
        }
        for (const key of toDelete) {
            this.map.delete(key);
        }
    }
    emergencyCleanup() {
        // Remove 50% of entries, starting with least recently used
        const targetSize = Math.floor(this.maxSize * 0.5);
        const entries = Array.from(this.map.entries());
        // Sort by last accessed time (ascending - oldest first)
        entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
        // Remove oldest entries
        const toRemove = entries.slice(0, Math.max(0, this.map.size - targetSize));
        for (const [key] of toRemove) {
            this.map.delete(key);
        }
    }
    removeOldest() {
        let oldestKey;
        let oldestTime = Date.now();
        for (const [key, entry] of this.map.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey !== undefined) {
            this.map.delete(oldestKey);
        }
    }
    getStats() {
        let oldestTime = Date.now();
        let newestTime = 0;
        for (const entry of this.map.values()) {
            oldestTime = Math.min(oldestTime, entry.createdAt);
            newestTime = Math.max(newestTime, entry.createdAt);
        }
        return {
            size: this.map.size,
            maxSize: this.maxSize,
            utilizationPercentage: (this.map.size / this.maxSize) * 100,
            oldestEntry: this.map.size > 0 ? oldestTime : undefined,
            newestEntry: this.map.size > 0 ? newestTime : undefined
        };
    }
}
exports.BoundedMap = BoundedMap;
// Export singleton instance
exports.memoryManager = MemoryManager.getInstance();
//# sourceMappingURL=MemoryManager.js.map