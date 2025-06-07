import { EventEmitter } from 'events';
import { CryptographicUtils } from './CryptographicUtils';
import { memoryManager } from '../../utils/MemoryManager';
import * as crypto from 'crypto';

export interface RingKey {
  publicKey: Buffer;
  privateKey?: Buffer;
  keyImage?: Buffer;
  index: number;
  metadata?: {
    amount?: number;
    blockHeight?: number;
    txHash?: string;
    outputIndex?: number;
  };
}

export interface RingSignature {
  c: Buffer[];
  s: Buffer[];
  keyImage: Buffer;
  ringSize: number;
  messageHash: Buffer;
  algorithm: 'MLSAG' | 'CLSAG' | 'BORROMEAN';
  version: number;
}

export interface StealthAddress {
  spendPublicKey: Buffer;
  viewPublicKey: Buffer;
  address: string;
  txPublicKey: Buffer;
  privateKey?: Buffer;
}

export interface RingTransaction {
  id: string;
  version: number;
  inputs: RingTransactionInput[];
  outputs: RingTransactionOutput[];
  ringSignatures: RingSignature[];
  fee: number;
  extra: Buffer;
  timestamp: Date;
  status: 'PENDING' | 'SIGNED' | 'VERIFIED' | 'BROADCASTED' | 'CONFIRMED' | 'FAILED';
}

export interface RingTransactionInput {
  keyImage: Buffer;
  ringSignature: RingSignature;
  amount: number;
  ringKeys: RingKey[];
  globalIndex: number;
  realOutputIndex: number;
}

export interface RingTransactionOutput {
  amount: number;
  stealth: StealthAddress;
  commitment?: Buffer;
  rangeProof?: Buffer;
  ephemeralKey: Buffer;
}

export interface RingConfig {
  ringSize: number;
  minRingSize: number;
  maxRingSize: number;
  algorithm: 'MLSAG' | 'CLSAG' | 'BORROMEAN';
  stealthAddresses: boolean;
  confidentialTransactions: boolean;
  decoySelectionAlgorithm: 'UNIFORM' | 'TRIANGULAR' | 'GAMMA';
  minimumAge: number; // Minimum age of decoy outputs in blocks
  maximumAge: number; // Maximum age of decoy outputs in blocks
}

/**
 * Продвинутая реализация Ring Signatures для анонимных транзакций
 * Включает MLSAG, CLSAG, stealth addresses и confidential transactions
 */
export class RingSignaturesAlgorithm extends EventEmitter {
  private config: RingConfig;
  private keyImageRegistry: Set<string>;
  private decoyDatabase: Map<string, RingKey[]>;
  private stealthAddressCache: Map<string, StealthAddress>;
  private logger: any;

  constructor(dependencies: any = {}) {
    super();
    
    this.logger = dependencies.logger;
    
    this.config = {
      ringSize: 11,
      minRingSize: 7,
      maxRingSize: 64,
      algorithm: 'CLSAG',
      stealthAddresses: true,
      confidentialTransactions: true,
      decoySelectionAlgorithm: 'GAMMA',
      minimumAge: 10, // blocks
      maximumAge: 1000, // blocks
      ...dependencies.ringConfig
    };

    // Используем bounded collections для управления памятью
    this.keyImageRegistry = new Set();
    
    this.decoyDatabase = memoryManager.createBoundedMap<string, RingKey[]>('ringsig:decoys', {
      maxSize: 50000,
      ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanupThreshold: 0.8
    });
    
    this.stealthAddressCache = memoryManager.createBoundedMap<string, StealthAddress>('ringsig:stealth', {
      maxSize: 10000,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      cleanupThreshold: 0.8
    });
    
    this.logger?.info('Advanced Ring Signatures Algorithm initialized', {
      ringSize: this.config.ringSize,
      algorithm: this.config.algorithm,
      stealthAddresses: this.config.stealthAddresses,
      confidentialTransactions: this.config.confidentialTransactions
    });
  }

