-- scripts/postgres/init.sql
-- Database initialization script for Crypto Mixer

-- Create database
CREATE DATABASE mixer_db;

-- Create read-only user for monitoring
CREATE USER mixer_readonly WITH PASSWORD 'readonly_password_here';
GRANT CONNECT ON DATABASE mixer_db TO mixer_readonly;

-- Create replication user
CREATE USER replicator WITH REPLICATION LOGIN PASSWORD 'replication_password_here';

-- Connect to mixer_db
\c mixer_db;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE mix_status AS ENUM (
    'PENDING_DEPOSIT',
    'DEPOSIT_RECEIVED',
    'PROCESSING',
    'MIXING',
    'SENDING',
    'COMPLETED',
    'FAILED',
    'EXPIRED'
);

CREATE TYPE currency_type AS ENUM (
    'BTC',
    'ETH',
    'USDT_ERC20',
    'USDT_TRC20',
    'SOL'
);

CREATE TYPE wallet_type AS ENUM (
    'HOT',
    'COLD',
    'BUFFER'
);

-- Mix requests table
CREATE TABLE mix_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(64) UNIQUE NOT NULL,
    currency currency_type NOT NULL,
    amount DECIMAL(20, 8) NOT NULL CHECK (amount > 0),
    fee DECIMAL(20, 8) NOT NULL CHECK (fee >= 0),
    total_amount DECIMAL(20, 8) NOT NULL,
    deposit_address VARCHAR(256) NOT NULL,
    output_addresses JSONB NOT NULL,
    delay_hours INTEGER NOT NULL CHECK (delay_hours >= 1 AND delay_hours <= 72),
    status mix_status NOT NULL DEFAULT 'PENDING_DEPOSIT',
    confirmations INTEGER DEFAULT 0,
    deposit_tx_hash VARCHAR(256),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for mix_requests
CREATE INDEX idx_session_id ON mix_requests(session_id);
CREATE INDEX idx_status ON mix_requests(status);
CREATE INDEX idx_created_at ON mix_requests(created_at);
CREATE INDEX idx_expires_at ON mix_requests(expires_at);

-- Deposit addresses table
CREATE TABLE deposit_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mix_request_id UUID REFERENCES mix_requests(id) ON DELETE CASCADE,
    currency currency_type NOT NULL,
    address VARCHAR(256) NOT NULL UNIQUE,
    private_key_encrypted TEXT NOT NULL, -- Encrypted with master key
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used BOOLEAN DEFAULT FALSE
);

-- Create indexes for deposit_addresses
CREATE INDEX idx_address ON deposit_addresses(address);
CREATE INDEX idx_mix_request ON deposit_addresses(mix_request_id);

-- Output transactions table
CREATE TABLE output_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mix_request_id UUID REFERENCES mix_requests(id) ON DELETE CASCADE,
    output_address VARCHAR(256) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    currency currency_type NOT NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    tx_hash VARCHAR(256),
    confirmations INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'PENDING',
    retry_count INTEGER DEFAULT 0,
    last_error TEXT
);

-- Create indexes for output_transactions
CREATE INDEX idx_scheduled_at ON output_transactions(scheduled_at);
CREATE INDEX idx_status ON output_transactions(status);
CREATE INDEX idx_mix_request ON output_transactions(mix_request_id);

-- Wallets table
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency currency_type NOT NULL,
    address VARCHAR(256) NOT NULL UNIQUE,
    private_key_encrypted TEXT NOT NULL,
    wallet_type wallet_type NOT NULL,
    balance DECIMAL(20, 8) DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for wallets
CREATE INDEX idx_currency_type ON wallets(currency, wallet_type);
CREATE INDEX idx_active ON wallets(active);

-- Monitored addresses for incoming deposits
CREATE TABLE monitored_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency currency_type NOT NULL,
    address VARCHAR(256) NOT NULL,
    mix_request_id UUID REFERENCES mix_requests(id) ON DELETE CASCADE,
    active BOOLEAN DEFAULT TRUE,
    detected BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    detected_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(currency, address)
);

