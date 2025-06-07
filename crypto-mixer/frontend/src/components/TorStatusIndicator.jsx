import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Collapse,
  Grid,
  Alert,
  Button,
  Fade,
  useTheme,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  VpnLock as VpnLockIcon,
  Error as ErrorIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  Speed as SpeedIcon,
  Public as PublicIcon,
  Shield as ShieldIcon,
  Router as RouterIcon,
} from '@mui/icons-material';
import { themeHelpers } from '../theme/theme';

/**
 * Компонент индикатора статуса Tor для пользовательского интерфейса
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Расширенный индикатор Tor статуса с:
 * - Реальным временем мониторинга Tor соединения
 * - Визуализацией уровня анонимности
 * - Информацией о hidden service адресе
 * - Статистикой производительности
 * - Возможностью принудительной ротации цепочек
 * - Красивой анимированной визуализацией
 */

const TorStatusIndicator = ({ 
  position = 'bottom-right', 
  minimal = false,
  showDetails = true 
}) => {
  const theme = useTheme();
  const [torStatus, setTorStatus] = useState({
    isConnected: false,
    connectionType: 'unknown', // 'tor', 'direct', 'unknown'
    circuitCount: 0,
    onionAddress: null,
    responseTime: 0,
    anonymityLevel: 'unknown', // 'high', 'medium', 'low', 'none'
    lastUpdate: new Date(),
    errors: [],
  });

  const [expanded, setExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [healthScore, setHealthScore] = useState(0);

  // Периодическое обновление статуса
  useEffect(() => {
    checkTorStatus();
    
    const interval = setInterval(() => {
      checkTorStatus();
    }, 10000); // Каждые 10 секунд

    return () => clearInterval(interval);
  }, []);

  /**
   * Проверка статуса Tor соединения
   */
  const checkTorStatus = async () => {
    try {
      setIsLoading(true);

      // Проверяем соединение через API endpoint
      const response = await fetch('/api/tor/status', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        updateTorStatus(data);
      } else {
        // Если API недоступен, пытаемся определить статус по другим признакам
        await detectTorByIP();
      }

    } catch (error) {
      console.warn('Не удалось получить статус Tor:', error);
      await detectTorByIP();
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Определение Tor по IP адресу
   */
  const detectTorByIP = async () => {
    try {
      // Проверяем через Tor Project API
      const response = await fetch('https://check.torproject.org/api/ip', {
        timeout: 5000,
      });
      
      if (response.ok) {
        const data = await response.json();
        
        setTorStatus(prev => ({
          ...prev,
          isConnected: data.IsTor || false,
          connectionType: data.IsTor ? 'tor' : 'direct',
          anonymityLevel: data.IsTor ? 'high' : 'none',
          lastUpdate: new Date(),
        }));
      }
    } catch (error) {
      // Если не удается определить, показываем неизвестный статус
      setTorStatus(prev => ({
        ...prev,
        isConnected: false,
        connectionType: 'unknown',
        anonymityLevel: 'unknown',
        lastUpdate: new Date(),
        errors: [...prev.errors.slice(-2), error.message],
      }));
    }
  };

  /**
   * Обновление статуса на основе данных от сервера
   */
  const updateTorStatus = (data) => {
    const anonymityLevel = calculateAnonymityLevel(data);
    const healthScore = calculateHealthScore(data);

    setTorStatus({
      isConnected: data.isConnected || false,
      connectionType: data.connectionType || 'unknown',
      circuitCount: data.circuitCount || 0,
      onionAddress: data.onionAddress || null,
      responseTime: data.averageResponseTime || 0,
      anonymityLevel,
      lastUpdate: new Date(),
      errors: data.errors || [],
    });

    setHealthScore(healthScore);
  };

  /**
   * Расчет уровня анонимности
   */
  const calculateAnonymityLevel = (data) => {
    if (!data.isConnected) return 'none';
    
    if (data.connectionType === 'tor') {
      if (data.circuitCount >= 3 && data.onionAddress) {
        return 'high';
      } else if (data.circuitCount >= 1) {
        return 'medium';
      } else {
        return 'low';
      }
    }
    
    return 'none';
  };

  /**
   * Расчет общего показателя здоровья
   */
  const calculateHealthScore = (data) => {
    let score = 0;
    
    if (data.isConnected) score += 40;
    if (data.connectionType === 'tor') score += 30;
    if (data.circuitCount >= 3) score += 20;
    if (data.onionAddress) score += 10;
    
    return Math.min(score, 100);
  };

  /**
   * Принудительная ротация цепочек
   */
  const rotateCircuits = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/tor/rotate', {
        method: 'POST',
      });

      if (response.ok) {
        // Ждем немного и обновляем статус
        setTimeout(() => {
          checkTorStatus();
        }, 3000);
      }
    } catch (error) {
      console.error('Ошибка ротации цепочек:', error);
    }
  };

  /**
   * Получение цвета статуса
   */
  const getStatusColor = () => {
    switch (torStatus.anonymityLevel) {
      case 'high': return theme.palette.success.main;
      case 'medium': return theme.palette.warning.main;
      case 'low': return theme.palette.error.main;
      case 'none': return theme.palette.error.main;
      default: return theme.palette.text.secondary;
    }
  };

  /**
   * Получение иконки статуса
   */
  const getStatusIcon = () => {
    switch (torStatus.anonymityLevel) {
      case 'high': return <VpnLockIcon sx={{ color: 'success.main' }} />;
      case 'medium': return <SecurityIcon sx={{ color: 'warning.main' }} />;
      case 'low': return <WarningIcon sx={{ color: 'error.main' }} />;
      case 'none': return <PublicIcon sx={{ color: 'error.main' }} />;
      default: return <ErrorIcon sx={{ color: 'text.secondary' }} />;
    }
  };

  /**
   * Получение текста статуса
   */
  const getStatusText = () => {
    switch (torStatus.anonymityLevel) {
      case 'high': return 'Максимальная анонимность';
      case 'medium': return 'Средняя анонимность';
      case 'low': return 'Низкая анонимность';
      case 'none': return 'Без анонимности';
      default: return 'Проверяем статус...';
    }
  };

  /**
   * Получение описания статуса
   */
  const getStatusDescription = () => {
    switch (torStatus.anonymityLevel) {
      case 'high': 
        return 'Вы подключены через Tor с множественными цепочками. Ваш IP скрыт и трафик зашифрован.';
      case 'medium': 
        return 'Tor соединение активно, но количество цепочек ограничено.';
      case 'low': 
        return 'Tor соединение нестабильно. Рекомендуется обновить соединение.';
      case 'none': 
        return 'Вы подключены напрямую без использования Tor. Ваш IP виден.';
      default: 
        return 'Определяем тип подключения...';
    }
  };

  // Стили позиционирования
  const getPositionStyles = () => {
    const base = {
      position: 'fixed',
      zIndex: 1300,
    };

    switch (position) {
      case 'top-left':
        return { ...base, top: 20, left: 20 };
      case 'top-right':
        return { ...base, top: 20, right: 20 };
      case 'bottom-left':
        return { ...base, bottom: 20, left: 20 };
      case 'bottom-right':
      default:
        return { ...base, bottom: 20, right: 20 };
    }
  };

  if (minimal) {
    return (
      <Tooltip title={getStatusText()} arrow>
        <Chip
          icon={getStatusIcon()}
          label={torStatus.connectionType === 'tor' ? 'TOR' : 'DIRECT'}
          size=\"small\"
          sx={{
            backgroundColor: `${getStatusColor()}20`,
            color: getStatusColor(),
            border: `1px solid ${getStatusColor()}40`,
            fontWeight: 600,
          }}
        />
      </Tooltip>
    );
  }

  return (
    <Box sx={getPositionStyles()}>
      <Fade in={true}>
        <Card
          sx={{
            minWidth: expanded ? 400 : 200,
            maxWidth: 500,
            ...themeHelpers.glass(0.9),
            border: `1px solid ${getStatusColor()}40`,
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: `0 8px 32px ${getStatusColor()}40`,
            },
          }}
        >
          <CardContent sx={{ p: 2 }}>
            {/* Основной индикатор */}
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                cursor: showDetails ? 'pointer' : 'default',
              }}
              onClick={showDetails ? () => setExpanded(!expanded) : undefined}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {getStatusIcon()}
                <Box>
                  <Typography variant=\"body2\" sx={{ fontWeight: 600 }}>
                    {getStatusText()}
                  </Typography>
                  <Typography variant=\"caption\" sx={{ color: 'text.secondary' }}>
                    {torStatus.connectionType.toUpperCase()} • {torStatus.circuitCount} цепочек
                  </Typography>
                </Box>
              </Box>

              {showDetails && (
                <IconButton size=\"small\">
                  {expanded ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
              )}
            </Box>

            {/* Индикатор здоровья */}
            <Box sx={{ mt: 1 }}>
              <LinearProgress
                variant=\"determinate\"
                value={isLoading ? 0 : healthScore}
                sx={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: getStatusColor(),
                    borderRadius: 2,
                  },
                }}
              />
              <Typography variant=\"caption\" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Здоровье соединения: {healthScore}%
              </Typography>
            </Box>

            {/* Детальная информация */}
            <Collapse in={expanded}>
              <Box sx={{ mt: 2 }}>
                <Typography variant=\"body2\" sx={{ mb: 2, color: 'text.secondary' }}>
                  {getStatusDescription()}
                </Typography>

                {/* Статистика */}
                <Grid container spacing={1} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center', p: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1 }}>
                      <SpeedIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                      <Typography variant=\"caption\" sx={{ display: 'block' }}>
                        Отклик
                      </Typography>
                      <Typography variant=\"body2\" sx={{ fontWeight: 600 }}>
                        {torStatus.responseTime}ms
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center', p: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1 }}>
                      <RouterIcon sx={{ color: 'primary.main', mb: 0.5 }} />
                      <Typography variant=\"caption\" sx={{ display: 'block' }}>
                        Цепочки
                      </Typography>
                      <Typography variant=\"body2\" sx={{ fontWeight: 600 }}>
                        {torStatus.circuitCount}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>

                {/* Onion адрес */}
                {torStatus.onionAddress && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant=\"caption\" sx={{ color: 'text.secondary' }}>
                      Hidden Service:
                    </Typography>
                    <Box
                      sx={{
                        p: 1,
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        wordBreak: 'break-all',
                        mt: 0.5,
                      }}
                    >
                      {torStatus.onionAddress}
                    </Box>
                  </Box>
                )}

                {/* Ошибки */}
                {torStatus.errors.length > 0 && (
                  <Alert severity=\"warning\" sx={{ mb: 2, fontSize: '0.75rem' }}>
                    <Typography variant=\"caption\">
                      Последние проблемы: {torStatus.errors.slice(-1)[0]}
                    </Typography>
                  </Alert>
                )}

                {/* Действия */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size=\"small\"
                    startIcon={<RefreshIcon />}
                    onClick={checkTorStatus}
                    disabled={isLoading}
                    variant=\"outlined\"
                    sx={{
                      borderColor: 'primary.main',
                      color: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'rgba(124, 58, 237, 0.1)',
                      },
                    }}
                  >
                    Обновить
                  </Button>

                  {torStatus.connectionType === 'tor' && (
                    <Button
                      size=\"small\"
                      startIcon={<ShieldIcon />}
                      onClick={rotateCircuits}
                      disabled={isLoading}
                      variant=\"outlined\"
                      sx={{
                        borderColor: 'success.main',
                        color: 'success.main',
                        '&:hover': {
                          backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        },
                      }}
                    >
                      Новые цепочки
                    </Button>
                  )}
                </Box>

                {/* Последнее обновление */}
                <Typography variant=\"caption\" sx={{ color: 'text.secondary', mt: 1, display: 'block' }}>
                  Обновлено: {torStatus.lastUpdate.toLocaleTimeString()}
                </Typography>
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      </Fade>
    </Box>
  );
};

export default TorStatusIndicator;