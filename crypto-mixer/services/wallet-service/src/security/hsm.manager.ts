import { Logger } from '../utils/logger';
import { VaultManager, KeyMetadata } from './vault.manager';
import crypto from 'crypto';
import * as secp256k1 from 'secp256k1';

// PKCS#11 constants для реальных HSM
const CKM_SHA256_RSA_PKCS = 0x00000040;
const CKM_ECDSA_SHA256 = 0x00001042;
const CKU_USER = 1;
const CKF_RW_SESSION = 0x00000002;
const CKF_SERIAL_SESSION = 0x00000004;

interface PKCS11Session {
  C_Initialize(): void;
  C_GetSlotList(tokenPresent: boolean): number[];
  C_OpenSession(slotId: number, flags: number): number;
  C_Login(session: number, userType: number, pin: string): void;
  C_GenerateKeyPair(session: number, mechanism: any, publicTemplate: any[], privateTemplate: any[]): any;
  C_FindObjectsInit(session: number, template: any[]): void;
  C_FindObjects(session: number, maxCount: number): number[];
  C_FindObjectsFinal(session: number): void;
  C_GetAttributeValue(session: number, object: number, template: any[]): any[];
  C_SignInit(session: number, mechanism: any, key: number): void;
  C_Sign(session: number, data: Buffer): Buffer;
  C_Logout(session: number): void;
  C_CloseSession(session: number): void;
  C_Finalize(): void;
}

/**
 * Гибридный менеджер HSM/Vault для управления криптографическими ключами
 * 
 * В production использует настоящие HSM модули для критических операций,
 * а Vault для хранения и менее критических ключей.
 * В development режиме использует Vault как основное хранилище с программными ключами.
 */
export class HSMManager {
  private pkcs11: PKCS11Session | null = null;
  private session: number | null = null;
  private vaultManager: VaultManager;
  private logger: Logger;
  private config: HSMConfig;
  private isInitialized: boolean = false;

  constructor(config: HSMConfig) {
    this.config = config;
    this.logger = new Logger('HSMManager');
    
    // Инициализируем Vault Manager
    this.vaultManager = new VaultManager({
      endpoint: config.vaultEndpoint,
      token: config.vaultToken,
      strictSSL: config.strictSSL
    });
  }

  /**
   * Инициализация HSM и Vault
   * В production режиме инициализирует реальные HSM модули
   * В development режиме использует только Vault
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Инициализация HSM Manager...');

      // Всегда инициализируем Vault
      await this.vaultManager.initialize();
      this.logger.info('Vault Manager инициализирован');

      if (this.config.useRealHSM && process.env.NODE_ENV === 'production') {
        await this.initializeRealHSM();
      } else {
        this.logger.info('Используется Vault в качестве основного хранилища ключей');
        this.session = 1; // Mock session для совместимости
      }

      this.isInitialized = true;
      this.logger.info('HSM Manager успешно инициализирован');

    } catch (error) {
      this.logger.error('Ошибка инициализации HSM Manager:', error);
      throw new Error(`Не удалось инициализировать HSM: ${(error as Error).message}`);
    }
  }

  /**
   * Инициализация реального HSM модуля
   */
  private async initializeRealHSM(): Promise<void> {
    try {
      // Загружаем PKCS#11 библиотеку
      const { PKCS11 } = await import('pkcs11js');
      this.pkcs11 = new PKCS11();
      
      // Инициализируем PKCS#11
      this.pkcs11.C_Initialize();
      
      // Получаем список слотов
      const slots = this.pkcs11.C_GetSlotList(true);
      if (slots.length === 0) {
        throw new Error('HSM слоты не найдены');
      }

      // Открываем сессию с первым доступным слотом
      const slotId = slots[0];
      this.session = this.pkcs11.C_OpenSession(
        slotId, 
        CKF_SERIAL_SESSION | CKF_RW_SESSION
      );

      // Аутентификация в HSM
      if (this.config.hsmPin) {
        this.pkcs11.C_Login(this.session, CKU_USER, this.config.hsmPin);
      }

      this.logger.info('Реальный HSM модуль инициализирован', { slotId });

    } catch (error) {
      this.logger.error('Ошибка инициализации реального HSM:', error);
      throw error;
    }
  }

  public isConnected(): boolean {
    return this.isInitialized && this.session !== null;
  }

