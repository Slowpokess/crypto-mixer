# security/vault/config.hcl
# HashiCorp Vault Configuration for Crypto Mixer

storage "postgresql" {
  connection_url = "postgres://vault_user:vault_password@postgres:5432/vault_db?sslmode=require"
  table         = "vault_kv_store"
  max_parallel  = 128
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/vault/config/ssl/vault.crt"
  tls_key_file  = "/vault/config/ssl/vault.key"
  tls_min_version = "tls12"
  tls_cipher_suites = "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256"
}

# High Availability mode
ha_storage "postgresql" {
  connection_url = "postgres://vault_user:vault_password@postgres:5432/vault_db?sslmode=require"
  table         = "vault_ha_locks"
  max_parallel  = 128
}

seal "awskms" {
  region     = "us-west-2"
  kms_key_id = "vault-unseal-key"
}

# Disable mlock for containerized environments
disable_mlock = true

# API address
api_addr = "https://vault:8200"

# Cluster address
cluster_addr = "https://vault:8201"

# UI
ui = true

# Logging
log_level = "Info"
log_format = "json"

# Telemetry
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = true
}

# Maximum request duration
max_request_duration = "90s"

# Default lease TTL
default_lease_ttl = "768h"

# Maximum lease TTL
max_lease_ttl = "8760h"

# Plugin directory
plugin_directory = "/vault/plugins"

# Entropy augmentation
entropy "seal" {
  mode = "augmentation"
}