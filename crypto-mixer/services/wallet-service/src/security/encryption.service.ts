import * as crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

export class EncryptionService {
  private masterKey: Buffer;
  private algorithm = 'aes-256-gcm';

  constructor() {
    const key = process.env.MASTER_KEY;
    if (!key) {
      throw new Error('MASTER_KEY not set');
    }

    this.masterKey = Buffer.from(key, 'base64');
  }

  public async encrypt(plaintext: string): Promise<string> {
    const salt = crypto.randomBytes(32);
    const key = await this.deriveKey(salt);
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine salt, iv, authTag, and encrypted data
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    return combined.toString('base64');
  }

  public async decrypt(encryptedData: string): Promise<string> {
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = combined.slice(0, 32);
    const iv = combined.slice(32, 48);
    const authTag = combined.slice(48, 64);
    const encrypted = combined.slice(64);

    const key = await this.deriveKey(salt);

    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private async deriveKey(salt: Buffer): Promise<Buffer> {
    return (await scrypt(this.masterKey, salt, 32)) as Buffer;
  }
}