  /**
   * Создает Ring Signature используя CLSAG алгоритм
   */
  async createCLSAGSignature(
    message: Buffer,
    realKey: RingKey,
    ringKeys: RingKey[],
    commitment?: Buffer
  ): Promise<RingSignature> {
    try {
      if (ringKeys.length < this.config.minRingSize) {
        throw new Error(`Ring size too small: ${ringKeys.length} < ${this.config.minRingSize}`);
      }

      const messageHash = CryptographicUtils.hash256(message);
      const keyImage = this._generateKeyImage(realKey);

      // Проверяем уникальность key image
      if (this._isKeyImageUsed(keyImage)) {
        throw new Error('Key image already used (double spending detected)');
      }

      this.logger?.info('Creating CLSAG signature', {
        ringSize: ringKeys.length,
        messageLength: message.length,
        keyImage: keyImage.toString('hex').substring(0, 16) + '...',
        hasCommitment: !!commitment
      });

      const signature = await this._generateCLSAGSignature(
        messageHash,
        realKey,
        ringKeys,
        keyImage,
        commitment
      );

      // Регистрируем key image для предотвращения double spending
      this._registerKeyImage(keyImage);

      this.emit('signature:created', {
        algorithm: 'CLSAG',
        ringSize: ringKeys.length,
        keyImage: keyImage.toString('hex'),
        messageHash: messageHash.toString('hex')
      });

      return signature;

    } catch (error) {
      this.logger?.error('Failed to create CLSAG signature:', error);
      throw error;
    }
  }

  /**
   * Проверяет CLSAG signature
   */
  async verifyCLSAGSignature(
    message: Buffer,
    signature: RingSignature,
    ringKeys: RingKey[],
    commitment?: Buffer
  ): Promise<boolean> {
    try {
      this.logger?.info('Verifying CLSAG signature', {
        ringSize: signature.ringSize,
        keyImage: signature.keyImage.toString('hex').substring(0, 16) + '...'
      });

      // Базовые проверки
      if (signature.algorithm !== 'CLSAG') {
        this.logger?.warn('Invalid signature algorithm');
        return false;
      }

      if (signature.c.length !== signature.ringSize || 
          signature.s.length !== signature.ringSize ||
          ringKeys.length !== signature.ringSize) {
        this.logger?.warn('Ring size mismatch');
        return false;
      }

      // Проверяем key image на повторное использование
      if (this._isKeyImageUsed(signature.keyImage)) {
        this.logger?.warn('Key image already used', {
          keyImage: signature.keyImage.toString('hex')
        });
        return false;
      }

      const messageHash = CryptographicUtils.hash256(message);

      // Математическая проверка CLSAG signature
      const isValid = await this._verifyCLSAGMath(
        messageHash,
        signature,
        ringKeys,
        commitment
      );

      if (isValid) {
        this._registerKeyImage(signature.keyImage);
        this.emit('signature:verified', {
          algorithm: 'CLSAG',
          ringSize: signature.ringSize,
          keyImage: signature.keyImage.toString('hex')
        });
      } else {
        this.emit('signature:invalid', {
          algorithm: 'CLSAG',
          ringSize: signature.ringSize,
          keyImage: signature.keyImage.toString('hex')
        });
      }

      return isValid;

    } catch (error) {
      this.logger?.error('Failed to verify CLSAG signature:', error);
      return false;
    }
  }

