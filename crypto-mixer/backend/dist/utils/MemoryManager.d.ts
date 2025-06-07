import { EventEmitter } from 'events';
interface CollectionOptions {
    maxSize: number;
    cleanupThreshold?: number;
    ttl?: number;
}
export declare class MemoryManager extends EventEmitter {
    private static instance;
    private timers;
    private collections;
    private monitoringInterval?;
    private readonly MONITORING_INTERVAL;
    private readonly MEMORY_WARNING_THRESHOLD;
    constructor();
    static getInstance(): MemoryManager;
    createTimer(name: string, callback: () => void, interval: number, type?: 'interval' | 'timeout', description?: string): string;
    clearTimer(name: string): boolean;
    clearAllTimers(): void;
    getActiveTimers(): string[];
    createBoundedMap<K, V>(name: string, options: CollectionOptions): BoundedMap<K, V>;
    getBoundedMap<K, V>(name: string): BoundedMap<K, V> | undefined;
    private startMemoryMonitoring;
    private checkMemoryUsage;
    private cleanupExpiredEntries;
    private triggerEmergencyCleanup;
    emergencyCleanup(): void;
    shutdown(): Promise<void>;
    getStats(): {
        timers: number;
        collections: number;
        totalCollectionSize: number;
        memoryUsage: NodeJS.MemoryUsage;
    };
}
export declare class BoundedMap<K, V> {
    private readonly map;
    private readonly maxSize;
    private readonly cleanupThreshold;
    private readonly ttl?;
    constructor(options: CollectionOptions);
    set(key: K, value: V): this;
    get(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    get size(): number;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[K, V]>;
    [Symbol.iterator](): IterableIterator<[K, V]>;
    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: any): void;
    get [Symbol.toStringTag](): string;
    cleanup(): void;
    emergencyCleanup(): void;
    private removeOldest;
    getStats(): {
        size: number;
        maxSize: number;
        utilizationPercentage: number;
        oldestEntry?: number;
        newestEntry?: number;
    };
}
export declare const memoryManager: MemoryManager;
export {};
