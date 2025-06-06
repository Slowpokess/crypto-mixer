#!/bin/bash

# Kubernetes Deployment Script for Crypto Mixer

set -e

echo "☸️  Starting Crypto Mixer Kubernetes Deployment..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ Error: kubectl is not installed or not in PATH"
    exit 1
fi

# Check if we can connect to cluster
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Error: Cannot connect to Kubernetes cluster"
    echo "📋 Please ensure you're connected to a Kubernetes cluster"
    exit 1
fi

echo "✅ Kubernetes cluster connection verified"

# Create namespace and basic resources
echo "🏗️  Creating namespace and basic resources..."
kubectl apply -f ../../infrastructure/kubernetes/mixer-deployment.yaml

echo "⏳ Waiting for namespace to be ready..."
kubectl wait --for=condition=Active namespace/crypto-mixer --timeout=30s

# Update secrets with real values (prompt user)
echo "🔐 Setting up secrets..."
echo "📋 Please update the secrets in mixer-deployment.yaml with real values before proceeding"
echo "   The following secrets need to be configured:"
echo "   • DB_PASSWORD"
echo "   • REDIS_PASSWORD" 
echo "   • RABBITMQ_PASSWORD"
echo "   • JWT_SECRET"
echo "   • ENCRYPTION_KEY"
echo "   • MASTER_KEY"

read -p "Have you updated the secrets? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled. Please update secrets and try again."
    exit 1
fi

# Deploy PostgreSQL
echo "🐘 Deploying PostgreSQL..."
kubectl apply -f ../../infrastructure/kubernetes/mixer-deployment.yaml
kubectl wait --for=condition=Ready pod -l app=postgres -n crypto-mixer --timeout=300s

echo "✅ PostgreSQL deployed and ready"

# Deploy Redis
echo "📦 Deploying Redis..."
kubectl wait --for=condition=Ready pod -l app=redis -n crypto-mixer --timeout=180s

echo "✅ Redis deployed and ready"

# Deploy application services
echo "🚀 Deploying application services..."

# Deploy blockchain service
kubectl apply -f ../../infrastructure/kubernetes/blockchain-service.yaml
echo "⏳ Waiting for blockchain service..."
kubectl wait --for=condition=Available deployment/blockchain-service -n crypto-mixer --timeout=300s

# Deploy scheduler service
kubectl apply -f ../../infrastructure/kubernetes/scheduler-service.yaml
echo "⏳ Waiting for scheduler service..."
kubectl wait --for=condition=Available deployment/scheduler-service -n crypto-mixer --timeout=300s

# Deploy mixer API (already in main file)
echo "⏳ Waiting for mixer API..."
kubectl wait --for=condition=Available deployment/mixer-api -n crypto-mixer --timeout=300s

echo "✅ Application services deployed successfully"

# Deploy monitoring stack
echo "📊 Deploying monitoring stack..."
kubectl apply -f ../../infrastructure/kubernetes/monitoring.yaml

echo "⏳ Waiting for monitoring services..."
kubectl wait --for=condition=Available deployment/prometheus -n crypto-mixer --timeout=300s
kubectl wait --for=condition=Available deployment/grafana -n crypto-mixer --timeout=300s

echo "✅ Monitoring stack deployed successfully"

# Verify deployment
echo "🔍 Verifying deployment..."

# Check pod status
echo "📋 Pod Status:"
kubectl get pods -n crypto-mixer

# Check service status
echo ""
echo "🌐 Service Status:"
kubectl get services -n crypto-mixer

# Check ingress status
echo ""
echo "🔗 Ingress Status:"
kubectl get ingress -n crypto-mixer

# Get cluster info
echo ""
echo "📊 Resource Usage:"
kubectl top pods -n crypto-mixer 2>/dev/null || echo "Metrics server not available"

# Health checks
echo ""
echo "🔍 Running health checks..."

# Check if all deployments are ready
deployments=(
    "postgres"
    "redis"
    "mixer-api"
    "blockchain-service"
    "scheduler-service"
    "prometheus"
    "grafana"
)

all_ready=true

for deployment in "${deployments[@]}"; do
    if kubectl get deployment "$deployment" -n crypto-mixer &> /dev/null; then
        ready=$(kubectl get deployment "$deployment" -n crypto-mixer -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        replicas=$(kubectl get deployment "$deployment" -n crypto-mixer -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
        
        if [ "$ready" = "$replicas" ]; then
            echo "✅ $deployment: $ready/$replicas ready"
        else
            echo "❌ $deployment: $ready/$replicas ready"
            all_ready=false
        fi
    else
        echo "⚠️  $deployment: not found (might be StatefulSet)"
    fi
done

# Check StatefulSets
statefulsets=("postgres")

for sts in "${statefulsets[@]}"; do
    if kubectl get statefulset "$sts" -n crypto-mixer &> /dev/null; then
        ready=$(kubectl get statefulset "$sts" -n crypto-mixer -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        replicas=$(kubectl get statefulset "$sts" -n crypto-mixer -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
        
        if [ "$ready" = "$replicas" ]; then
            echo "✅ $sts (StatefulSet): $ready/$replicas ready"
        else
            echo "❌ $sts (StatefulSet): $ready/$replicas ready"
            all_ready=false
        fi
    fi
done

if [ "$all_ready" = true ]; then
    echo ""
    echo "🎉 Crypto Mixer Kubernetes deployment completed successfully!"
else
    echo ""
    echo "⚠️  Some services are not ready. Check the logs for issues."
fi

echo ""
echo "📋 Useful commands:"
echo "   • Check pods: kubectl get pods -n crypto-mixer"
echo "   • Check logs: kubectl logs -f deployment/mixer-api -n crypto-mixer"
echo "   • Port forward API: kubectl port-forward service/mixer-api-service 3000:3000 -n crypto-mixer"
echo "   • Port forward Grafana: kubectl port-forward service/grafana-service 3001:3000 -n crypto-mixer"
echo "   • Scale deployment: kubectl scale deployment mixer-api --replicas=5 -n crypto-mixer"
echo ""
echo "🗑️  To remove everything:"
echo "   kubectl delete namespace crypto-mixer"