export interface VaultConfig {
    enabled: boolean;
    endpoint?: string;
    token?: string;
    namespace?: string;
    caPath?: string;
    keyPath?: string;
    certPath?: string;
    requestTimeout?: number;
    retryOptions?: {
        retries: number;
        factor: number;
        minTimeout: number;
        maxTimeout: number;
    };
}
export interface VaultSecret {
    key: string;
    value: string;
    version?: number;
    metadata?: Record<string, any>;
    leaseId?: string;
    leaseDuration?: number;
    renewable?: boolean;
}
export interface VaultKeyResult {
    keyId: string;
    publicKey: string;
    algorithm: string;
    usage: string[];
}
export declare class VaultManager {
    private config;
    private vaultClient;
    private initialized;
    private secretCache;
    private keyCache;
    private cacheTimeout;
    constructor(config: VaultConfig);
    initialize(): Promise<void>;
    private healthCheck;
    private setupSecretEngines;
    private ensureSecretEngine;
    storeSecret(path: string, secret: Record<string, any>, metadata?: Record<string, any>): Promise<void>;
    getSecret(path: string): Promise<VaultSecret | null>;
    generateCryptoKey(keyName: string, algorithm?: string): Promise<VaultKeyResult>;
    encryptData(keyName: string, plaintext: string): Promise<string>;
    decryptData(keyName: string, ciphertext: string): Promise<string>;
    signData(keyName: string, data: string): Promise<string>;
    verifySignature(keyName: string, data: string, signature: string): Promise<boolean>;
    rotateKey(keyName: string): Promise<void>;
    deleteSecret(path: string): Promise<void>;
    private cacheSecret;
    private getCachedSecret;
    private cacheKey;
    private getCachedKey;
    renewLease(leaseId: string): Promise<void>;
    shutdown(): Promise<void>;
    isInitialized(): boolean;
    isEnabled(): boolean;
    getStats(): {
        initialized: boolean;
        cachedSecrets: number;
        cachedKeys: number;
        enabled: boolean;
    };
}
