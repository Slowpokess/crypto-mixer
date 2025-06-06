#!/bin/bash
# Очистка логов старше 24 часов
find /var/log/mixer -name "*.log" -mtime +1 -delete

# Очистка сессий из БД
psql -U mixer_user -d mixer_db -c "DELETE FROM mix_requests WHERE expires_at < NOW();"