-- Create indexes for monitored_addresses
CREATE INDEX idx_active_addresses ON monitored_addresses(currency, active);

-- Transaction pool for mixing
CREATE TABLE transaction_pool (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency currency_type NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    source_mix_request_id UUID REFERENCES mix_requests(id),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for transaction_pool
CREATE INDEX idx_currency_amount ON transaction_pool(currency, amount);
CREATE INDEX idx_used ON transaction_pool(used);

-- Blockchain transactions log
CREATE TABLE blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency currency_type NOT NULL,
    tx_hash VARCHAR(256) NOT NULL,
    from_address VARCHAR(256),
    to_address VARCHAR(256),
    amount DECIMAL(20, 8) NOT NULL,
    fee DECIMAL(20, 8),
    confirmations INTEGER DEFAULT 0,
    block_number BIGINT,
    block_hash VARCHAR(256),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(currency, tx_hash)
);

-- Create indexes for blockchain_transactions
CREATE INDEX idx_addresses ON blockchain_transactions(from_address, to_address);
CREATE INDEX idx_created_at ON blockchain_transactions(created_at);

-- System configuration
CREATE TABLE system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default configuration
INSERT INTO system_config (key, value) VALUES
    ('fees', '{
        "BTC": {"percentage": 1.5, "minimum": 0.00005, "network": 0.00002},
        "ETH": {"percentage": 1.5, "minimum": 0.001, "network": 0.0005},
        "USDT_ERC20": {"percentage": 1.5, "minimum": 2, "network": 1},
        "USDT_TRC20": {"percentage": 1.0, "minimum": 1, "network": 0.5},
        "SOL": {"percentage": 1.5, "minimum": 0.05, "network": 0.00025}
    }'::jsonb),
    ('limits', '{
        "BTC": {"min": 0.001, "max": 10},
        "ETH": {"min": 0.01, "max": 100},
        "USDT_ERC20": {"min": 100, "max": 1000000},
        "USDT_TRC20": {"min": 100, "max": 1000000},
        "SOL": {"min": 1, "max": 10000}
    }'::jsonb),
    ('confirmations', '{
        "BTC": 3,
        "ETH": 12,
        "USDT_ERC20": 12,
        "USDT_TRC20": 20,
        "SOL": 32
    }'::jsonb),
    ('delays', '{
        "min_hours": 1,
        "max_hours": 72,
        "distribution": "random"
    }'::jsonb);

-- Audit log for sensitive operations
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for audit_log
CREATE INDEX idx_event_type ON audit_log(event_type);
CREATE INDEX idx_created_at ON audit_log(created_at);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers
CREATE TRIGGER update_mix_requests_updated_at BEFORE UPDATE
    ON mix_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create partitioned tables for high-volume data
-- First make blockchain_transactions partitioned
ALTER TABLE blockchain_transactions RENAME TO blockchain_transactions_old;

CREATE TABLE blockchain_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency currency_type NOT NULL,
    tx_hash VARCHAR(256) NOT NULL,
    from_address VARCHAR(256),
    to_address VARCHAR(256),
    amount DECIMAL(20, 8) NOT NULL,
    fee DECIMAL(20, 8),
    confirmations INTEGER DEFAULT 0,
    block_number BIGINT,
    block_hash VARCHAR(256),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(currency, tx_hash)
) PARTITION BY RANGE (created_at);

-- Create yearly partitions
CREATE TABLE blockchain_transactions_2024 PARTITION OF blockchain_transactions
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE blockchain_transactions_2025 PARTITION OF blockchain_transactions
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

-- Grant permissions to readonly user
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mixer_readonly;

-- Create indexes for performance
CREATE INDEX CONCURRENTLY idx_mix_requests_status_created 
    ON mix_requests(status, created_at) 
    WHERE status NOT IN ('COMPLETED', 'FAILED', 'EXPIRED');

CREATE INDEX CONCURRENTLY idx_output_transactions_pending 
    ON output_transactions(scheduled_at) 
    WHERE status = 'PENDING';

-- Vacuum and analyze
VACUUM ANALYZE;