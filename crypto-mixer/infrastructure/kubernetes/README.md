# Kubernetes Production Deployment - Crypto Mixer

Полноценная конфигурация Kubernetes для продакшн развертывания крипто-микшера с автоскейлингом, мониторингом и обеспечением высокой доступности.

## 🏗️ Архитектура

### Компоненты системы:
- **Frontend** (React) - 3-15 реплик с HPA
- **Mixer API** - 3-10 реплик с HPA 
- **Blockchain Service** - 2-8 реплик с HPA
- **Wallet Service** - 2-6 реплик с HPA (консервативное масштабирование)
- **Scheduler Service** - 1-3 реплики с HPA
- **Monitoring Service** - 2-5 реплик с HPA

### Инфраструктура:
- **PostgreSQL** - StatefulSet с персистентным хранилищем
- **Redis** - Deployment с PVC
- **RabbitMQ** - StatefulSet кластер (3 реплики)
- **Prometheus** - мониторинг метрик
- **Grafana** - дашборды и визуализация
- **Alertmanager** - управление алертами

## 🚀 Быстрый старт

### Предварительные требования

1. **Kubernetes кластер** (v1.20+)
2. **kubectl** настроенный для работы с кластером
3. **helm** (v3.0+)
4. **Минимум 16GB RAM и 8 CPU** в кластере
5. **LoadBalancer** или **NodePort** для Ingress

### Автоматическое развертывание

```bash
# Клонирование репозитория
git clone <repository-url>
cd crypto-mixer/infrastructure/kubernetes

# Настройка секретов (ОБЯЗАТЕЛЬНО!)
cp production-secrets.yaml.example production-secrets.yaml
nano production-secrets.yaml  # Замените все CHANGE_ME значения

# Настройка доменов в ingress
nano production-ingress.yaml  # Замените yourdomain.com

# Запуск автоматического развертывания
./deploy-production.sh
```

### Ручное развертывание

```bash
# 1. Создание namespace
kubectl apply -f namespace.yaml

# 2. Secrets и ConfigMaps
kubectl apply -f production-secrets.yaml
kubectl apply -f production-config.yaml

# 3. Storage layer
kubectl apply -f mixer-deployment.yaml  # PostgreSQL и Redis
kubectl apply -f rabbitmq-deployment.yaml

# 4. Backend services
kubectl apply -f blockchain-service.yaml
kubectl apply -f wallet-service-deployment.yaml
kubectl apply -f scheduler-service.yaml

# 5. Frontend
kubectl apply -f frontend-deployment.yaml

# 6. Monitoring
kubectl apply -f monitoring.yaml
kubectl apply -f monitoring-service-deployment.yaml

# 7. Autoscaling
kubectl apply -f vertical-pod-autoscaler.yaml

# 8. Ingress
kubectl apply -f production-ingress.yaml
```

## 🔧 Конфигурация

### Secrets настройка

Перед развертыванием **ОБЯЗАТЕЛЬНО** настройте следующие секреты в `production-secrets.yaml`:

```yaml
# База данных
DB_PASSWORD: "ваш-надежный-пароль-бд"
REDIS_PASSWORD: "ваш-надежный-redis-пароль"

# Шифрование
ENCRYPTION_KEY: "32-байтовый-ключ-шифрования"
MASTER_KEY: "мастер-ключ-для-чувствительных-данных"

# Блокчейн RPC
BTC_RPC_PASSWORD: "ваш-bitcoin-rpc-пароль"
ETH_RPC_URL: "https://mainnet.infura.io/v3/ваш-проект-id"

# Vault/HSM
VAULT_TOKEN: "ваш-vault-токен"
HSM_PIN: "ваш-hsm-пин"
```

### Домены и SSL

Настройте ваши домены в `production-ingress.yaml`:

```yaml
spec:
  tls:
  - hosts:
    - mixer.ваш-домен.com
    - api.mixer.ваш-домен.com
    secretName: mixer-tls-cert
```

## 📊 Автоскейлинг

### Horizontal Pod Autoscaler (HPA)

Каждый сервис настроен с HPA:

| Сервис | Min реплик | Max реплик | CPU цель | Memory цель |
|--------|------------|------------|----------|-------------|
| Frontend | 3 | 15 | 60% | 70% |
| Mixer API | 3 | 10 | 70% | 80% |
| Blockchain Service | 2 | 8 | 75% | 80% |
| Wallet Service | 2 | 6 | 75% | 80% |
| Scheduler Service | 1 | 3 | 80% | 85% |

### Vertical Pod Autoscaler (VPA)