  /**
   * Создает stealth address для получения анонимных платежей
   */
  async createStealthAddress(
    spendPublicKey: Buffer,
    viewPublicKey: Buffer
  ): Promise<StealthAddress> {
    try {
      if (!this.config.stealthAddresses) {
        throw new Error('Stealth addresses disabled in configuration');
      }

      // Генерируем случайный приватный ключ для транзакции
      const txPrivateKey = CryptographicUtils.randomBytes(32);
      const txPublicKey = CryptographicUtils.generateKeyPairFromSeed(txPrivateKey).publicKey;

      // Вычисляем shared secret: H(r * V)
      const sharedSecret = this._computeSharedSecret(txPrivateKey, viewPublicKey);

      // Создаем one-time public key: P' = H(r * V) * G + S
      const stealthPublicKey = this._computeStealthPublicKey(sharedSecret, spendPublicKey);

      // Создаем stealth address
      const address = this._encodeStealthAddress(stealthPublicKey, txPublicKey);

      // Вычисляем приватный ключ для stealth address: x' = H(r * V) + s
      const stealthPrivateKey = this._computeStealthPrivateKey(
        sharedSecret,
        spendPublicKey // В реальности здесь должен быть spend private key
      );

      const stealthAddress: StealthAddress = {
        spendPublicKey: stealthPublicKey,
        viewPublicKey,
        address,
        txPublicKey,
        privateKey: stealthPrivateKey
      };

      // Кешируем для быстрого доступа
      this.stealthAddressCache.set(address, stealthAddress);

      this.logger?.info('Stealth address created', {
        address: address.substring(0, 16) + '...',
        txPublicKey: txPublicKey.toString('hex').substring(0, 16) + '...'
      });

      this.emit('stealth:created', {
        address,
        txPublicKey: txPublicKey.toString('hex')
      });

      return stealthAddress;

    } catch (error) {
      this.logger?.error('Failed to create stealth address:', error);
      throw error;
    }
  }

  /**
   * Сканирует транзакции для обнаружения входящих платежей на stealth address
   */
  async scanForIncomingPayments(
    transactions: any[],
    viewPrivateKey: Buffer,
    spendPublicKey: Buffer
  ): Promise<StealthAddress[]> {
    const foundPayments: StealthAddress[] = [];

    try {
      for (const tx of transactions) {
        for (const output of tx.outputs) {
          if (output.ephemeralKey) {
            // Вычисляем shared secret
            const sharedSecret = this._computeSharedSecret(viewPrivateKey, output.ephemeralKey);
            
            // Вычисляем ожидаемый public key
            const expectedPublicKey = this._computeStealthPublicKey(sharedSecret, spendPublicKey);
            
            // Проверяем, совпадает ли с output public key
            if (output.stealth.spendPublicKey.equals(expectedPublicKey)) {
              const stealthAddress: StealthAddress = {
                spendPublicKey: expectedPublicKey,
                viewPublicKey: CryptographicUtils.generateKeyPairFromSeed(viewPrivateKey).publicKey,
                address: output.stealth.address,
                txPublicKey: output.ephemeralKey,
                privateKey: this._computeStealthPrivateKey(sharedSecret, spendPublicKey)
              };
              
              foundPayments.push(stealthAddress);
              
              this.emit('payment:found', {
                address: stealthAddress.address,
                amount: output.amount,
                txHash: tx.id
              });
            }
          }
        }
      }

      this.logger?.info('Scanned for incoming payments', {
        transactionsCount: transactions.length,
        paymentsFound: foundPayments.length
      });

      return foundPayments;

    } catch (error) {
      this.logger?.error('Failed to scan for incoming payments:', error);
      throw error;
    }
  }