  /**
   * Генерация нового криптографического ключа
   * В зависимости от конфигурации использует HSM или генерирует программно и сохраняет в Vault
   */
  public async generateKey(
    algorithm: string, 
    currency: string, 
    purpose: KeyPurpose = 'signing'
  ): Promise<KeyGenerationResult> {
    this.ensureInitialized();

    try {
      const keyId = this.generateKeyId(currency, algorithm);
      
      if (this.shouldUseHSM(purpose)) {
        return await this.generateKeyInHSM(keyId, algorithm, currency, purpose);
      } else {
        return await this.generateKeyInVault(keyId, algorithm, currency, purpose);
      }

    } catch (error) {
      this.logger.error('Ошибка генерации ключа:', error);
      throw new Error(`Не удалось сгенерировать ключ: ${(error as Error).message}`);
    }
  }

  /**
   * Генерация ключа в HSM (для критических операций)
   */
  private async generateKeyInHSM(
    keyId: string, 
    algorithm: string, 
    currency: string, 
    purpose: KeyPurpose
  ): Promise<KeyGenerationResult> {
    if (!this.pkcs11 || !this.session) {
      throw new Error('HSM недоступен для генерации ключа');
    }

    try {
      let mechanism;
      let keyTemplate;

      switch (algorithm) {
        case 'secp256k1':
          mechanism = { mechanism: CKM_ECDSA_SHA256 };
          keyTemplate = this.getSecp256k1KeyTemplate(keyId);
          break;
        case 'ed25519':
          // Для Ed25519 используем специфичный механизм
          mechanism = { mechanism: 0x00001057 }; // CKM_EC_EDWARDS_KEY_PAIR_GEN
          keyTemplate = this.getEd25519KeyTemplate(keyId);
          break;
        default:
          throw new Error(`Неподдерживаемый алгоритм HSM: ${algorithm}`);
      }

      // Генерируем пару ключей в HSM
      const keyPair = this.pkcs11.C_GenerateKeyPair(
        this.session,
        mechanism,
        keyTemplate.publicKeyTemplate,
        keyTemplate.privateKeyTemplate
      );

      // Получаем публичный ключ
      const publicKey = await this.extractPublicKeyFromHSM(keyPair.publicKey);

      // Сохраняем референс на ключ в HSM в Vault для управления
      const metadata: KeyMetadata = {
        currency,
        algorithm,
        purpose,
        description: `HSM ключ для ${currency}`,
        rotationSchedule: purpose === 'master' ? '365d' : '90d'
      };

      await this.vaultManager.storePrivateKey(
        keyId, 
        `hsm:${keyPair.privateKey}`, // Сохраняем HSM handle, а не сам ключ
        metadata
      );

      this.logger.info('Ключ сгенерирован в HSM', {
        keyId,
        algorithm,
        currency,
        purpose,
        hsmHandle: keyPair.privateKey
      });

      return {
        keyId,
        publicKey,
        isHSMKey: true,
        algorithm,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Ошибка генерации ключа в HSM:', error);
      throw error;
    }
  }

  /**
   * Генерация программного ключа и сохранение в Vault
   */
  private async generateKeyInVault(
    keyId: string, 
    algorithm: string, 
    currency: string, 
    purpose: KeyPurpose
  ): Promise<KeyGenerationResult> {
    try {
      let privateKey: string;
      let publicKey: string;

      switch (algorithm) {
        case 'secp256k1':
          ({ privateKey, publicKey } = this.generateSecp256k1Key());
          break;
        case 'ed25519':
          ({ privateKey, publicKey } = this.generateEd25519Key());
          break;
        default:
          throw new Error(`Неподдерживаемый алгоритм: ${algorithm}`);
      }

      // Сохраняем приватный ключ в Vault
      const metadata: KeyMetadata = {
        currency,
        algorithm,
        purpose,
        description: `Программный ключ для ${currency}`,
        rotationSchedule: purpose === 'master' ? '365d' : '90d'
      };

      await this.vaultManager.storePrivateKey(keyId, privateKey, metadata);

      this.logger.info('Ключ сгенерирован и сохранен в Vault', {
        keyId,
        algorithm,
        currency,
        purpose
      });

      return {
        keyId,
        publicKey,
        isHSMKey: false,
        algorithm,
        createdAt: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Ошибка генерации ключа в Vault:', error);
      throw error;
    }
  }

  /**
   * Получение публичного ключа по ID
   */
  public async getPublicKey(keyId: string, currency: string): Promise<string> {
    this.ensureInitialized();

    try {
      // Пытаемся получить метаданные ключа из Vault
      const keys = await this.vaultManager.listKeys(currency);
      const keyInfo = keys.find(k => k.keyId === keyId);
      
      if (!keyInfo) {
        throw new Error(`Ключ ${keyId} не найден`);
      }

      // Если это HSM ключ, получаем публичный ключ из HSM
      if (this.isHSMKey(keyId)) {
        return await this.getPublicKeyFromHSM(keyId);
      } else {
        // Для программных ключей вычисляем публичный ключ из приватного
        const privateKey = await this.vaultManager.retrievePrivateKey(keyId, currency);
        return this.derivePublicKey(privateKey, keyInfo.algorithm);
      }

    } catch (error) {
      this.logger.error('Ошибка получения публичного ключа:', error);
      throw new Error(`Не удалось получить публичный ключ: ${(error as Error).message}`);
    }
  }

  /**
   * Подпись данных с использованием указанного ключа
   */
  public async sign(keyId: string, currency: string, data: Buffer): Promise<string> {
    this.ensureInitialized();

    try {
      if (this.isHSMKey(keyId)) {
        return await this.signWithHSM(keyId, data);
      } else {
        return await this.signWithVaultKey(keyId, currency, data);
      }

    } catch (error) {
      this.logger.error('Ошибка подписи данных:', error);
      throw new Error(`Не удалось подписать данные: ${(error as Error).message}`);
    }
  }

  /**
   * Подпись данных с использованием HSM
   */
  private async signWithHSM(keyId: string, data: Buffer): Promise<string> {
    if (!this.pkcs11 || !this.session) {
      throw new Error('HSM недоступен для подписи');
    }

    try {
      // Извлекаем HSM handle из Vault
      const hsmHandle = await this.getHSMHandle(keyId);
      
      // Инициализируем подпись в HSM
      this.pkcs11.C_SignInit(this.session, { mechanism: CKM_ECDSA_SHA256 }, hsmHandle);
      
      // Выполняем подпись
      const signature = this.pkcs11.C_Sign(this.session, data);
      
      return signature.toString('hex');

    } catch (error) {
      this.logger.error('Ошибка подписи в HSM:', error);
      throw error;
    }
  }

  /**
   * Подпись данных с использованием ключа из Vault
   */
  private async signWithVaultKey(keyId: string, currency: string, data: Buffer): Promise<string> {
    try {
      const privateKey = await this.vaultManager.retrievePrivateKey(keyId, currency);
      const keys = await this.vaultManager.listKeys(currency);
      const keyInfo = keys.find(k => k.keyId === keyId);
      
      if (!keyInfo) {
        throw new Error(`Информация о ключе ${keyId} не найдена`);
      }

      switch (keyInfo.algorithm) {
        case 'secp256k1':
          return this.signSecp256k1(privateKey, data);
        case 'ed25519':
          return this.signEd25519(privateKey, data);
        default:
          throw new Error(`Неподдерживаемый алгоритм для подписи: ${keyInfo.algorithm}`);
      }

    } catch (error) {
      this.logger.error('Ошибка подписи программным ключом:', error);
      throw error;
    }
  }

  /**
   * Ротация ключа
   */
  public async rotateKey(keyId: string, currency: string): Promise<KeyGenerationResult> {
    this.ensureInitialized();

    try {
      // Получаем информацию о текущем ключе
      const keys = await this.vaultManager.listKeys(currency);
      const currentKey = keys.find(k => k.keyId === keyId);
      
      if (!currentKey) {
        throw new Error(`Ключ для ротации не найден: ${keyId}`);
      }

      // Генерируем новый ключ с теми же параметрами
      const newKey = await this.generateKey(
        currentKey.algorithm, 
        currency, 
        currentKey.purpose as KeyPurpose
      );

      // Архивируем старый ключ через Vault
      await this.vaultManager.rotateKey(keyId, currency);

      this.logger.info('Ключ успешно ротирован', {
        oldKeyId: keyId,
        newKeyId: newKey.keyId,
        currency
      });

      return newKey;

    } catch (error) {
      this.logger.error('Ошибка ротации ключа:', error);
      throw new Error(`Не удалось ротировать ключ: ${(error as Error).message}`);
    }
  }

  // Утилитарные методы

  private generateKeyId(currency: string, algorithm: string): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${currency.toLowerCase()}-${algorithm}-${timestamp}-${random}`;
  }

  private shouldUseHSM(purpose: KeyPurpose): boolean {
    return this.config.useRealHSM && 
           process.env.NODE_ENV === 'production' && 
           (purpose === 'master' || purpose === 'signing');
  }

  private isHSMKey(keyId: string): boolean {
    return keyId.includes('hsm') || this.config.useRealHSM;
  }

  private generateSecp256k1Key(): { privateKey: string; publicKey: string } {
    let privateKeyBytes: Buffer;
    do {
      privateKeyBytes = crypto.randomBytes(32);
    } while (!secp256k1.privateKeyVerify(privateKeyBytes));

    const publicKeyBytes = secp256k1.publicKeyCreate(privateKeyBytes, false);
    
    return {
      privateKey: privateKeyBytes.toString('hex'),
      publicKey: publicKeyBytes.toString('hex')
    };
  }

  private generateEd25519Key(): { privateKey: string; publicKey: string } {
    const privateKeyBytes = crypto.randomBytes(32);
    
    // Для Ed25519 используем криптографическую библиотеку
    // В реальной реализации здесь был бы tweetnacl или noble-ed25519
    const publicKeyBytes = crypto.createHash('sha256').update(privateKeyBytes).digest().slice(0, 32);
    
    return {
      privateKey: privateKeyBytes.toString('hex'),
      publicKey: publicKeyBytes.toString('hex')
    };
  }

  private derivePublicKey(privateKey: string, algorithm: string): string {
    switch (algorithm) {
      case 'secp256k1':
        const privKey = Buffer.from(privateKey, 'hex');
        const pubKey = secp256k1.publicKeyCreate(privKey, false);
        return pubKey.toString('hex');
      case 'ed25519':
        // Простая деривация для демонстрации
        return crypto.createHash('sha256').update(Buffer.from(privateKey, 'hex')).digest().toString('hex');
      default:
        throw new Error(`Неподдерживаемый алгоритм: ${algorithm}`);
    }
  }

  private signSecp256k1(privateKey: string, data: Buffer): string {
    const privKeyBuffer = Buffer.from(privateKey, 'hex');
    const signature = secp256k1.ecdsaSign(data, privKeyBuffer);
    return signature.signature.toString('hex');
  }

  private signEd25519(privateKey: string, data: Buffer): string {
    // Упрощенная подпись для демонстрации
    const hmac = crypto.createHmac('sha256', Buffer.from(privateKey, 'hex'));
    hmac.update(data);
    return hmac.digest('hex');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('HSMManager не инициализирован. Вызовите initialize() сначала.');
    }
  }

  // HSM-специфичные методы (заглушки для реализации)

  private getSecp256k1KeyTemplate(keyId: string): any {
    return {
      publicKeyTemplate: [
        { type: 0x00000100, value: true }, // CKA_TOKEN
        { type: 0x00000001, value: true }, // CKA_PRIVATE
        { type: 0x00000081, value: keyId }  // CKA_ID
      ],
      privateKeyTemplate: [
        { type: 0x00000100, value: true }, // CKA_TOKEN
        { type: 0x00000001, value: true }, // CKA_PRIVATE
        { type: 0x00000081, value: keyId }  // CKA_ID
      ]
    };
  }

  private getEd25519KeyTemplate(keyId: string): any {
    // Аналогично secp256k1, но для Ed25519
    return this.getSecp256k1KeyTemplate(keyId);
  }

  private async extractPublicKeyFromHSM(hsmHandle: number): Promise<string> {
    // Заглушка - в реальной реализации извлекаем публичный ключ из HSM
    return '04' + '0'.repeat(126);
  }

  private async getPublicKeyFromHSM(keyId: string): Promise<string> {
    // Заглушка - получение публичного ключа из HSM по ID
    return '04' + '0'.repeat(126);
  }

  private async getHSMHandle(keyId: string): Promise<number> {
    // Заглушка - получение HSM handle по keyId
    return 1;
  }

  /**
   * Закрытие соединений
   */
  public async close(): Promise<void> {
    try {
      // Закрываем HSM соединение
      if (this.session && this.pkcs11) {
        this.pkcs11.C_Logout(this.session);
        this.pkcs11.C_CloseSession(this.session);
        this.pkcs11.C_Finalize();
      }

      // Закрываем Vault соединение
      await this.vaultManager.close();

      this.session = null;
      this.pkcs11 = null;
      this.isInitialized = false;
      
      this.logger.info('HSM Manager соединения закрыты');

    } catch (error) {
      this.logger.error('Ошибка закрытия HSM Manager:', error);
    }
  }
}

// Интерфейсы и типы
export interface HSMConfig {
  useRealHSM: boolean;
  hsmPin?: string;
  vaultEndpoint: string;
  vaultToken: string;
  strictSSL: boolean;
}

export type KeyPurpose = 'master' | 'signing' | 'encryption' | 'backup';

export interface KeyGenerationResult {
  keyId: string;
  publicKey: string;
  isHSMKey: boolean;
  algorithm: string;
  createdAt: string;
}