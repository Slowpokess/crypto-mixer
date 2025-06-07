import { EventEmitter } from 'events';

interface TimerInfo {
  id: NodeJS.Timeout;
  type: 'interval' | 'timeout';
  createdAt: number;
  description?: string;
}

interface CollectionOptions {
  maxSize: number;
  cleanupThreshold?: number; // When to trigger cleanup (percentage of maxSize)
  ttl?: number; // Time to live in milliseconds
}

interface CollectionEntry<T> {
  value: T;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
}

export class MemoryManager extends EventEmitter {
  private static instance: MemoryManager;
  private timers: Map<string, TimerInfo> = new Map();
  private collections: Map<string, BoundedMap<any, any>> = new Map();
  private monitoringInterval?: NodeJS.Timeout;
  private readonly MONITORING_INTERVAL = 30000; // 30 seconds
  private readonly MEMORY_WARNING_THRESHOLD = 0.8; // 80% of heap limit

  constructor() {
    super();
    this.startMemoryMonitoring();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  // Timer Management
  createTimer(
    name: string, 
    callback: () => void, 
    interval: number, 
    type: 'interval' | 'timeout' = 'interval',
    description?: string
  ): string {
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

  clearTimer(name: string): boolean {
    const timer = this.timers.get(name);
    if (!timer) return false;

    if (timer.type === 'interval') {
      clearInterval(timer.id);
    } else {
      clearTimeout(timer.id);
    }

    this.timers.delete(name);
    return true;
  }

  clearAllTimers(): void {
    for (const [name] of this.timers) {
      this.clearTimer(name);
    }
  }

  getActiveTimers(): string[] {
    return Array.from(this.timers.keys());
  }

  // Collection Management
  createBoundedMap<K, V>(
    name: string, 
    options: CollectionOptions
  ): BoundedMap<K, V> {
    // Clean up existing collection with same name
    const existing = this.collections.get(name);
    if (existing) {
      existing.clear();
      this.collections.delete(name);
    }
    
    const boundedMap = new BoundedMap<K, V>(options);
    this.collections.set(name, boundedMap);
    return boundedMap;
  }

  getBoundedMap<K, V>(name: string): BoundedMap<K, V> | undefined {
    return this.collections.get(name) as BoundedMap<K, V>;
  }

  // Memory Monitoring
  private startMemoryMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage();
      this.cleanupExpiredEntries();
    }, this.MONITORING_INTERVAL);
  }

  private checkMemoryUsage(): void {
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

  private cleanupExpiredEntries(): void {
    for (const [name, collection] of this.collections) {
      try {
        collection.cleanup();
      } catch (error) {
        console.error(`Error cleaning up collection ${name}:`, error);
      }
    }
  }

  private triggerEmergencyCleanup(): void {
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
  emergencyCleanup(): void {
    console.warn('🚨 MemoryManager emergency cleanup triggered');
    
    // Force cleanup on all collections
    for (const [name, collection] of this.collections) {
      try {
        collection.emergencyCleanup();
      } catch (error) {
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
  async shutdown(): Promise<void> {
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
  getStats(): {
    timers: number;
    collections: number;
    totalCollectionSize: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
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

export class BoundedMap<K, V> {
  private readonly map = new Map<K, CollectionEntry<V>>();
  private readonly maxSize: number;
  private readonly cleanupThreshold: number;
  private readonly ttl?: number;

  constructor(options: CollectionOptions) {
    this.maxSize = options.maxSize;
    this.cleanupThreshold = options.cleanupThreshold || 0.8;
    this.ttl = options.ttl;
  }

  set(key: K, value: V): this {
    // Check if we need cleanup before adding
    if (this.map.size >= this.maxSize * this.cleanupThreshold) {
      this.cleanup();
    }

    // If still at max size, remove oldest entries until we have space
    while (this.map.size >= this.maxSize) {
      this.removeOldest();
    }

    const entry: CollectionEntry<V> = {
      value,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1
    };

    this.map.set(key, entry);
    return this;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

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

  has(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    // Check TTL
    if (this.ttl && Date.now() - entry.createdAt > this.ttl) {
      this.map.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    const valueIterator = this.map.values();
    return (function* () {
      for (const entry of valueIterator) {
        yield entry.value;
      }
    })();
  }

  entries(): IterableIterator<[K, V]> {
    const entryIterator = this.map.entries();
    return (function* () {
      for (const [key, entry] of entryIterator) {
        yield [key, entry.value] as [K, V];
      }
    })();
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void {
    for (const [key, entry] of this.map.entries()) {
      callbackfn.call(thisArg, entry.value, key, this as any);
    }
  }

  get [Symbol.toStringTag](): string {
    return 'BoundedMap';
  }

  cleanup(): void {
    if (!this.ttl) return;

    const now = Date.now();
    const toDelete: K[] = [];

    for (const [key, entry] of this.map.entries()) {
      if (now - entry.createdAt > this.ttl) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.map.delete(key);
    }
  }

  emergencyCleanup(): void {
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

  private removeOldest(): void {
    let oldestKey: K | undefined;
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

  getStats(): {
    size: number;
    maxSize: number;
    utilizationPercentage: number;
    oldestEntry?: number;
    newestEntry?: number;
  } {
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

// Export singleton instance
export const memoryManager = MemoryManager.getInstance();