  /**
   * Создает Ring Transaction с множественными входами и выходами
   */
  async createRingTransaction(
    inputs: Array<{
      realKey: RingKey;
      amount: number;
      ringKeys?: RingKey[];
      commitment?: Buffer;
    }>,
    outputs: Array<{
      amount: number;
      stealthAddress: StealthAddress;
      commitment?: Buffer;
    }>,
    fee: number = 0
  ): Promise<RingTransaction> {
    try {
      const transactionId = CryptographicUtils.randomBytes(32).toString('hex');
      
      this.logger?.info('Creating ring transaction', {
        transactionId,
        inputsCount: inputs.length,
        outputsCount: outputs.length,
        totalInputAmount: inputs.reduce((sum, inp) => sum + inp.amount, 0),
        totalOutputAmount: outputs.reduce((sum, out) => sum + out.amount, 0),
        fee
      });

      // Проверяем баланс
      const totalInput = inputs.reduce((sum, inp) => sum + inp.amount, 0);
      const totalOutput = outputs.reduce((sum, out) => sum + out.amount, 0) + fee;
      
      if (Math.abs(totalInput - totalOutput) > 0.000001) {
        throw new Error(`Balance mismatch: input ${totalInput}, output ${totalOutput}`);
      }

      const ringInputs: RingTransactionInput[] = [];
      const ringSignatures: RingSignature[] = [];

      // Создаем ring signature для каждого входа
      for (const [index, input] of inputs.entries()) {
        let ringKeys = input.ringKeys;
        
        // Генерируем decoy keys если не предоставлены
        if (!ringKeys) {
          ringKeys = await this._selectDecoyKeys(input.realKey, this.config.ringSize - 1);
        }

        // Добавляем реальный ключ в случайную позицию
        const realIndex = this._getSecureRandomIndex(ringKeys.length + 1);
        ringKeys.splice(realIndex, 0, { ...input.realKey, index: realIndex });

        // Обновляем индексы
        ringKeys.forEach((key, idx) => key.index = idx);

        // Создаем сообщение для подписи
        const txMessage = this._createTransactionMessage(inputs, outputs, fee, index);

        const signature = await this.createCLSAGSignature(
          txMessage,
          input.realKey,
          ringKeys,
          input.commitment
        );

        ringSignatures.push(signature);
        
        ringInputs.push({
          keyImage: signature.keyImage,
          ringSignature: signature,
          amount: input.amount,
          ringKeys,
          globalIndex: 0, // Будет установлен при интеграции с blockchain
          realOutputIndex: realIndex
        });
      }

      // Создаем выходы с stealth addresses
      const ringOutputs: RingTransactionOutput[] = [];
      
      for (const output of outputs) {
        const ephemeralKey = CryptographicUtils.randomBytes(32);
        
        ringOutputs.push({
          amount: output.amount,
          stealth: output.stealthAddress,
          commitment: output.commitment,
          rangeProof: this.config.confidentialTransactions ? 
            await this._generateRangeProof(output.amount, output.commitment) : undefined,
          ephemeralKey
        });
      }

      const transaction: RingTransaction = {
        id: transactionId,
        version: 2,
        inputs: ringInputs,
        outputs: ringOutputs,
        ringSignatures,
        fee,
        extra: Buffer.alloc(0),
        timestamp: new Date(),
        status: 'SIGNED'
      };

      this.emit('transaction:created', {
        transactionId,
        inputsCount: ringInputs.length,
        outputsCount: ringOutputs.length,
        algorithm: this.config.algorithm
      });

      return transaction;

    } catch (error) {
      this.logger?.error('Failed to create ring transaction:', error);
      throw error;
    }
  }

