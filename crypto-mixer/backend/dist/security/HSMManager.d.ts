export interface HSMKeyPair {
    publicKey: Buffer;
    privateKey: Buffer;
    keyId: string;
    algorithm: string;
    createdAt: Date;
}
export interface HSMConfig {
    enabled: boolean;
    libraryPath?: string;
    slot?: number;
    pin?: string;
    keyRotationInterval?: number;
    maxKeysInMemory?: number;
    encryptionKey: string;
}
export interface HSMKeyResult {
    keyId: string;
    isHSMKey: boolean;
    algorithm: string;
}
export declare class HSMManager {
    private config;
    private initialized;
    private keyStore;
    private pkcs11Module;
    private encryptionKey;
    private keyRotationTimer?;
    constructor(config: HSMConfig);
    initialize(): Promise<void>;
    private initializeHSM;
    generateKeyPair(algorithm?: string): Promise<HSMKeyResult>;
    generateKey(algorithm?: string): Promise<HSMKeyResult>;
    private generateHSMKeyPair;
    private generateSoftwareKeyPair;
    signData(keyId: string, data: Buffer, algorithm?: string): Promise<Buffer>;
    getPublicKey(keyId: string): Promise<Buffer>;
    private storeEncryptedKey;
    private getDecryptedKey;
    private generateKeyId;
    private startKeyRotation;
    private rotateKeys;
    private cleanupOldKeys;
    shutdown(): Promise<void>;
    isInitialized(): boolean;
    isEnabled(): boolean;
    getStats(): {
        initialized: boolean;
        keysInMemory: number;
        isHardwareMode: boolean;
    };
}
