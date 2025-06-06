#!/bin/bash

# Docker Deployment Script for Crypto Mixer

set -e

echo "🚀 Starting Crypto Mixer Docker Deployment..."

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found!"
    echo "📋 Please copy .env.example to .env and configure your settings."
    exit 1
fi

# Source environment variables
source .env

# Validate required environment variables
required_vars=(
    "DB_PASSWORD"
    "REDIS_PASSWORD" 
    "RABBITMQ_PASSWORD"
    "JWT_SECRET"
    "ENCRYPTION_KEY"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: Required environment variable $var is not set!"
        exit 1
    fi
done

echo "✅ Environment validation passed"

# Build services
echo "🔨 Building services..."

# Build blockchain service
echo "📦 Building blockchain-service..."
docker-compose -f docker-compose.production.yml build blockchain-service

# Build scheduler service
echo "📦 Building scheduler-service..."
docker-compose -f docker-compose.production.yml build scheduler-service

# Build mixer API service
echo "📦 Building mixer-api..."
docker-compose -f docker-compose.production.yml build mixer-api

# Build frontend
echo "📦 Building frontend..."
docker-compose -f docker-compose.production.yml build frontend

echo "✅ All services built successfully"

# Deploy infrastructure services first
echo "🏗️  Deploying infrastructure services..."

docker-compose -f docker-compose.production.yml up -d \
    postgres-master \
    postgres-slave \
    redis-master \
    rabbitmq \
    kong-database

echo "⏳ Waiting for databases to be ready..."
sleep 30

# Run Kong migrations
echo "🔄 Running Kong migrations..."
docker-compose -f docker-compose.production.yml run --rm kong-migration

# Deploy Kong
echo "🌐 Deploying Kong API Gateway..."
docker-compose -f docker-compose.production.yml up -d kong

# Deploy application services
echo "🚀 Deploying application services..."

docker-compose -f docker-compose.production.yml up -d \
    mixer-api \
    blockchain-service \
    scheduler-service \
    wallet-service

echo "⏳ Waiting for services to start..."
sleep 15

# Deploy frontend and proxy
echo "🎨 Deploying frontend and proxy..."
docker-compose -f docker-compose.production.yml up -d \
    frontend \
    nginx \
    tor-proxy

# Deploy monitoring stack
echo "📊 Deploying monitoring stack..."
docker-compose -f docker-compose.production.yml up -d \
    prometheus \
    grafana \
    loki \
    promtail

# Deploy security scanner
echo "🔒 Deploying security scanner..."
docker-compose -f docker-compose.production.yml up -d security-scanner

echo "✅ Deployment completed successfully!"

# Health checks
echo "🔍 Running health checks..."

# Check if services are running
services=(
    "mixer-api:3000"
    "blockchain-service:3001" 
    "scheduler-service:3002"
)

for service in "${services[@]}"; do
    name=${service%:*}
    port=${service#*:}
    
    echo "🔍 Checking $name health..."
    
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf "http://localhost:$port/health" > /dev/null 2>&1; then
            echo "✅ $name is healthy"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            echo "❌ $name health check failed after $max_attempts attempts"
            echo "📋 Check logs: docker-compose logs $name"
        fi
        
        sleep 2
        ((attempt++))
    done
done

echo ""
echo "🎉 Crypto Mixer deployment completed!"
echo ""
echo "📊 Service URLs:"
echo "   • Frontend: http://localhost"
echo "   • API: http://localhost/api"
echo "   • Grafana: http://localhost:3001"
echo "   • Prometheus: http://localhost:9090"
echo "   • Tor: http://localhost:9050"
echo ""
echo "📋 To check logs:"
echo "   docker-compose -f docker-compose.production.yml logs -f [service-name]"
echo ""
echo "🛠️  To stop all services:"
echo "   docker-compose -f docker-compose.production.yml down"