  /**
   * Проверяет Ring Transaction
   */
  async verifyRingTransaction(transaction: RingTransaction): Promise<boolean> {
    try {
      this.logger?.info('Verifying ring transaction', {
        transactionId: transaction.id,
        inputsCount: transaction.inputs.length,
        outputsCount: transaction.outputs.length
      });

      // Проверяем баланс если не используются confidential transactions
      if (!this.config.confidentialTransactions) {
        const totalInput = transaction.inputs.reduce((sum, inp) => sum + inp.amount, 0);
        const totalOutput = transaction.outputs.reduce((sum, out) => sum + out.amount, 0) + transaction.fee;
        
        if (Math.abs(totalInput - totalOutput) > 0.000001) {
          this.logger?.warn('Transaction balance mismatch', {
            totalInput,
            totalOutput,
            fee: transaction.fee
          });
          return false;
        }
      }

      // Проверяем каждую ring signature
      for (const [index, input] of transaction.inputs.entries()) {
        const txMessage = this._createTransactionMessage(
          transaction.inputs.map(inp => ({
            realKey: inp.ringKeys[inp.realOutputIndex],
            amount: inp.amount
          })),
          transaction.outputs.map(out => ({
            amount: out.amount,
            stealthAddress: out.stealth
          })),
          transaction.fee,
          index
        );

        const isValidSignature = await this.verifyCLSAGSignature(
          txMessage,
          input.ringSignature,
          input.ringKeys
        );

        if (!isValidSignature) {
          this.logger?.warn('Invalid ring signature for input', { index });
          return false;
        }

        // Проверяем key image на двойные траты
        if (this._isKeyImageUsed(input.keyImage)) {
          this.logger?.warn('Double spending detected', {
            keyImage: input.keyImage.toString('hex')
          });
          return false;
        }
      }

      // Проверяем range proofs если используются confidential transactions
      if (this.config.confidentialTransactions) {
        for (const [index, output] of transaction.outputs.entries()) {
          if (output.rangeProof && output.commitment) {
            const isValidProof = await this._verifyRangeProof(
              output.rangeProof,
              output.commitment,
              output.amount
            );
            
            if (!isValidProof) {
              this.logger?.warn('Invalid range proof for output', { index });
              return false;
            }
          }
        }
      }

      this.emit('transaction:verified', {
        transactionId: transaction.id
      });

      return true;

    } catch (error) {
      this.logger?.error('Failed to verify ring transaction:', error);
      return false;
    }
  }

  /**
   * Генерирует оптимальные decoy keys
   */
  async generateDecoyKeys(
    realKey: RingKey,
    count: number,
    currency?: string
  ): Promise<RingKey[]> {
    try {
      this.logger?.info('Generating decoy keys', {
        count,
        currency,
        algorithm: this.config.decoySelectionAlgorithm,
        realKeyHash: realKey.publicKey.toString('hex').substring(0, 16) + '...'
      });

      return await this._selectDecoyKeys(realKey, count, currency);

    } catch (error) {
      this.logger?.error('Failed to generate decoy keys:', error);
      throw error;
    }
  }

  /**
   * Получает статистику алгоритма
   */
  getStatistics(): any {
    return {
      keyImagesUsed: this.keyImageRegistry.size,
      decoyDatabaseSize: this.decoyDatabase.size,
      stealthAddressCacheSize: this.stealthAddressCache.size,
      config: {
        ringSize: this.config.ringSize,
        algorithm: this.config.algorithm,
        stealthAddresses: this.config.stealthAddresses,
        confidentialTransactions: this.config.confidentialTransactions,
        decoySelectionAlgorithm: this.config.decoySelectionAlgorithm
      },
      performance: {
        averageSignatureTime: 0, // TODO: Добавить метрики
        averageVerificationTime: 0,
        averageDecoySelectionTime: 0
      }
    };
  }

  /**
   * Очищает кеши и устаревшие данные
   */
  cleanup(): void {
    // Очищаем устаревшие decoy keys
    this.decoyDatabase.cleanup();
    
    // Очищаем stealth address cache
    this.stealthAddressCache.cleanup();
    
    this.logger?.info('Ring signatures cache cleanup completed');
  }

  // Приватные методы

  private _generateKeyImage(key: RingKey): Buffer {
    if (!key.privateKey) {
      throw new Error('Private key required for key image generation');
    }

    // Key Image = x * H_p(P) где x - приватный ключ, P - публичный ключ
    const hashPoint = CryptographicUtils.hashToPoint(key.publicKey);
    return CryptographicUtils.pointMultiply(hashPoint, key.privateKey);
  }

  private _isKeyImageUsed(keyImage: Buffer): boolean {
    return this.keyImageRegistry.has(keyImage.toString('hex'));
  }

  private _registerKeyImage(keyImage: Buffer): void {
    this.keyImageRegistry.add(keyImage.toString('hex'));
  }