VPA автоматически оптимизирует resource requests/limits:

```bash
# Проверка рекомендаций VPA
kubectl describe vpa mixer-api-vpa -n crypto-mixer
```

## 🛡️ Безопасность

### Network Policies

Все сервисы защищены Network Policies:
- Wallet Service имеет самые строгие ограничения
- API сервисы могут общаться только с необходимыми компонентами
- Мониторинг изолирован от основных сервисов

### Security Contexts

Все контейнеры запускаются:
- Как non-root пользователи
- С read-only root filesystem
- Без privilege escalation
- С минимальными capabilities

### Pod Disruption Budgets

Настроены PDB для всех критичных сервисов для обеспечения высокой доступности во время обновлений.

## 📈 Мониторинг

### Доступ к интерфейсам

После развертывания доступны:

- **Grafana**: https://grafana.mixer.yourdomain.com
- **Prometheus**: https://prometheus.mixer.yourdomain.com  
- **Alertmanager**: https://alertmanager.mixer.yourdomain.com

### Готовые дашборды

- Crypto Mixer Overview - общая статистика
- Services Health - состояние сервисов
- Security Dashboard - метрики безопасности
- Business Metrics - бизнес показатели

### Алерты

Настроены алерты для:
- Высокое использование CPU/Memory (80%+)
- Медленные ответы API (>2s)
- Высокий error rate (>5%)
- Проблемы с блокчейн подключениями
- Проблемы безопасности

## 🔍 Управление и отладка

### Полезные команды

```bash
# Статус развертывания
kubectl get all -n crypto-mixer

# Логи сервиса
kubectl logs -f deployment/mixer-api -n crypto-mixer

# Подключение к контейнеру
kubectl exec -it deployment/mixer-api -n crypto-mixer -- /bin/sh

# Проверка автоскейлинга
kubectl get hpa -n crypto-mixer
kubectl describe hpa mixer-api-hpa -n crypto-mixer

# Метрики ресурсов
kubectl top pods -n crypto-mixer
kubectl top nodes

# Health checks
kubectl get endpoints -n crypto-mixer
```

### Troubleshooting

#### Под не запускается
```bash
# Проверка событий
kubectl describe pod <pod-name> -n crypto-mixer

# Проверка логов
kubectl logs <pod-name> -n crypto-mixer --previous
```

#### Проблемы с сетью
```bash
# Проверка Network Policies
kubectl get networkpolicies -n crypto-mixer

# Тест подключения
kubectl exec -it deployment/mixer-api -n crypto-mixer -- nc -zv postgres-service 5432
```

#### Проблемы с автоскейлингом
```bash
# Проверка Metrics Server
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes
kubectl get --raw /apis/metrics.k8s.io/v1beta1/pods

# Статус HPA
kubectl describe hpa -n crypto-mixer
```

## 🔄 Обновления и CI/CD

### Rolling Updates

Все Deployment'ы настроены для rolling updates:
- `maxSurge: 1` - создается 1 дополнительный под
- `maxUnavailable: 0` - нет downtime

### Обновление сервиса

```bash
# Обновление образа
kubectl set image deployment/mixer-api mixer-api=crypto-mixer/mixer-api:v2.0.0 -n crypto-mixer

# Откат обновления
kubectl rollout undo deployment/mixer-api -n crypto-mixer

# Статус обновления
kubectl rollout status deployment/mixer-api -n crypto-mixer
```

## 📋 Чеклист продакшн готовности

### Перед развертыванием
- [ ] Все секреты настроены (без CHANGE_ME)
- [ ] Домены настроены в Ingress
- [ ] SSL сертификаты настроены
- [ ] Backup стратегия определена
- [ ] Monitoring и алерты настроены
- [ ] Network policies проверены
- [ ] Resource limits установлены

### После развертывания
- [ ] Все поды в состоянии Running
- [ ] Health checks проходят
- [ ] HPA работает корректно
- [ ] Мониторинг собирает метрики
- [ ] Алерты доставляются
- [ ] Load testing выполнен
- [ ] Backup/restore протестированы

## 🆘 Поддержка

### Логи и метрики
- Централизованное логирование через Prometheus
- Метрики доступны в Grafana
- Алерты через Alertmanager

### Контакты поддержки
- DevOps: ops-team@yourdomain.com
- Security: security@yourdomain.com
- Emergency: emergency@yourdomain.com

## 📚 Дополнительная документация

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [Prometheus Operator](https://prometheus-operator.dev/)
- [Cert-Manager](https://cert-manager.io/docs/)