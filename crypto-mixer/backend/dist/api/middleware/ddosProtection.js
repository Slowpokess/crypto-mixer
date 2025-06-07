"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultDDoSConfig = exports.AdvancedDDoSProtection = void 0;
const events_1 = require("events");
const logger_1 = require("../../utils/logger");
/**
 * Продвинутая DDoS защита
 */
class AdvancedDDoSProtection extends events_1.EventEmitter {
    constructor(config) {
        super();
        this.isActive = false;
        // Статистика трафика
        this.trafficHistory = [];
        this.currentWindow = new Map();
        this.ipReputation = new Map();
        // Обнаруженные атаки
        this.activeAttacks = new Map();
        this.attackHistory = [];
        // Машинное обучение
        this.mlModel = null;
        this.trainingData = [];
        // Блокировки
        this.blockedIPs = new Map();
        this.suspiciousIPs = new Set();
        // Таймеры
        this.analysisInterval = null;
        this.cleanupInterval = null;
        this.config = config;
        if (this.config.enabled) {
            this.initialize();
        }
    }
    /**
     * RUSSIAN: Инициализация системы DDoS защиты
     */
    async initialize() {
        logger_1.enhancedDbLogger.info('🛡️ Инициализация продвинутой DDoS защиты', {
            sensitivity: this.config.sensitivity,
            attackTypes: Object.keys(this.config.attackTypes).filter(key => this.config.attackTypes[key]),
            machineLearning: this.config.machineLearning.enabled
        });
        // RUSSIAN: Инициализация модели машинного обучения
        if (this.config.machineLearning.enabled) {
            await this.initializeMachineLearning();
        }
        // RUSSIAN: Загрузка баз данных репутации
        if (this.config.reputation.enabled) {
            await this.loadReputationDatabases();
        }
        // RUSSIAN: Запуск анализа трафика
        this.startTrafficAnalysis();
        // RUSSIAN: Запуск очистки устаревших данных
        this.startCleanupTasks();
        this.isActive = true;
        logger_1.enhancedDbLogger.info('✅ DDoS защита активирована');
    }
    /**
     * RUSSIAN: Главный middleware для DDoS защиты
     */
    middleware() {
        return async (req, res, next) => {
            if (!this.isActive) {
                return next();
            }
            try {
                const startTime = Date.now();
                const clientIP = this.getClientIP(req);
                const userAgent = req.get('User-Agent') || 'unknown';
                // RUSSIAN: Быстрая проверка заблокированных IP
                if (this.isBlocked(clientIP)) {
                    const blockInfo = this.blockedIPs.get(clientIP);
                    logger_1.enhancedDbLogger.warn('🚫 Заблокированный IP попытался подключиться', {
                        ip: clientIP,
                        reason: blockInfo?.reason,
                        level: blockInfo?.level
                    });
                    return this.handleBlockedRequest(req, res, blockInfo);
                }
                // RUSSIAN: Сбор метрик запроса
                const requestMetrics = {
                    ip: clientIP,
                    method: req.method,
                    path: req.path,
                    userAgent,
                    timestamp: new Date(),
                    payloadSize: parseInt(req.get('Content-Length') || '0'),
                    referer: req.get('Referer'),
                    country: this.getCountryFromIP(clientIP)
                };
                // RUSSIAN: Анализ подозрительности запроса
                const suspicionScore = await this.analyzeSuspiciousness(requestMetrics, req);
                if (suspicionScore > 0.8) {
                    logger_1.enhancedDbLogger.warn('⚠️ Высокоподозрительный запрос обнаружен', {
                        ip: clientIP,
                        score: suspicionScore,
                        path: req.path
                    });
                    this.suspiciousIPs.add(clientIP);
                }
                // RUSSIAN: Записываем метрики для анализа
                this.recordRequest(requestMetrics);
                // RUSSIAN: Проверяем превышение порогов в реальном времени
                if (await this.checkThresholds(clientIP, requestMetrics)) {
                    return this.handleSuspiciousActivity(req, res, clientIP, 'threshold_exceeded');
                }
                // RUSSIAN: Передаем управление следующему middleware
                res.on('finish', () => {
                    const responseTime = Date.now() - startTime;
                    this.recordResponse(clientIP, res.statusCode, responseTime);
                });
                next();
            }
            catch (error) {
                logger_1.enhancedDbLogger.error('❌ Ошибка в DDoS защите', { error });
                // RUSSIAN: При ошибке пропускаем запрос (fail-open для доступности)
                next();
            }
        };
    }
    /**
     * RUSSIAN: Анализ подозрительности запроса
     */
    async analyzeSuspiciousness(metrics, req) {
        let suspicionScore = 0;
        // RUSSIAN: Проверка репутации IP
        const reputation = this.ipReputation.get(metrics.ip) || 0.5;
        if (reputation < 0.3) {
            suspicionScore += 0.3;
        }
        // RUSSIAN: Анализ User-Agent
        if (this.isSuspiciousUserAgent(metrics.userAgent)) {
            suspicionScore += 0.2;
        }
        // RUSSIAN: Анализ паттернов запросов
        if (this.config.patternDetection.enabled) {
            const patternScore = await this.analyzeRequestPattern(metrics, req);
            suspicionScore += patternScore;
        }
        // RUSSIAN: Машинное обучение
        if (this.config.machineLearning.enabled && this.mlModel) {
            const mlScore = await this.getMachineLearningScore(metrics, req);
            suspicionScore += mlScore * 0.4;
        }
        // RUSSIAN: Геолокационный анализ
        if (this.isSuspiciousGeolocation(metrics.country)) {
            suspicionScore += 0.1;
        }
        return Math.min(1, suspicionScore);
    }
    /**
     * RUSSIAN: Проверка превышения порогов
     */
    async checkThresholds(ip, metrics) {
        const now = Date.now();
        const windowStart = now - 60000; // 1 минута
        // RUSSIAN: Получаем статистику за последнюю минуту
        const recentRequests = this.getRecentRequests(windowStart);
        // RUSSIAN: Запросы в секунду (общие)
        const rpsTotal = recentRequests.length / 60;
        if (rpsTotal > this.config.thresholds.requestsPerSecond) {
            logger_1.enhancedDbLogger.warn('🚨 Превышен общий RPS порог', { rpsTotal, threshold: this.config.thresholds.requestsPerSecond });
            await this.triggerAttackDetection('volumetric_rps', 'high', ['high_rps']);
            return true;
        }
        // RUSSIAN: Запросы с одного IP
        const ipRequests = recentRequests.filter(r => r.ip === ip);
        const rpsPerIP = ipRequests.length / 60;
        if (rpsPerIP > this.config.thresholds.requestsPerIP) {
            logger_1.enhancedDbLogger.warn('🚨 Превышен RPS порог для IP', { ip, rpsPerIP, threshold: this.config.thresholds.requestsPerIP });
            return true;
        }
        // RUSSIAN: Уникальные IP в минуту
        const uniqueIPs = new Set(recentRequests.map(r => r.ip)).size;
        if (uniqueIPs > this.config.thresholds.uniqueIPsPerMinute) {
            logger_1.enhancedDbLogger.warn('🚨 Слишком много уникальных IP', { uniqueIPs, threshold: this.config.thresholds.uniqueIPsPerMinute });
            await this.triggerAttackDetection('botnet', 'high', ['many_unique_ips']);
            return true;
        }
        // RUSSIAN: Размер payload
        if (metrics.payloadSize > this.config.thresholds.payloadSize) {
            logger_1.enhancedDbLogger.warn('🚨 Слишком большой payload', { ip, size: metrics.payloadSize, threshold: this.config.thresholds.payloadSize });
            return true;
        }
        return false;
    }
    /**
     * RUSSIAN: Инициализация машинного обучения
     */
    async initializeMachineLearning() {
        logger_1.enhancedDbLogger.info('🤖 Инициализация системы машинного обучения для DDoS защиты');
        try {
            // RUSSIAN: Простая статистическая модель для начала
            this.mlModel = {
                type: this.config.machineLearning.model,
                features: [
                    'requests_per_minute',
                    'payload_size_avg',
                    'response_time_avg',
                    'error_rate',
                    'unique_paths',
                    'user_agent_entropy',
                    'geographic_distribution'
                ],
                weights: new Map(),
                thresholds: new Map(),
                lastTrained: new Date()
            };
            // RUSSIAN: Загружаем предобученные веса если есть
            await this.loadPretrainedModel();
            logger_1.enhancedDbLogger.info('✅ Модель машинного обучения инициализирована', {
                type: this.mlModel.type,
                features: this.mlModel.features.length
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка инициализации ML модели', { error });
            this.config.machineLearning.enabled = false;
        }
    }
    /**
     * RUSSIAN: Загрузка баз данных репутации IP
     */
    async loadReputationDatabases() {
        logger_1.enhancedDbLogger.info('📊 Загрузка баз данных репутации IP');
        try {
            // RUSSIAN: Загружаем известные плохие IP адреса
            const maliciousIPs = await this.loadMaliciousIPDatabase();
            for (const ip of maliciousIPs) {
                this.ipReputation.set(ip, 0.1); // Очень низкая репутация
            }
            // RUSSIAN: Загружаем Tor exit nodes
            const torExitNodes = await this.loadTorExitNodes();
            for (const ip of torExitNodes) {
                this.ipReputation.set(ip, 0.3); // Низкая репутация
            }
            logger_1.enhancedDbLogger.info('✅ Базы данных репутации загружены', {
                maliciousIPs: maliciousIPs.length,
                torNodes: torExitNodes.length
            });
        }
        catch (error) {
            logger_1.enhancedDbLogger.error('❌ Ошибка загрузки баз репутации', { error });
        }
    }
    /**
     * RUSSIAN: Запуск анализа трафика
     */
    startTrafficAnalysis() {
        this.analysisInterval = setInterval(async () => {
            await this.analyzeTrafficPatterns();
            await this.updateMLModel();
            this.generateTrafficStats();
        }, this.config.patternDetection.analysisWindow * 1000);
        logger_1.enhancedDbLogger.info('📈 Анализ трафика запущен', {
            interval: this.config.patternDetection.analysisWindow
        });
    }
    /**
     * RUSSIAN: Анализ паттернов трафика
     */
    async analyzeTrafficPatterns() {
        const now = Date.now();
        const analysisWindow = this.config.patternDetection.analysisWindow * 1000;
        const recentRequests = this.getRecentRequests(now - analysisWindow);
        if (recentRequests.length < this.config.patternDetection.minSamples) {
            return; // Недостаточно данных для анализа
        }
        // RUSSIAN: Энтропийный анализ
        if (this.config.patternDetection.algorithms.includes('entropy')) {
            await this.performEntropyAnalysis(recentRequests);
        }
        // RUSSIAN: Кластерный анализ
        if (this.config.patternDetection.algorithms.includes('clustering')) {
            await this.performClusterAnalysis(recentRequests);
        }
        // RUSSIAN: Статистический анализ
        if (this.config.patternDetection.algorithms.includes('statistical')) {
            await this.performStatisticalAnalysis(recentRequests);
        }
    }
    /**
     * RUSSIAN: Энтропийный анализ для обнаружения ботнетов
     */
    async performEntropyAnalysis(requests) {
        // RUSSIAN: Анализируем энтропию User-Agent строк
        const userAgents = requests.map(r => r.userAgent);
        const uaEntropy = this.calculateEntropy(userAgents);
        // RUSSIAN: Анализируем энтропию путей запросов
        const paths = requests.map(r => r.path);
        const pathEntropy = this.calculateEntropy(paths);
        // RUSSIAN: Низкая энтропия может указывать на ботнет
        if (uaEntropy < 2.0 && requests.length > 100) {
            await this.triggerAttackDetection('botnet', 'medium', ['low_user_agent_entropy']);
        }
        if (pathEntropy < 1.5 && requests.length > 50) {
            await this.triggerAttackDetection('application_layer', 'medium', ['low_path_entropy']);
        }
    }
    /**
     * RUSSIAN: Статистический анализ аномалий
     */
    async performStatisticalAnalysis(requests) {
        // RUSSIAN: Анализ распределения запросов по времени
        const timeDistribution = this.analyzeTimeDistribution(requests);
        // RUSSIAN: Проверяем на periodicity (признак автоматизированных атак)
        if (timeDistribution.periodicity > 0.8) {
            await this.triggerAttackDetection('automated', 'medium', ['high_periodicity']);
        }
        // RUSSIAN: Анализ географического распределения
        const geoDistribution = this.analyzeGeographicDistribution(requests);
        // RUSSIAN: Слишком много запросов из одной страны может быть подозрительно
        const maxCountryPercentage = Math.max(...Object.values(geoDistribution));
        if (maxCountryPercentage > 0.9 && requests.length > 100) {
            await this.triggerAttackDetection('geographic_anomaly', 'low', ['single_country_dominance']);
        }
    }
    /**
     * RUSSIAN: Вычисление энтропии Шеннона
     */
    calculateEntropy(data) {
        const freq = new Map();
        for (const item of data) {
            freq.set(item, (freq.get(item) || 0) + 1);
        }
        let entropy = 0;
        const total = data.length;
        for (const count of freq.values()) {
            const p = count / total;
            entropy -= p * Math.log2(p);
        }
        return entropy;
    }
    /**
     * RUSSIAN: Обработка обнаружения атаки
     */
    async triggerAttackDetection(type, severity, indicators) {
        const attackId = `attack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const attack = {
            type,
            severity,
            confidence: this.calculateAttackConfidence(indicators),
            indicators,
            sourceIPs: Array.from(this.suspiciousIPs),
            targetEndpoints: this.getTopTargetEndpoints(),
            startTime: new Date(),
            metrics: this.getCurrentAttackMetrics()
        };
        this.activeAttacks.set(attackId, attack);
        this.attackHistory.push(attack);
        logger_1.enhancedDbLogger.warn('🚨 DDoS атака обнаружена', {
            id: attackId,
            type,
            severity,
            confidence: attack.confidence,
            indicators: indicators.join(', ')
        });
        // RUSSIAN: Применяем меры противодействия
        if (this.config.mitigation.autoBlock) {
            await this.applyMitigation(attack);
        }
        // RUSSIAN: Отправляем уведомление в систему мониторинга
        this.emit('attack_detected', attack);
    }
    /**
     * RUSSIAN: Применение мер противодействия
     */
    async applyMitigation(attack) {
        logger_1.enhancedDbLogger.info('🛡️ Применение мер противодействия', {
            type: attack.type,
            severity: attack.severity
        });
        // RUSSIAN: Блокируем подозрительные IP
        for (const ip of attack.sourceIPs) {
            if (!this.isWhitelisted(ip)) {
                await this.blockIP(ip, `DDoS: ${attack.type}`, this.config.mitigation.blockDuration);
            }
        }
        // RUSSIAN: Эскалация по уровням
        if (this.config.mitigation.escalation.enabled) {
            const level = this.getEscalationLevel(attack.severity);
            await this.applyEscalation(level, attack);
        }
        // RUSSIAN: Интеграция с внешними сервисами
        if (this.config.external.cloudflare.enabled) {
            await this.notifyCloudflare(attack);
        }
        if (this.config.external.fail2ban.enabled) {
            await this.notifyFail2Ban(attack);
        }
    }
    /**
     * RUSSIAN: Блокировка IP адреса
     */
    async blockIP(ip, reason, duration, level = 1) {
        const until = new Date(Date.now() + (duration * 1000));
        this.blockedIPs.set(ip, { reason, until, level });
        this.suspiciousIPs.delete(ip); // Убираем из подозрительных, так как уже заблокирован
        logger_1.enhancedDbLogger.warn('🚫 IP заблокирован DDoS защитой', {
            ip,
            reason,
            duration,
            level,
            until: until.toISOString()
        });
        // RUSSIAN: Автоматическая разблокировка
        setTimeout(() => {
            this.unblockIP(ip);
        }, duration * 1000);
        this.emit('ip_blocked', { ip, reason, duration, level });
    }
    /**
     * RUSSIAN: Разблокировка IP адреса
     */
    unblockIP(ip) {
        if (this.blockedIPs.has(ip)) {
            this.blockedIPs.delete(ip);
            logger_1.enhancedDbLogger.info('✅ IP разблокирован DDoS защитой', { ip });
            this.emit('ip_unblocked', { ip });
        }
    }
    /**
     * RUSSIAN: Проверка заблокированного IP
     */
    isBlocked(ip) {
        const blockInfo = this.blockedIPs.get(ip);
        if (!blockInfo)
            return false;
        // RUSSIAN: Проверяем, не истекла ли блокировка
        if (blockInfo.until < new Date()) {
            this.unblockIP(ip);
            return false;
        }
        return true;
    }
    /**
     * RUSSIAN: Проверка IP в белом списке
     */
    isWhitelisted(ip) {
        // RUSSIAN: Локальные адреса всегда в белом списке
        if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) {
            return true;
        }
        // RUSSIAN: Дополнительная логика белого списка
        return false;
    }
    /**
     * RUSSIAN: Получение IP адреса клиента
     */
    getClientIP(req) {
        return req.get('CF-Connecting-IP') ||
            req.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
            req.get('X-Real-IP') ||
            req.socket.remoteAddress ||
            'unknown';
    }
    /**
     * RUSSIAN: Запись запроса для анализа
     */
    recordRequest(metrics) {
        const key = `request_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.currentWindow.set(key, metrics);
        // RUSSIAN: Ограничиваем размер окна (последние 10000 запросов)
        if (this.currentWindow.size > 10000) {
            const oldestKey = this.currentWindow.keys().next().value;
            this.currentWindow.delete(oldestKey);
        }
    }
    /**
     * RUSSIAN: Запись ответа для анализа
     */
    recordResponse(ip, statusCode, responseTime) {
        // RUSSIAN: Обновляем репутацию IP на основе поведения
        this.updateIPReputation(ip, statusCode, responseTime);
        // RUSSIAN: Анализируем медленные запросы (возможная Slowloris атака)
        if (this.config.attackTypes.slowloris && responseTime > this.config.thresholds.requestDuration) {
            this.handleSlowlorisDetection(ip, responseTime);
        }
    }
    /**
     * RUSSIAN: Обновление репутации IP
     */
    updateIPReputation(ip, statusCode, responseTime) {
        const currentReputation = this.ipReputation.get(ip) || 0.5;
        let adjustment = 0;
        // RUSSIAN: Положительные индикаторы
        if (statusCode >= 200 && statusCode < 300) {
            adjustment += 0.01; // Успешные запросы улучшают репутацию
        }
        // RUSSIAN: Отрицательные индикаторы
        if (statusCode >= 400 && statusCode < 500) {
            adjustment -= 0.02; // Ошибки клиента ухудшают репутацию
        }
        if (responseTime > 5000) {
            adjustment -= 0.01; // Медленные запросы подозрительны
        }
        const newReputation = Math.max(0, Math.min(1, currentReputation + adjustment));
        this.ipReputation.set(ip, newReputation);
        // RUSSIAN: Если репутация слишком низкая, добавляем в подозрительные
        if (newReputation < 0.2) {
            this.suspiciousIPs.add(ip);
        }
    }
    /**
     * RUSSIAN: Получение недавних запросов
     */
    getRecentRequests(since) {
        const recent = [];
        for (const metrics of this.currentWindow.values()) {
            if (metrics.timestamp.getTime() >= since) {
                recent.push(metrics);
            }
        }
        return recent;
    }
    /**
     * RUSSIAN: Обработка заблокированного запроса
     */
    handleBlockedRequest(req, res, blockInfo) {
        const timeRemaining = Math.ceil((blockInfo.until.getTime() - Date.now()) / 1000);
        res.status(403).json({
            error: 'Access Denied',
            message: 'Ваш IP адрес временно заблокирован',
            reason: blockInfo.reason,
            level: blockInfo.level,
            timeRemaining,
            retryAfter: timeRemaining,
            timestamp: new Date().toISOString()
        });
    }
    /**
     * RUSSIAN: Обработка подозрительной активности
     */
    handleSuspiciousActivity(req, res, ip, reason) {
        logger_1.enhancedDbLogger.warn('⚠️ Подозрительная активность обнаружена', { ip, reason });
        res.status(429).json({
            error: 'Too Many Requests',
            message: 'Обнаружена подозрительная активность',
            reason,
            ip,
            timestamp: new Date().toISOString()
        });
    }
    /**
     * RUSSIAN: Получение статистики DDoS защиты
     */
    getStatistics() {
        const now = Date.now();
        const recentRequests = this.getRecentRequests(now - 60000);
        // RUSSIAN: Распределение репутации
        const reputationCounts = { low: 0, medium: 0, high: 0 };
        for (const reputation of this.ipReputation.values()) {
            if (reputation < 0.3)
                reputationCounts.low++;
            else if (reputation < 0.7)
                reputationCounts.medium++;
            else
                reputationCounts.high++;
        }
        // RUSSIAN: Топ типов атак
        const attackTypeCounts = new Map();
        for (const attack of this.attackHistory) {
            attackTypeCounts.set(attack.type, (attackTypeCounts.get(attack.type) || 0) + 1);
        }
        const topAttackTypes = Array.from(attackTypeCounts.entries())
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        return {
            activeAttacks: this.activeAttacks.size,
            blockedIPs: this.blockedIPs.size,
            suspiciousIPs: this.suspiciousIPs.size,
            totalRequests: this.currentWindow.size,
            requestsPerSecond: recentRequests.length / 60,
            topAttackTypes,
            reputationDistribution: reputationCounts
        };
    }
    /**
     * RUSSIAN: Получение детальной информации об атаках
     */
    getAttackDetails() {
        const recentAttacks = this.attackHistory
            .filter(attack => (Date.now() - attack.startTime.getTime()) < 3600000) // Последний час
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
        const blockedIPsList = Array.from(this.blockedIPs.entries())
            .map(([ip, info]) => ({ ip, ...info }));
        return {
            active: Array.from(this.activeAttacks.values()),
            recent: recentAttacks,
            blockedIPs: blockedIPsList
        };
    }
    /**
     * RUSSIAN: Ручная блокировка IP
     */
    async manualBlockIP(ip, reason, duration) {
        await this.blockIP(ip, `Manual: ${reason}`, duration, 999);
        logger_1.enhancedDbLogger.info('👮 IP заблокирован вручную', { ip, reason, duration });
    }
    /**
     * RUSSIAN: Ручная разблокировка IP
     */
    async manualUnblockIP(ip) {
        this.unblockIP(ip);
        logger_1.enhancedDbLogger.info('👮 IP разблокирован вручную', { ip });
    }
    /**
     * RUSSIAN: Остановка DDoS защиты
     */
    async shutdown() {
        this.isActive = false;
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.currentWindow.clear();
        this.blockedIPs.clear();
        this.suspiciousIPs.clear();
        this.activeAttacks.clear();
        logger_1.enhancedDbLogger.info('🛡️ DDoS защита остановлена');
    }
    // RUSSIAN: Заглушки для методов, которые будут реализованы позже
    async loadPretrainedModel() { }
    async loadMaliciousIPDatabase() { return []; }
    async loadTorExitNodes() { return []; }
    isSuspiciousUserAgent(userAgent) { return false; }
    async analyzeRequestPattern(metrics, req) { return 0; }
    async getMachineLearningScore(metrics, req) { return 0; }
    isSuspiciousGeolocation(country) { return false; }
    getCountryFromIP(ip) { return 'unknown'; }
    async performClusterAnalysis(requests) { }
    analyzeTimeDistribution(requests) { return { periodicity: 0 }; }
    analyzeGeographicDistribution(requests) { return {}; }
    calculateAttackConfidence(indicators) { return 0.8; }
    getTopTargetEndpoints() { return []; }
    getCurrentAttackMetrics() { return {}; }
    getEscalationLevel(severity) { return {}; }
    async applyEscalation(level, attack) { }
    async notifyCloudflare(attack) { }
    async notifyFail2Ban(attack) { }
    handleSlowlorisDetection(ip, responseTime) { }
    async updateMLModel() { }
    generateTrafficStats() { }
    startCleanupTasks() { }
}
exports.AdvancedDDoSProtection = AdvancedDDoSProtection;
/**
 * RUSSIAN: Дефолтная конфигурация DDoS защиты для crypto-mixer
 */
exports.defaultDDoSConfig = {
    enabled: true,
    sensitivity: 'adaptive',
    thresholds: {
        requestsPerSecond: 100, // 100 RPS общий лимит
        requestsPerIP: 20, // 20 RPS с одного IP
        concurrentConnections: 1000, // 1000 одновременных подключений
        uniqueIPsPerMinute: 500, // 500 уникальных IP в минуту
        errorRate: 10, // 10% ошибок
        payloadSize: 10 * 1024 * 1024, // 10MB payload
        requestDuration: 30000 // 30 секунд на запрос
    },
    patternDetection: {
        enabled: true,
        algorithms: ['entropy', 'statistical'],
        analysisWindow: 60, // Анализ каждую минуту
        minSamples: 50 // Минимум 50 запросов для анализа
    },
    attackTypes: {
        volumetric: true,
        slowloris: true,
        httpFlood: true,
        amplification: true,
        botnet: true
    },
    mitigation: {
        autoBlock: true,
        blockDuration: 300, // 5 минут базовой блокировки
        escalation: {
            enabled: true,
            levels: [
                { threshold: 10, action: 'throttle', duration: 60 },
                { threshold: 25, action: 'block', duration: 300 },
                { threshold: 50, action: 'block', duration: 3600 }
            ]
        }
    },
    machineLearning: {
        enabled: false, // Пока отключено
        model: 'statistical',
        trainingPeriod: 24, // 24 часа обучения
        adaptationRate: 0.1 // 10% скорость адаптации
    },
    reputation: {
        enabled: true,
        databases: ['tor', 'malware'],
        trustScore: {
            minScore: 0.3, // Минимум 30% доверия
            decayRate: 0.95 // 5% деградация в день
        }
    },
    external: {
        cloudflare: {
            enabled: false
        },
        fail2ban: {
            enabled: false,
            logPath: '/var/log/crypto-mixer/security.log'
        }
    }
};
//# sourceMappingURL=ddosProtection.js.map