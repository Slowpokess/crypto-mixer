import NodeVault from 'node-vault';
import crypto from 'crypto';
import { Logger } from '../utils/logger';

/**
 * Менеджер для работы с HashiCorp Vault
 * Обеспечивает безопасное хранение и управление приватными ключами
 */
export class VaultManager {
  private vault: any;
  private logger: Logger;
  private config: VaultConfig;
  private isInitialized: boolean = false;

  constructor(config: VaultConfig) {
    this.config = config;
    this.logger = new Logger('VaultManager');
    
    // Инициализация клиента Vault
    this.vault = NodeVault({
      endpoint: config.endpoint,
      token: config.token,
      apiVersion: 'v1',
      requestOptions: {
        timeout: 10000,
        strictSSL: config.strictSSL
      }
    });
  }

  /**
   * Инициализация соединения с Vault и проверка готовности
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Инициализация соединения с HashiCorp Vault...');

      // Проверяем статус Vault
      const status = await this.vault.status();
      if (status.sealed) {
        throw new Error('Vault запечатан. Необходимо распечатать для работы.');
      }

      // Проверяем аутентификацию
      await this.vault.tokenLookupSelf();
      
      // Включаем KV секреты engine если не включен
      try {
        await this.vault.mount({
          mount_point: 'crypto-keys',
          type: 'kv-v2',
          description: 'Хранилище криптографических ключей для микшера'
        });
      } catch (error: any) {
        if (!error.message.includes('path is already in use')) {
          throw error;
        }
      }

      // Включаем transit engine для шифрования
      try {
        await this.vault.mount({
          mount_point: 'transit',
          type: 'transit',
          description: 'Движок шифрования для дополнительной защиты'
        });
      } catch (error: any) {
        if (!error.message.includes('path is already in use')) {
          throw error;
        }
      }

      this.isInitialized = true;
      this.logger.info('Vault успешно инициализирован');

    } catch (error) {
      this.logger.error('Ошибка инициализации Vault:', error);
      throw new Error(`Не удалось подключиться к Vault: ${(error as Error).message}`);
    }
  }

  /**
   * Сохранение приватного ключа в Vault с дополнительным шифрованием
   */
  public async storePrivateKey(
    keyId: string, 
    privateKey: string, 
    metadata: KeyMetadata
  ): Promise<string> {
    this.ensureInitialized();

    try {
      // Генерируем уникальный ключ для шифрования в transit
      const transitKeyName = `key-${keyId}`;
      
      // Создаем ключ шифрования в transit engine
      await this.createTransitKey(transitKeyName);

      // Шифруем приватный ключ через transit engine
      const encryptedKey = await this.encryptWithTransit(transitKeyName, privateKey);

      // Создаем полные метаданные
      const fullMetadata: StoredKeyMetadata = {
        ...metadata,
        keyId,
        transitKeyName,
        createdAt: new Date().toISOString(),
        algorithm: metadata.algorithm || 'secp256k1',
        purpose: metadata.purpose || 'signing',
        rotationSchedule: metadata.rotationSchedule || '90d'
      };

      // Сохраняем зашифрованный ключ в KV store
      const secretPath = `crypto-keys/data/wallets/${metadata.currency}/${keyId}`;
      await this.vault.write(secretPath, {
        data: {
          encrypted_private_key: encryptedKey,
          metadata: fullMetadata,
          version: '1.0'
        }
      });

      // Логируем операцию (без чувствительных данных)
      this.logger.info('Приватный ключ сохранен в Vault', {
        keyId,
        currency: metadata.currency,
        algorithm: metadata.algorithm,
        path: secretPath
      });

      return keyId;

    } catch (error) {
      this.logger.error('Ошибка сохранения ключа в Vault:', error);
      throw new Error(`Не удалось сохранить ключ: ${(error as Error).message}`);
    }
  }

  /**
   * Получение приватного ключа из Vault с расшифровкой
   */
  public async retrievePrivateKey(keyId: string, currency: string): Promise<string> {
    this.ensureInitialized();

    try {
      // Читаем зашифрованный ключ из KV store
      const secretPath = `crypto-keys/data/wallets/${currency}/${keyId}`;
      const secret = await this.vault.read(secretPath);

      if (!secret || !secret.data || !secret.data.data) {
        throw new Error(`Ключ ${keyId} не найден в Vault`);
      }

      const { encrypted_private_key, metadata } = secret.data.data;

      // Расшифровываем ключ через transit engine
      const privateKey = await this.decryptWithTransit(
        metadata.transitKeyName, 
        encrypted_private_key
      );

      // Логируем доступ к ключу
      this.logger.info('Приватный ключ получен из Vault', {
        keyId,
        currency,
        accessedAt: new Date().toISOString()
      });

      return privateKey;

    } catch (error) {
      this.logger.error('Ошибка получения ключа из Vault:', error);
      throw new Error(`Не удалось получить ключ: ${(error as Error).message}`);
    }
  }

