// Полноценная реализация Vault Manager для продакшн-управления секретами
import crypto from 'crypto';
import * as vault from 'node-vault';
import logger from '../utils/logger';

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

export class VaultManager {
  private config: VaultConfig;
  private vaultClient: any = null;
  private initialized: boolean = false;
  private secretCache: Map<string, VaultSecret> = new Map();
  private keyCache: Map<string, VaultKeyResult> = new Map();
  private cacheTimeout: number = 300000; // 5 минут

  constructor(config: VaultConfig) {
    this.config = {
      requestTimeout: 10000,
      retryOptions: {
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 5000
      },
      ...config
    };
  }

  async initialize(): Promise<void> {
    try {
      if (!this.config.enabled) {
        logger.info('Vault отключен в конфигурации');
        this.initialized = true;
        return;
      }

      if (!this.config.endpoint || !this.config.token) {
        throw new Error('Vault endpoint и token обязательны для инициализации');
      }

      // Настройка клиента Vault
      const vaultOptions: any = {
        apiVersion: 'v1',
        endpoint: this.config.endpoint,
        token: this.config.token,
        requestTimeout: this.config.requestTimeout
      };

      if (this.config.namespace) {
        vaultOptions.namespace = this.config.namespace;
      }

      // SSL конфигурация для продакшна
      if (this.config.caPath || this.config.keyPath || this.config.certPath) {
        vaultOptions.mustSecure = true;
        if (this.config.caPath) vaultOptions.ca = this.config.caPath;
        if (this.config.keyPath) vaultOptions.key = this.config.keyPath;
        if (this.config.certPath) vaultOptions.cert = this.config.certPath;
      }

      this.vaultClient = vault.default(vaultOptions);

      // Проверка подключения
      await this.healthCheck();
      
      // Настройка движков секретов если они не существуют
      await this.setupSecretEngines();

      this.initialized = true;
      logger.info('Vault Manager успешно инициализирован', {
        endpoint: this.config.endpoint,
        namespace: this.config.namespace
      });
    } catch (error) {
      logger.error('Ошибка инициализации Vault Manager', error);
      throw error;
    }
  }

  private async healthCheck(): Promise<void> {
    try {
      const health = await this.vaultClient.health();
      if (!health.sealed) {
        logger.info('Vault доступен и распечатан');
      } else {
        throw new Error('Vault запечатан');
      }
    } catch (error) {
      logger.error('Ошибка проверки здоровья Vault', error);
      throw error;
    }
  }

  private async setupSecretEngines(): Promise<void> {
    try {
      // Настройка KV v2 движка для секретов
      await this.ensureSecretEngine('kv-v2', 'mixer-secrets');
      
      // Настройка Transit движка для шифрования
      await this.ensureSecretEngine('transit', 'mixer-transit');
      
      // Настройка PKI движка для сертификатов
      await this.ensureSecretEngine('pki', 'mixer-pki');

      logger.info('Движки секретов настроены');
    } catch (error) {
      logger.error('Ошибка настройки движков секретов', error);
      // Не прерываем инициализацию, возможно движки уже настроены
    }
  }

  private async ensureSecretEngine(type: string, path: string): Promise<void> {
    try {
      await this.vaultClient.mounts();
      // Проверяем существует ли движок
      const mounts = await this.vaultClient.mounts();
      
      if (!mounts[`${path}/`]) {
        await this.vaultClient.mount({
          mount_point: path,
          type: type,
          config: {
            max_lease_ttl: '87600h', // 10 лет
            default_lease_ttl: '8760h' // 1 год
          }
        });
        logger.info(`Создан движок секретов: ${type} в ${path}`);
      }
    } catch (error) {
      // Движок уже может существовать
      logger.debug(`Движок ${path} уже существует или нет прав на создание`);
    }
  }

  async storeSecret(path: string, secret: Record<string, any>, metadata?: Record<string, any>): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      const fullPath = `mixer-secrets/data/${path}`;
      
      await this.vaultClient.write(fullPath, {
        data: secret,
        metadata: metadata || {}
      });

      // Кэшируем секрет
      this.cacheSecret(path, {
        key: path,
        value: JSON.stringify(secret),
        metadata
      });

