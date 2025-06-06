#!/bin/bash
# security/vault/init.sh
# Vault Initialization Script for Crypto Mixer

set -e

echo "🔐 Initializing HashiCorp Vault for Crypto Mixer..."

# Wait for Vault to be ready
echo "⏳ Waiting for Vault to be ready..."
timeout=60
count=0

while ! vault status > /dev/null 2>&1; do
    if [ $count -ge $timeout ]; then
        echo "❌ Timeout waiting for Vault to be ready"
        exit 1
    fi
    sleep 1
    ((count++))
done

echo "✅ Vault is ready"

# Check if Vault is already initialized
if vault status | grep -q "Initialized.*true"; then
    echo "ℹ️  Vault is already initialized"
    exit 0
fi

# Initialize Vault
echo "🔧 Initializing Vault..."
vault operator init \
    -key-shares=5 \
    -key-threshold=3 \
    -format=json > /tmp/vault-init.json

echo "✅ Vault initialized successfully"

# Extract unseal keys and root token
UNSEAL_KEY_1=$(cat /tmp/vault-init.json | jq -r '.unseal_keys_b64[0]')
UNSEAL_KEY_2=$(cat /tmp/vault-init.json | jq -r '.unseal_keys_b64[1]')
UNSEAL_KEY_3=$(cat /tmp/vault-init.json | jq -r '.unseal_keys_b64[2]')
ROOT_TOKEN=$(cat /tmp/vault-init.json | jq -r '.root_token')

echo "🔓 Unsealing Vault..."
vault operator unseal $UNSEAL_KEY_1
vault operator unseal $UNSEAL_KEY_2
vault operator unseal $UNSEAL_KEY_3

echo "✅ Vault unsealed successfully"

# Login with root token
export VAULT_TOKEN=$ROOT_TOKEN
vault auth -token=$ROOT_TOKEN

echo "🔧 Setting up Vault configuration..."

# Enable secrets engines
echo "📦 Enabling secrets engines..."
vault secrets enable -path=secret kv-v2
vault secrets enable -path=database database
vault secrets enable -path=transit transit
vault secrets enable -path=pki pki

# Configure database secrets engine
echo "🗃️  Configuring database secrets engine..."
vault write database/config/mixer-postgres \
    plugin_name=postgresql-database-plugin \
    connection_url="postgresql://{{username}}:{{password}}@postgres:5432/mixer_db?sslmode=require" \
    allowed_roles="mixer-db,mixer-readonly" \
    username="vault_user" \
    password="vault_password"

# Create database roles
vault write database/roles/mixer-db \
    db_name=mixer-postgres \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT ALL PRIVILEGES ON DATABASE mixer_db TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"

vault write database/roles/mixer-readonly \
    db_name=mixer-postgres \
    creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"{{name}}\";" \
    default_ttl="1h" \
    max_ttl="24h"

# Configure transit engine
echo "🔐 Configuring transit encryption..."
vault write -f transit/keys/mixer-keys
vault write -f transit/keys/blockchain-keys  
vault write -f transit/keys/wallet-keys

# Configure PKI engine
echo "📜 Configuring PKI engine..."
vault write -field=certificate pki/root/generate/internal \
    common_name="Crypto Mixer CA" \
    ttl=87600h > /tmp/CA_cert.crt

vault write pki/config/urls \
    issuing_certificates="https://vault:8200/v1/pki/ca" \
    crl_distribution_points="https://vault:8200/v1/pki/crl"

vault write pki/roles/mixer-role \
    allowed_domains="mixer.local,localhost" \
    allow_subdomains=true \
    max_ttl="720h"

# Create policies
echo "📋 Creating policies..."
vault policy write mixer-api /vault/config/policies.hcl
vault policy write blockchain-service /vault/config/policies.hcl
vault policy write scheduler-service /vault/config/policies.hcl
vault policy write wallet-service /vault/config/policies.hcl
vault policy write monitoring /vault/config/policies.hcl

# Enable auth methods
echo "🔑 Enabling authentication methods..."
vault auth enable approle

# Create application roles
vault write auth/approle/role/mixer-api \
    token_policies="mixer-api" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=24h

vault write auth/approle/role/blockchain-service \
    token_policies="blockchain-service" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=24h

vault write auth/approle/role/scheduler-service \
    token_policies="scheduler-service" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=24h

vault write auth/approle/role/wallet-service \
    token_policies="wallet-service" \
    token_ttl=1h \
    token_max_ttl=4h \
    secret_id_ttl=24h

# Store initial secrets
echo "🗝️  Storing initial secrets..."
vault kv put secret/mixer/config \
    encryption_key="$(openssl rand -base64 32)" \
    jwt_secret="$(openssl rand -base64 64)" \
    api_key="$(openssl rand -hex 32)"

vault kv put secret/blockchain/config \
    btc_rpc_url="https://bitcoin-node:8332" \
    eth_rpc_url="https://ethereum-node:8545" \
    sol_rpc_url="https://solana-node:8899" \
    tron_rpc_url="https://tron-node:8090"

vault kv put secret/scheduler/config \
    pool_refresh_interval="300" \
    max_concurrent_mixes="100" \
    cleanup_interval="3600"

# Save important information securely
echo "💾 Saving initialization data..."
cat > /vault/data/vault-credentials.json << EOF
{
    "unseal_keys": [
        "$UNSEAL_KEY_1",
        "$(cat /tmp/vault-init.json | jq -r '.unseal_keys_b64[3]')",
        "$(cat /tmp/vault-init.json | jq -r '.unseal_keys_b64[4]')"
    ],
    "root_token": "$ROOT_TOKEN",
    "initialized_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Generate app role credentials
mkdir -p /vault/data/approle

for role in mixer-api blockchain-service scheduler-service wallet-service; do
    role_id=$(vault read -field=role_id auth/approle/role/$role/role-id)
    secret_id=$(vault write -field=secret_id -f auth/approle/role/$role/secret-id)
    
    cat > /vault/data/approle/$role.json << EOF
{
    "role_id": "$role_id",
    "secret_id": "$secret_id"
}
EOF
done

# Clean up temporary files
rm -f /tmp/vault-init.json

echo "🎉 Vault initialization completed successfully!"
echo ""
echo "📋 Important files created:"
echo "   • /vault/data/vault-credentials.json - Unseal keys and root token"
echo "   • /vault/data/approle/*.json - Application role credentials"
echo ""
echo "⚠️  IMPORTANT: Securely store the unseal keys and root token!"
echo "⚠️  These are needed to unseal Vault and manage secrets."