  /**
   * Ротация приватного ключа с сохранением старой версии
   */
  public async rotateKey(keyId: string, currency: string): Promise<string> {
    this.ensureInitialized();

    try {
      // Получаем текущие метаданные
      const secretPath = `crypto-keys/data/wallets/${currency}/${keyId}`;
      const currentSecret = await this.vault.read(secretPath);
      
      if (!currentSecret?.data?.data) {
        throw new Error(`Ключ для ротации не найден: ${keyId}`);
      }

      const currentMetadata = currentSecret.data.data.metadata;

      // Архивируем старый ключ
      const archivePath = `crypto-keys/data/archived/${currency}/${keyId}-${Date.now()}`;
      await this.vault.write(archivePath, {
        data: {
          ...currentSecret.data.data,
          archived_at: new Date().toISOString(),
          reason: 'key_rotation'
        }
      });

      // Генерируем новый приватный ключ
      const newPrivateKey = this.generateNewPrivateKey(currentMetadata.algorithm);
      const newKeyId = `${keyId}-rotated-${Date.now()}`;

      // Сохраняем новый ключ
      await this.storePrivateKey(newKeyId, newPrivateKey, {
        ...currentMetadata,
        previousKeyId: keyId,
        rotatedAt: new Date().toISOString()
      });

      this.logger.info('Ключ успешно ротирован', {
        oldKeyId: keyId,
        newKeyId,
        currency
      });

      return newKeyId;

    } catch (error) {
      this.logger.error('Ошибка ротации ключа:', error);
      throw new Error(`Не удалось ротировать ключ: ${(error as Error).message}`);
    }
  }

