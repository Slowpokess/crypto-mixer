const crypto = require('crypto');
const fs = require('fs');

class KeyManager {
    constructor() {
        this.masterKey = process.env.MASTER_KEY;
        if (!this.masterKey) {
            throw new Error('MASTER_KEY environment variable is required');
        }
        // Ensure master key is 32 bytes for AES-256
        this.keyHash = crypto.scryptSync(this.masterKey, 'salt', 32);
    }

    encryptPrivateKey(privateKey) {
        if (!privateKey) {
            throw new Error('Private key is required');
        }

        // Generate a random initialization vector
        const iv = crypto.randomBytes(16);
        
        // Create cipher with explicit IV
        const cipher = crypto.createCipherGCM('aes-256-gcm', this.keyHash, iv);
        
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Get the authentication tag
        const authTag = cipher.getAuthTag();
        
        // Combine IV, auth tag, and encrypted data
        return {
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            encryptedData: encrypted
        };
    }

    decryptPrivateKey(encryptedData) {
        if (!encryptedData || !encryptedData.iv || !encryptedData.authTag || !encryptedData.encryptedData) {
            throw new Error('Invalid encrypted data format');
        }

        try {
            // Extract components
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');
            
            // Create decipher
            const decipher = crypto.createDecipherGCM('aes-256-gcm', this.keyHash, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Failed to decrypt private key: ' + error.message);
        }
    }

    // Utility method to generate secure random keys
    generateSecureKey(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Method to hash data securely
    hashData(data, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(16);
        } else if (typeof salt === 'string') {
            salt = Buffer.from(salt, 'hex');
        }
        
        const hash = crypto.scryptSync(data, salt, 32);
        return {
            salt: salt.toString('hex'),
            hash: hash.toString('hex')
        };
    }

    // Method to verify hashed data
    verifyHash(data, salt, expectedHash) {
        const saltBuffer = Buffer.from(salt, 'hex');
        const hash = crypto.scryptSync(data, saltBuffer, 32);
        return crypto.timingSafeEqual(hash, Buffer.from(expectedHash, 'hex'));
    }

    // Method to encrypt data with additional authenticated data (AAD)
    encryptWithAAD(data, aad = '') {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipherGCM('aes-256-gcm', this.keyHash, iv);
        
        if (aad) {
            cipher.setAAD(Buffer.from(aad, 'utf8'));
        }
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            encryptedData: encrypted,
            aad: aad
        };
    }

    // Method to decrypt data with additional authenticated data (AAD)
    decryptWithAAD(encryptedData) {
        if (!encryptedData || !encryptedData.iv || !encryptedData.authTag || !encryptedData.encryptedData) {
            throw new Error('Invalid encrypted data format');
        }

        try {
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');
            
            const decipher = crypto.createDecipherGCM('aes-256-gcm', this.keyHash, iv);
            
            if (encryptedData.aad) {
                decipher.setAAD(Buffer.from(encryptedData.aad, 'utf8'));
            }
            
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Failed to decrypt data: ' + error.message);
        }
    }
}

module.exports = KeyManager;