      logger.info('Секрет успешно сохранен', { path });
    } catch (error) {
      logger.error('Ошибка сохранения секрета', error, { path });
      throw error;
    }
  }

  async getSecret(path: string): Promise<VaultSecret | null> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    // Проверяем кэш
    const cached = this.getCachedSecret(path);
    if (cached) {
      return cached;
    }

    try {
      const fullPath = `mixer-secrets/data/${path}`;
      const response = await this.vaultClient.read(fullPath);
      
      if (!response || !response.data) {
        return null;
      }

      const secret: VaultSecret = {
        key: path,
        value: JSON.stringify(response.data.data),
        version: response.data.metadata?.version,
        metadata: response.data.metadata,
        leaseId: response.lease_id,
        leaseDuration: response.lease_duration,
        renewable: response.renewable
      };

      // Кэшируем
      this.cacheSecret(path, secret);

      return secret;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Ошибка получения секрета', error, { path });
      throw error;
    }
  }

  async generateCryptoKey(keyName: string, algorithm: string = 'aes256-gcm96'): Promise<VaultKeyResult> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    // Проверяем кэш
    const cached = this.getCachedKey(keyName);
    if (cached) {
      return cached;
    }

    try {
      // Создаем ключ в Transit движке
      await this.vaultClient.write(`mixer-transit/keys/${keyName}`, {
        type: algorithm,
        exportable: false, // Ключи не экспортируются для безопасности
        allow_plaintext_backup: false,
        derived: false
      });

      // Получаем информацию о ключе
      const keyInfo = await this.vaultClient.read(`mixer-transit/keys/${keyName}`);
      
      const keyResult: VaultKeyResult = {
        keyId: keyName,
        publicKey: keyInfo.data.keys['1']?.public_key || '',
        algorithm,
        usage: ['encrypt', 'decrypt', 'sign', 'verify']
      };

      // Кэшируем
      this.cacheKey(keyName, keyResult);

      logger.info('Криптографический ключ создан', { keyName, algorithm });
      return keyResult;
    } catch (error) {
      logger.error('Ошибка создания криптографического ключа', error, { keyName });
      throw error;
    }
  }

  async encryptData(keyName: string, plaintext: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      const base64Data = Buffer.from(plaintext).toString('base64');
      
      const response = await this.vaultClient.write(`mixer-transit/encrypt/${keyName}`, {
        plaintext: base64Data
      });

      return response.data.ciphertext;
    } catch (error) {
      logger.error('Ошибка шифрования данных', error, { keyName });
      throw error;
    }
  }

  async decryptData(keyName: string, ciphertext: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      const response = await this.vaultClient.write(`mixer-transit/decrypt/${keyName}`, {
        ciphertext
      });

      const decryptedBase64 = response.data.plaintext;
      return Buffer.from(decryptedBase64, 'base64').toString();
    } catch (error) {
      logger.error('Ошибка расшифровки данных', error, { keyName });
      throw error;
    }
  }

  async signData(keyName: string, data: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      const hashedData = crypto.createHash('sha256').update(data).digest('base64');
      
      const response = await this.vaultClient.write(`mixer-transit/sign/${keyName}`, {
        input: hashedData,
        hash_algorithm: 'sha2-256'
      });

      return response.data.signature;
    } catch (error) {
      logger.error('Ошибка подписи данных', error, { keyName });
      throw error;
    }
  }

  async verifySignature(keyName: string, data: string, signature: string): Promise<boolean> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      const hashedData = crypto.createHash('sha256').update(data).digest('base64');
      
      const response = await this.vaultClient.write(`mixer-transit/verify/${keyName}`, {
        input: hashedData,
        signature,
        hash_algorithm: 'sha2-256'
      });

      return response.data.valid === true;
    } catch (error) {
      logger.error('Ошибка проверки подписи', error, { keyName });
      return false;
    }
  }

  async rotateKey(keyName: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      await this.vaultClient.write(`mixer-transit/keys/${keyName}/rotate`);
      
      // Очищаем кэш для этого ключа
      this.keyCache.delete(keyName);
      
      logger.info('Ключ успешно ротирован', { keyName });
    } catch (error) {
      logger.error('Ошибка ротации ключа', error, { keyName });
      throw error;
    }
  }

  async deleteSecret(path: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      const fullPath = `mixer-secrets/metadata/${path}`;
      await this.vaultClient.delete(fullPath);
      
      // Удаляем из кэша
      this.secretCache.delete(path);
      
      logger.info('Секрет удален', { path });
    } catch (error) {
      logger.error('Ошибка удаления секрета', error, { path });
      throw error;
    }
  }

  private cacheSecret(path: string, secret: VaultSecret): void {
    this.secretCache.set(path, {
      ...secret,
      metadata: {
        ...secret.metadata,
        cachedAt: Date.now()
      }
    });

    // Автоочистка кэша
    setTimeout(() => {
      this.secretCache.delete(path);
    }, this.cacheTimeout);
  }

  private getCachedSecret(path: string): VaultSecret | null {
    const cached = this.secretCache.get(path);
    if (!cached) return null;

    const cachedAt = cached.metadata?.cachedAt || 0;
    if (Date.now() - cachedAt > this.cacheTimeout) {
      this.secretCache.delete(path);
      return null;
    }

    return cached;
  }

  private cacheKey(keyName: string, keyResult: VaultKeyResult): void {
    this.keyCache.set(keyName, keyResult);
    
    // Автоочистка кэша ключей (дольше чем секреты)
    setTimeout(() => {
      this.keyCache.delete(keyName);
    }, this.cacheTimeout * 2);
  }

  private getCachedKey(keyName: string): VaultKeyResult | null {
    return this.keyCache.get(keyName) || null;
  }

  async renewLease(leaseId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('Vault Manager не инициализирован');
    }

    try {
      await this.vaultClient.write('sys/leases/renew', {
        lease_id: leaseId,
        increment: 3600 // Продлеваем на час
      });
      
      logger.info('Lease успешно продлен', { leaseId });
    } catch (error) {
      logger.error('Ошибка продления lease', error, { leaseId });
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Очищаем кэши
    this.secretCache.clear();
    this.keyCache.clear();
    
    this.initialized = false;
    logger.info('Vault Manager завершил работу');
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getStats(): {
    initialized: boolean;
    cachedSecrets: number;
    cachedKeys: number;
    enabled: boolean;
  } {
    return {
      initialized: this.initialized,
      cachedSecrets: this.secretCache.size,
      cachedKeys: this.keyCache.size,
      enabled: this.config.enabled
    };
  }
}