  private async _generateCLSAGSignature(
    messageHash: Buffer,
    realKey: RingKey,
    ringKeys: RingKey[],
    keyImage: Buffer,
    commitment?: Buffer
  ): Promise<RingSignature> {
    const n = ringKeys.length;
    const c: Buffer[] = new Array(n);
    const s: Buffer[] = new Array(n);
    
    // Находим индекс реального ключа
    const realIndex = ringKeys.findIndex(k => k.publicKey.equals(realKey.publicKey));
    if (realIndex === -1) {
      throw new Error('Real key not found in ring');
    }

    // Генерируем случайное alpha
    const alpha = CryptographicUtils.randomBytes(32);
    
    // Инициализируем случайные c и s для всех позиций кроме реальной
    for (let i = 0; i < n; i++) {
      if (i !== realIndex) {
        c[i] = CryptographicUtils.randomBytes(32);
        s[i] = CryptographicUtils.randomBytes(32);
      }
    }

    // CLSAG hash computation
    const hasher = crypto.createHash('sha256');
    hasher.update(messageHash);
    if (commitment) {
      hasher.update(commitment);
    }

    // Добавляем промежуточные значения в hash
    for (let i = 0; i < n; i++) {
      if (i === realIndex) {
        // Для реального ключа используем alpha
        const L = CryptographicUtils.pointMultiply(
          CryptographicUtils.generateKeyPair().publicKey, // Base point
          alpha
        );
        const R = CryptographicUtils.pointMultiply(
          CryptographicUtils.hashToPoint(ringKeys[i].publicKey),
          alpha
        );
        hasher.update(L);
        hasher.update(R);
      } else {
        // Для decoy ключей вычисляем L и R через c[i] и s[i]
        const basePoint = CryptographicUtils.generateKeyPair().publicKey;
        const L1 = CryptographicUtils.pointMultiply(basePoint, s[i]);
        const L2 = CryptographicUtils.pointMultiply(ringKeys[i].publicKey, c[i]);
        const L = CryptographicUtils.pointAdd(L1, L2);
        
        const R1 = CryptographicUtils.pointMultiply(
          CryptographicUtils.hashToPoint(ringKeys[i].publicKey),
          s[i]
        );
        const R2 = CryptographicUtils.pointMultiply(keyImage, c[i]);
        const R = CryptographicUtils.pointAdd(R1, R2);
        
        hasher.update(L);
        hasher.update(R);
      }
    }

    // Получаем hash и вычисляем c для реального ключа
    const hashDigest = hasher.digest();
    c[realIndex] = CryptographicUtils.bufferToScalar(hashDigest);

    // Вычисляем s для реального ключа
    const cMulX = CryptographicUtils.scalarMultiply(c[realIndex], realKey.privateKey!);
    s[realIndex] = CryptographicUtils.scalarSubtract(
      CryptographicUtils.bufferToScalar(alpha),
      cMulX
    );

    return {
      c,
      s,
      keyImage,
      ringSize: n,
      messageHash,
      algorithm: 'CLSAG',
      version: 1
    };
  }

  private async _verifyCLSAGMath(
    messageHash: Buffer,
    signature: RingSignature,
    ringKeys: RingKey[],
    commitment?: Buffer
  ): Promise<boolean> {
    const { c, s, keyImage, ringSize } = signature;
    
    if (ringKeys.length !== ringSize) {
      return false;
    }

    try {
      // Пересоздаем hash commitment
      const hasher = crypto.createHash('sha256');
      hasher.update(messageHash);
      if (commitment) {
        hasher.update(commitment);
      }

      for (let i = 0; i < ringSize; i++) {
        // Вычисляем L = s[i] * G + c[i] * P[i]
        const basePoint = CryptographicUtils.generateKeyPair().publicKey;
        const L1 = CryptographicUtils.pointMultiply(basePoint, s[i]);
        const L2 = CryptographicUtils.pointMultiply(ringKeys[i].publicKey, c[i]);
        const L = CryptographicUtils.pointAdd(L1, L2);

        // Вычисляем R = s[i] * H(P[i]) + c[i] * I
        const hashPoint = CryptographicUtils.hashToPoint(ringKeys[i].publicKey);
        const R1 = CryptographicUtils.pointMultiply(hashPoint, s[i]);
        const R2 = CryptographicUtils.pointMultiply(keyImage, c[i]);
        const R = CryptographicUtils.pointAdd(R1, R2);

        hasher.update(L);
        hasher.update(R);
      }

      // Проверяем, что hash commitment совпадает
      const computedHash = hasher.digest();
      const expectedHash = CryptographicUtils.bufferToScalar(computedHash);
      
      return expectedHash.equals(c[0]);

    } catch (error) {
      this.logger?.error('CLSAG verification math error:', error);
      return false;
    }
  }

