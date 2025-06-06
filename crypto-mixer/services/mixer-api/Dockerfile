# Mixer API Dockerfile
FROM node:20-alpine3.19

# Установка системных зависимостей
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Создание пользователя приложения
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mixer -u 1001

# Создание директории workspace
WORKDIR /workspace

# Копирование корневых package.json и package-lock.json
COPY package.json package-lock.json ./

# Создание директории для mixer-api
RUN mkdir -p services/mixer-api

# Копирование package.json mixer-api
COPY ./services/mixer-api/package.json ./services/mixer-api/

# Установка всех зависимостей workspace (включая mixer-api)
RUN npm ci && \
    npm cache clean --force

# Переход в директорию приложения
WORKDIR /workspace/services/mixer-api

# Копирование исходного кода
COPY ./services/mixer-api/src ./src
COPY ./services/mixer-api/tsconfig.json ./

# Компиляция TypeScript
RUN npm run build

# Создание директорий для логов и данных
RUN mkdir -p /workspace/services/mixer-api/logs /workspace/services/mixer-api/data && \
    chown -R mixer:nodejs /workspace

# Переключение на пользователя приложения
USER mixer

# Открытие порта
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Запуск приложения
CMD ["npm", "start"]