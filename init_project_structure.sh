#!/bin/bash

PROJECT_ROOT="crypto-mixer"

declare -a DIRS=(
  "$PROJECT_ROOT/frontend/public"
  "$PROJECT_ROOT/frontend/src/components"
  "$PROJECT_ROOT/frontend/src/services"
  "$PROJECT_ROOT/frontend/src/utils"
  "$PROJECT_ROOT/frontend/src/config"
  "$PROJECT_ROOT/backend/api/routes"
  "$PROJECT_ROOT/backend/api/controllers"
  "$PROJECT_ROOT/backend/api/middleware"
  "$PROJECT_ROOT/backend/mixer/engine"
  "$PROJECT_ROOT/backend/mixer/pool"
  "$PROJECT_ROOT/backend/mixer/scheduler"
  "$PROJECT_ROOT/backend/blockchain/nodes"
  "$PROJECT_ROOT/backend/blockchain/wallets"
  "$PROJECT_ROOT/backend/blockchain/explorers"
  "$PROJECT_ROOT/backend/database/models"
  "$PROJECT_ROOT/backend/database/migrations"
  "$PROJECT_ROOT/backend/config"
  "$PROJECT_ROOT/backend/utils"
  "$PROJECT_ROOT/admin-dashboard/src"
  "$PROJECT_ROOT/docker"
  "$PROJECT_ROOT/nginx/sites-available"
  "$PROJECT_ROOT/nginx/tor-config"
  "$PROJECT_ROOT/security/ssl"
  "$PROJECT_ROOT/security/keys"
  "$PROJECT_ROOT/security/2fa"
  "$PROJECT_ROOT/scripts"
  "$PROJECT_ROOT/docs"
)

# Создание директорий
for dir in "${DIRS[@]}"; do
  mkdir -p "$dir"
  touch "$dir/.gitkeep"
done

# Пример .env.example и package.json для frontend, backend, admin-dashboard
echo -e "# Example ENV\n" > "$PROJECT_ROOT/frontend/.env.example"
echo -e "# Example ENV\n" > "$PROJECT_ROOT/backend/.env.example"
echo -e "# Example ENV\n" > "$PROJECT_ROOT/admin-dashboard/.env.example"

echo -e "{\n  \"name\": \"frontend\",\n  \"version\": \"0.1.0\"\n}" > "$PROJECT_ROOT/frontend/package.json"
echo -e "{\n  \"name\": \"backend\",\n  \"version\": \"0.1.0\"\n}" > "$PROJECT_ROOT/backend/package.json"
echo -e "{\n  \"name\": \"admin-dashboard\",\n  \"version\": \"0.1.0\"\n}" > "$PROJECT_ROOT/admin-dashboard/package.json"

# Dockerfiles и docker-compose
touch "$PROJECT_ROOT/docker/frontend.Dockerfile"
touch "$PROJECT_ROOT/docker/backend.Dockerfile"
touch "$PROJECT_ROOT/docker/admin.Dockerfile"
touch "$PROJECT_ROOT/docker/docker-compose.yml"

# Скрипты
touch "$PROJECT_ROOT/scripts/deploy.sh"
touch "$PROJECT_ROOT/scripts/backup.sh"
touch "$PROJECT_ROOT/scripts/cleanup-logs.sh"
chmod +x "$PROJECT_ROOT/scripts/"*.sh

# Nginx config
touch "$PROJECT_ROOT/nginx/sites-available/default"
touch "$PROJECT_ROOT/nginx/tor-config/tor.conf"

# Документация
touch "$PROJECT_ROOT/docs/architecture.md"

echo "Структура проекта $PROJECT_ROOT создана!"