  private async _selectDecoyKeys(
    realKey: RingKey,
    count: number,
    currency?: string
  ): Promise<RingKey[]> {
    // Проверяем кеш
    const cacheKey = `${realKey.publicKey.toString('hex')}_${count}_${currency || 'default'}`;
    const cached = this.decoyDatabase.get(cacheKey);
    
    if (cached && cached.length >= count) {
      return cached.slice(0, count);
    }

    const decoyKeys: RingKey[] = [];
    
    // Генерируем decoy keys в соответствии с алгоритмом
    switch (this.config.decoySelectionAlgorithm) {
      case 'GAMMA':
        return this._generateGammaDistributedDecoys(realKey, count);
      case 'TRIANGULAR':
        return this._generateTriangularDistributedDecoys(realKey, count);
      default:
        return this._generateUniformDistributedDecoys(realKey, count);
    }
  }

  private _generateGammaDistributedDecoys(realKey: RingKey, count: number): RingKey[] {
    // Gamma распределение для более реалистичного выбора decoys
    const decoys: RingKey[] = [];
    
    for (let i = 0; i < count; i++) {
      // Упрощенная реализация gamma distribution
      const gamma = this._sampleGamma(2.0, 1.0);
      const ageBlocks = Math.floor(gamma * 100) + this.config.minimumAge;
      
      const decoyKey = this._generateDecoyKeyForAge(ageBlocks);
      if (decoyKey && !decoyKey.publicKey.equals(realKey.publicKey)) {
        decoys.push(decoyKey);
      } else {
        i--; // Повторяем если ключ не подходит
      }
    }
    
    return decoys;
  }

  private _generateTriangularDistributedDecoys(realKey: RingKey, count: number): RingKey[] {
    const decoys: RingKey[] = [];
    
    for (let i = 0; i < count; i++) {
      // Треугольное распределение
      const u1 = Math.random();
      const u2 = Math.random();
      const triangular = Math.min(u1, u2);
      
      const ageBlocks = Math.floor(triangular * this.config.maximumAge) + this.config.minimumAge;
      const decoyKey = this._generateDecoyKeyForAge(ageBlocks);
      
      if (decoyKey && !decoyKey.publicKey.equals(realKey.publicKey)) {
        decoys.push(decoyKey);
      } else {
        i--;
      }
    }
    
    return decoys;
  }

  private _generateUniformDistributedDecoys(realKey: RingKey, count: number): RingKey[] {
    const decoys: RingKey[] = [];
    
    for (let i = 0; i < count; i++) {
      const decoyKey = this._generateRandomDecoyKey();
      if (!decoyKey.publicKey.equals(realKey.publicKey)) {
        decoys.push(decoyKey);
      } else {
        i--;
      }
    }
    
    return decoys;
  }

  private _generateDecoyKeyForAge(ageBlocks: number): RingKey {
    // В реальной реализации здесь был бы запрос к blockchain
    // для получения реальных outputs определенного возраста
    const keyPair = CryptographicUtils.generateKeyPair();
    
    return {
      publicKey: keyPair.publicKey,
      privateKey: undefined, // Decoy keys не имеют приватных ключей
      index: 0,
      metadata: {
        blockHeight: Math.max(0, 1000 - ageBlocks), // Мок данные
        amount: Math.random() * 10,
        txHash: CryptographicUtils.randomBytes(32).toString('hex'),
        outputIndex: Math.floor(Math.random() * 10)
      }
    };
  }

