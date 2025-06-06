# security/vault/policies.hcl
# Vault Policies for Crypto Mixer

# Mixer API Policy - Access to mixer secrets
path "secret/data/mixer/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/mixer/*" {
  capabilities = ["list"]
}

# Database Policy - Access to database credentials
path "database/creds/mixer-db" {
  capabilities = ["read"]
}

path "database/creds/mixer-readonly" {
  capabilities = ["read"]
}

# Transit Policy - Encryption/Decryption
path "transit/encrypt/mixer-keys" {
  capabilities = ["update"]
}

path "transit/decrypt/mixer-keys" {
  capabilities = ["update"]
}

path "transit/datakey/plaintext/mixer-keys" {
  capabilities = ["update"]
}

# PKI Policy - Certificate management
path "pki/issue/mixer-role" {
  capabilities = ["update"]
}

path "pki/cert/ca" {
  capabilities = ["read"]
}

# Blockchain Service Policy
path "secret/data/blockchain/*" {
  capabilities = ["read"]
}

path "secret/metadata/blockchain/*" {
  capabilities = ["list"]
}

path "transit/encrypt/blockchain-keys" {
  capabilities = ["update"]
}

path "transit/decrypt/blockchain-keys" {
  capabilities = ["update"]
}

# Scheduler Service Policy  
path "secret/data/scheduler/*" {
  capabilities = ["read"]
}

path "secret/metadata/scheduler/*" {
  capabilities = ["list"]
}

# Wallet Service Policy
path "secret/data/wallets/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/wallets/*" {
  capabilities = ["list"]
}

path "transit/encrypt/wallet-keys" {
  capabilities = ["update"]
}

path "transit/decrypt/wallet-keys" {
  capabilities = ["update"]
}

# Admin Policy - Full access
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Monitoring Policy - Read-only access for metrics
path "sys/metrics" {
  capabilities = ["read"]
}

path "sys/health" {
  capabilities = ["read"]
}

path "sys/seal-status" {
  capabilities = ["read"]
}

# Service-specific policies
path "auth/token/lookup-self" {
  capabilities = ["read"]
}

path "auth/token/renew-self" {
  capabilities = ["update"]
}

path "auth/token/revoke-self" {
  capabilities = ["update"]
}