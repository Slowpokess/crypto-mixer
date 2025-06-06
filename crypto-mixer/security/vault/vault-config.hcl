ui = true
cluster_name = "crypto-mixer-vault"

storage "postgresql" {
  connection_url = "postgres://vault:${VAULT_DB_PASSWORD}@postgres:5432/vault?sslmode=disable"
  table         = "vault_kv_store"
  max_parallel  = 128
}

listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_cert_file = "/vault/certs/vault.crt"
  tls_key_file  = "/vault/certs/vault.key"
  tls_min_version = "tls12"
}

api_addr = "https://vault:8200"
cluster_addr = "https://vault:8201"

# Seal configuration
seal "aes256-gcm96" {
  key = "${VAULT_SEAL_KEY}"
}

# Enable Prometheus metrics
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = true
}

# Plugin directory
plugin_directory = "/vault/plugins"

# Log level
log_level = "Info"

# PID file
pid_file = "/vault/logs/vault.pid"