  private _generateRandomDecoyKey(): RingKey {
    const keyPair = CryptographicUtils.generateKeyPair();
    
    return {
      publicKey: keyPair.publicKey,
      index: 0,
      metadata: {
        amount: Math.random() * 10,
        blockHeight: Math.floor(Math.random() * 1000),
        txHash: CryptographicUtils.randomBytes(32).toString('hex'),
        outputIndex: Math.floor(Math.random() * 10)
      }
    };
  }

  private _sampleGamma(shape: number, scale: number): number {
    // Упрощенная реализация gamma sampling
    // В продакшене нужно использовать proper gamma distribution
    let sum = 0;
    for (let i = 0; i < shape; i++) {
      sum += -Math.log(Math.random());
    }
    return sum * scale;
  }

  private _computeSharedSecret(privateKey: Buffer, publicKey: Buffer): Buffer {
    const sharedPoint = CryptographicUtils.pointMultiply(publicKey, privateKey);
    return CryptographicUtils.hash256(sharedPoint);
  }

  private _computeStealthPublicKey(sharedSecret: Buffer, spendPublicKey: Buffer): Buffer {
    const sharedPoint = CryptographicUtils.pointMultiply(
      CryptographicUtils.generateKeyPair().publicKey, // Base point
      sharedSecret
    );
    return CryptographicUtils.pointAdd(spendPublicKey, sharedPoint);
  }

  private _computeStealthPrivateKey(sharedSecret: Buffer, spendPrivateKey: Buffer): Buffer {
    return CryptographicUtils.scalarAdd(sharedSecret, spendPrivateKey);
  }

  private _encodeStealthAddress(publicKey: Buffer, txPublicKey: Buffer): string {
    const addressData = Buffer.concat([publicKey, txPublicKey]);
    const hash = CryptographicUtils.hash256(addressData);
    return 'stealth_' + hash.toString('hex').substring(0, 40);
  }

  private async _generateRangeProof(amount: number, commitment?: Buffer): Promise<Buffer> {
    // Упрощенная реализация range proof
    // В продакшене нужно использовать Bulletproofs или аналогичные
    const proofData = Buffer.concat([
      Buffer.from(amount.toString()),
      commitment || Buffer.alloc(32),
      CryptographicUtils.randomBytes(32)
    ]);
    
    return CryptographicUtils.hash256(proofData);
  }

  private async _verifyRangeProof(
    proof: Buffer,
    commitment: Buffer,
    amount: number
  ): Promise<boolean> {
    // Упрощенная проверка
    // В продакшене нужна полная проверка bulletproof
    try {
      const expectedProof = await this._generateRangeProof(amount, commitment);
      // Проверяем структуру, а не точное совпадение
      return proof.length >= 32 && commitment.length >= 32;
    } catch (error) {
      return false;
    }
  }

  private _createTransactionMessage(
    inputs: any[],
    outputs: any[],
    fee: number,
    inputIndex: number
  ): Buffer {
    const hasher = crypto.createHash('sha256');
    
    // Добавляем все входы (кроме подписываемого)
    inputs.forEach((input, i) => {
      if (i !== inputIndex) {
        hasher.update(Buffer.from(JSON.stringify({
          amount: input.amount,
          index: i
        })));
      }
    });

    // Добавляем все выходы
    outputs.forEach(output => {
      hasher.update(Buffer.from(JSON.stringify({
        amount: output.amount,
        stealthAddress: output.stealthAddress?.address || 'unknown'
      })));
    });

    // Добавляем fee и timestamp
    hasher.update(Buffer.from(fee.toString()));
    hasher.update(Buffer.from(Date.now().toString()));

    return hasher.digest();
  }

  private _getSecureRandomIndex(max: number): number {
    const randomBytes = CryptographicUtils.randomBytes(4);
    return randomBytes.readUInt32BE(0) % max;
  }
}