  /**
   * Удаление ключа из Vault (необратимая операция)
   */
  public async deleteKey(keyId: string, currency: string): Promise<void> {
    this.ensureInitialized();

    try {
      // Сначала архивируем ключ для аудита
      await this.archiveKeyBeforeDeletion(keyId, currency);

      // Удаляем ключ шифрования из transit engine
      const secretPath = `crypto-keys/data/wallets/${currency}/${keyId}`;
      const secret = await this.vault.read(secretPath);
      
      if (secret?.data?.data?.metadata?.transitKeyName) {
        await this.vault.delete(`transit/keys/${secret.data.data.metadata.transitKeyName}`);
      }

      // Удаляем основной секрет
      await this.vault.delete(secretPath);

      this.logger.info('Ключ удален из Vault', {
        keyId,
        currency,
        deletedAt: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Ошибка удаления ключа:', error);
      throw new Error(`Не удалось удалить ключ: ${(error as Error).message}`);
    }
  }

  /**
   * Получение списка всех ключей для валюты
   */
  public async listKeys(currency: string): Promise<KeyInfo[]> {
    this.ensureInitialized();

    try {
      const listPath = `crypto-keys/metadata/wallets/${currency}`;
      const list = await this.vault.list(listPath);

      if (!list?.data?.keys) {
        return [];
      }

      const keys: KeyInfo[] = [];
      
      for (const keyId of list.data.keys) {
        try {
          const secretPath = `crypto-keys/data/wallets/${currency}/${keyId}`;
          const secret = await this.vault.read(secretPath);
          
          if (secret?.data?.data?.metadata) {
            keys.push({
              keyId,
              currency,
              algorithm: secret.data.data.metadata.algorithm,
              createdAt: secret.data.data.metadata.createdAt,
              purpose: secret.data.data.metadata.purpose
            });
          }
        } catch (error) {
          this.logger.warn(`Не удалось получить метаданные для ключа ${keyId}:`, error);
        }
      }

      return keys;

    } catch (error) {
      this.logger.error('Ошибка получения списка ключей:', error);
      throw new Error(`Не удалось получить список ключей: ${(error as Error).message}`);
    }
  }

  /**
   * Создание ключа шифрования в transit engine
   */
  private async createTransitKey(keyName: string): Promise<void> {
    try {
      await this.vault.write(`transit/keys/${keyName}`, {
        type: 'aes256-gcm96',
        deletion_allowed: true,
        derived: false,
        exportable: false
      });
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }

  /**
   * Шифрование данных через transit engine
   */
  private async encryptWithTransit(keyName: string, plaintext: string): Promise<string> {
    const response = await this.vault.write(`transit/encrypt/${keyName}`, {
      plaintext: Buffer.from(plaintext).toString('base64')
    });

    return response.data.ciphertext;
  }

  /**
   * Расшифровка данных через transit engine
   */
  private async decryptWithTransit(keyName: string, ciphertext: string): Promise<string> {
    const response = await this.vault.write(`transit/decrypt/${keyName}`, {
      ciphertext
    });

    return Buffer.from(response.data.plaintext, 'base64').toString();
  }

  /**
   * Генерация нового приватного ключа
   */
  private generateNewPrivateKey(algorithm: string): string {
    switch (algorithm) {
      case 'secp256k1':
        // Генерируем криптографически стойкий приватный ключ для secp256k1
        let privateKey: Buffer;
        do {
          privateKey = crypto.randomBytes(32);
        } while (privateKey.readUInt32BE(0) === 0 || this.isKeyInvalid(privateKey));
        
        return privateKey.toString('hex');

      case 'ed25519':
        // Для Ed25519 генерируем 32-байтовый ключ
        return crypto.randomBytes(32).toString('hex');

      default:
        throw new Error(`Неподдерживаемый алгоритм: ${algorithm}`);
    }
  }

  /**
   * Проверка валидности ключа для secp256k1
   */
  private isKeyInvalid(key: Buffer): boolean {
    // Проверяем, что ключ не превышает порядок кривой secp256k1
    const secp256k1Order = Buffer.from('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 'hex');
    return key.compare(secp256k1Order) >= 0;
  }

  /**
   * Архивирование ключа перед удалением
   */
  private async archiveKeyBeforeDeletion(keyId: string, currency: string): Promise<void> {
    try {
      const secretPath = `crypto-keys/data/wallets/${currency}/${keyId}`;
      const secret = await this.vault.read(secretPath);
      
      if (secret?.data?.data) {
        const archivePath = `crypto-keys/data/deleted/${currency}/${keyId}-${Date.now()}`;
        await this.vault.write(archivePath, {
          data: {
            ...secret.data.data,
            deleted_at: new Date().toISOString(),
            reason: 'manual_deletion'
          }
        });
      }
    } catch (error) {
      this.logger.warn('Не удалось архивировать ключ перед удалением:', error);
    }
  }

  /**
   * Проверка инициализации
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('VaultManager не инициализирован. Вызовите initialize() сначала.');
    }
  }

  /**
   * Получение статистики использования Vault
   */
  public async getStats(): Promise<VaultStats> {
    this.ensureInitialized();

    try {
      const currencies = ['BTC', 'ETH', 'USDT', 'SOL'];
      let totalKeys = 0;
      const keysByCurrency: Record<string, number> = {};

      for (const currency of currencies) {
        const keys = await this.listKeys(currency);
        keysByCurrency[currency] = keys.length;
        totalKeys += keys.length;
      }

      return {
        totalKeys,
        keysByCurrency,
        vaultStatus: 'active',
        lastCheck: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Ошибка получения статистики Vault:', error);
      throw error;
    }
  }

  /**
   * Закрытие соединения с Vault
   */
  public async close(): Promise<void> {
    this.isInitialized = false;
    this.logger.info('Соединение с Vault закрыто');
  }
}

// Интерфейсы и типы
export interface VaultConfig {
  endpoint: string;
  token: string;
  strictSSL: boolean;
}

export interface KeyMetadata {
  currency: string;
  algorithm?: string;
  purpose?: string;
  rotationSchedule?: string;
  description?: string;
}

export interface StoredKeyMetadata extends KeyMetadata {
  keyId: string;
  transitKeyName: string;
  createdAt: string;
  previousKeyId?: string;
  rotatedAt?: string;
}

export interface KeyInfo {
  keyId: string;
  currency: string;
  algorithm: string;
  createdAt: string;
  purpose: string;
}

export interface VaultStats {
  totalKeys: number;
  keysByCurrency: Record<string, number>;
  vaultStatus: string;
  lastCheck: string;
}