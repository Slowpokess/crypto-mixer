import React, { useState } from 'react';
import {
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  Button,
  LinearProgress,
  Chip,
  Alert,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Fade,
  Slide,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
  Loop as LoopIcon,
  ContentCopy as CopyIcon,
  Refresh as RefreshIcon,
  Security as SecurityIcon,
  SendToMobile as SendIcon,
  AccountBalanceWallet as WalletIcon,
} from '@mui/icons-material';
import { themeHelpers } from '../theme/theme';

/**
 * Компонент отслеживания статуса микширования
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Современный компонент с:
 * - Детальным отслеживанием процесса микширования
 * - Красивыми анимированными индикаторами прогресса
 * - Удобными функциями копирования адресов
 * - Пошаговым отображением статуса операций
 * - Профессиональным дизайном для продакшн
 */
const MixingStatus = ({ 
  currency, 
  mixRequest, 
  status, 
  onNewMix 
}) => {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const [copyingField, setCopyingField] = useState('');
  
  const depositInfo = mixRequest || status;

  // Функция копирования в буфер обмена
  const copyToClipboard = async (text, field = '') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyingField(field);
      setTimeout(() => {
        setCopied(false);
        setCopyingField('');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Получение цвета статуса
  const getStatusColor = (currentStatus) => {
    switch (currentStatus) {
      case 'COMPLETED':
        return 'success';
      case 'PROCESSING':
      case 'MIXING':
        return 'warning';
      case 'FAILED':
        return 'error';
      default:
        return 'info';
    }
  };

  // Получение иконки статуса
  const getStatusIcon = (currentStatus) => {
    switch (currentStatus) {
      case 'COMPLETED':
        return <CheckIcon sx={{ color: 'success.main' }} />;
      case 'PROCESSING':
      case 'MIXING':
        return <LoopIcon sx={{ color: 'warning.main', animation: 'spin 2s linear infinite' }} />;
      case 'FAILED':
        return <ErrorIcon sx={{ color: 'error.main' }} />;
      default:
        return <ScheduleIcon sx={{ color: 'info.main' }} />;
    }
  };

  // Получение прогресса (в процентах)
  const getProgress = () => {
    if (!status) return 0;
    
    switch (status.status) {
      case 'PENDING':
        return 10;
      case 'RECEIVED':
        return 30;
      case 'PROCESSING':
        return 50;
      case 'MIXING':
        return 70;
      case 'COMPLETED':
        return 100;
      case 'FAILED':
        return 0;
      default:
        return 0;
    }
  };

  // Шаги процесса микширования
  const mixingSteps = [
    {
      label: 'Ожидание депозита',
      description: 'Переведите средства на указанный адрес',
      status: status?.status === 'PENDING' ? 'active' : status?.status ? 'completed' : 'pending'
    },
    {
      label: 'Подтверждение транзакции',
      description: 'Ожидание подтверждений в блокчейне',
      status: ['RECEIVED', 'PROCESSING'].includes(status?.status) ? 'active' : 
              ['MIXING', 'COMPLETED'].includes(status?.status) ? 'completed' : 'pending'
    },
    {
      label: 'Процесс микширования',
      description: 'Анонимизация и перемешивание средств',
      status: status?.status === 'MIXING' ? 'active' : 
              status?.status === 'COMPLETED' ? 'completed' : 'pending'
    },
    {
      label: 'Завершение',
      description: 'Отправка средств на ваши адреса',
      status: status?.status === 'COMPLETED' ? 'completed' : 'pending'
    },
  ];

  const getStepIcon = (stepStatus) => {
    switch (stepStatus) {
      case 'completed':
        return <CheckIcon sx={{ color: 'success.main' }} />;
      case 'active':
        return <LoopIcon sx={{ color: 'primary.main', animation: 'spin 2s linear infinite' }} />;
      default:
        return <ScheduleIcon sx={{ color: 'text.secondary' }} />;
    }
  };

  return (
    <Fade in={true} timeout={800}>
      <Box>
        <Typography 
          variant="h4" 
          sx={{ 
            mb: 3, 
            fontWeight: 600,
            ...themeHelpers.gradientText(),
          }}
        >
          Статус микширования
        </Typography>

        {/* Общий прогресс */}
        <Card
          sx={{
            mb: 4,
            ...themeHelpers.glass(0.8),
            border: '1px solid rgba(124, 58, 237, 0.2)',
          }}
        >
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SecurityIcon sx={{ color: 'primary.main', mr: 1 }} />
              <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }}>
                Прогресс операции
              </Typography>
              {status && (
                <Chip
                  icon={getStatusIcon(status.status)}
                  label={status.status}
                  color={getStatusColor(status.status)}
                  variant="outlined"
                />
              )}
            </Box>
            
            <LinearProgress
              variant="determinate"
              value={getProgress()}
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: 'rgba(124, 58, 237, 0.2)',
                '& .MuiLinearProgress-bar': {
                  background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                  borderRadius: 4,
                },
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1 }}>
              {getProgress()}% завершено
            </Typography>
          </CardContent>
        </Card>

        {/* Информация о депозите */}
        {depositInfo?.depositAddress && (
          <Slide direction="up" in={true} timeout={600}>
            <Card
              sx={{
                mb: 4,
                ...themeHelpers.glass(0.8),
                border: '1px solid rgba(124, 58, 237, 0.2)',
              }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <WalletIcon sx={{ color: 'primary.main', mr: 1 }} />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Информация для депозита
                  </Typography>
                </Box>

                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Box
                      sx={{
                        p: 3,
                        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(236, 72, 153, 0.1))',
                        borderRadius: 2,
                        border: '1px solid rgba(124, 58, 237, 0.3)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>
                        Отправьте точно:
                      </Typography>
                      <Typography 
                        variant="h4" 
                        sx={{ 
                          fontWeight: 700,
                          color: 'primary.main',
                          mb: 1,
                        }}
                      >
                        {depositInfo.amount} {currency}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Точная сумма обязательна
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box
                      sx={{
                        p: 3,
                        background: 'rgba(45, 45, 68, 0.6)',
                        borderRadius: 2,
                        border: '1px solid rgba(124, 58, 237, 0.2)',
                      }}
                    >
                      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1 }}>
                        На адрес:
                      </Typography>
                      <Box
                        sx={{
                          p: 2,
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: 1,
                          fontFamily: 'monospace',
                          fontSize: '0.9rem',
                          wordBreak: 'break-all',
                          mb: 2,
                          border: '1px solid rgba(124, 58, 237, 0.1)',
                        }}
                      >
                        {depositInfo.depositAddress}
                      </Box>
                      
                      <Button
                        fullWidth
                        variant="outlined"
                        startIcon={copied && copyingField === 'address' ? <CheckIcon /> : <CopyIcon />}
                        onClick={() => copyToClipboard(depositInfo.depositAddress, 'address')}
                        sx={{
                          borderColor: 'primary.main',
                          color: copied && copyingField === 'address' ? 'success.main' : 'primary.main',
                          '&:hover': {
                            borderColor: 'primary.light',
                            backgroundColor: 'rgba(124, 58, 237, 0.1)',
                          },
                        }}
                      >
                        {copied && copyingField === 'address' ? 'Скопировано!' : 'Копировать адрес'}
                      </Button>
                    </Box>
                  </Grid>
                </Grid>

                {/* Session ID */}
                {depositInfo?.sessionId && (
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                      ID сессии (сохраните для восстановления):
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Box
                        sx={{
                          flex: 1,
                          p: 1.5,
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: 1,
                          fontFamily: 'monospace',
                          fontSize: '0.875rem',
                          border: '1px solid rgba(124, 58, 237, 0.1)',
                        }}
                      >
                        {depositInfo.sessionId}
                      </Box>
                      <Tooltip title="Копировать ID сессии">
                        <IconButton
                          onClick={() => copyToClipboard(depositInfo.sessionId, 'session')}
                          sx={{ color: 'primary.main' }}
                        >
                          {copied && copyingField === 'session' ? <CheckIcon /> : <CopyIcon />}
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Slide>
        )}

        {/* Детальный статус процесса */}
        <Card
          sx={{
            mb: 4,
            ...themeHelpers.glass(0.8),
            border: '1px solid rgba(124, 58, 237, 0.2)',
          }}
        >
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
              Этапы микширования
            </Typography>
            
            <Stepper orientation="vertical">
              {mixingSteps.map((step, index) => (
                <Step key={index} active={step.status === 'active'} completed={step.status === 'completed'}>
                  <StepLabel
                    icon={getStepIcon(step.status)}
                    sx={{
                      '& .MuiStepLabel-label': {
                        color: step.status === 'completed' ? 'success.main' : 
                               step.status === 'active' ? 'primary.main' : 'text.secondary',
                        fontWeight: step.status === 'active' ? 600 : 400,
                      },
                    }}
                  >
                    {step.label}
                  </StepLabel>
                  <StepContent>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      {step.description}
                    </Typography>
                    
                    {/* Дополнительная информация для текущего шага */}
                    {step.status === 'active' && status && (
                      <Box sx={{ mt: 2 }}>
                        {status.confirmations !== undefined && (
                          <Typography variant="body2" sx={{ color: 'warning.main' }}>
                            Подтверждения: {status.confirmations} / {status.requiredConfirmations || 6}
                          </Typography>
                        )}
                        {status.estimatedCompletion && (
                          <Typography variant="body2" sx={{ color: 'info.main' }}>
                            Ожидаемое завершение: {new Date(status.estimatedCompletion).toLocaleString()}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </StepContent>
                </Step>
              ))}
            </Stepper>
          </CardContent>
        </Card>

        {/* Предупреждения и инструкции */}
        <Alert
          severity="warning"
          sx={{
            mb: 4,
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Важные инструкции:
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0 }}>
            <li>Отправляйте точную сумму, указанную выше</li>
            <li>Транзакция истекает через 24 часа</li>
            <li>Сохраните ID сессии для восстановления</li>
            <li>Не закрывайте страницу до завершения процесса</li>
          </Box>
        </Alert>

        {/* Сообщение об успешном завершении */}
        {status?.status === 'COMPLETED' && (
          <Fade in={true}>
            <Alert
              severity="success"
              sx={{
                mb: 4,
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                🎉 Микширование успешно завершено!
              </Typography>
              <Typography variant="body2">
                Ваши средства были анонимно отправлены на указанные адреса.
                Все следы транзакций удалены из наших систем.
              </Typography>
            </Alert>
          </Fade>
        )}

        {/* Сообщение об ошибке */}
        {status?.status === 'FAILED' && (
          <Alert
            severity="error"
            sx={{
              mb: 4,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              Произошла ошибка
            </Typography>
            <Typography variant="body2">
              {status.error || 'Обратитесь в службу поддержки с ID сессии.'}
            </Typography>
          </Alert>
        )}

        {/* Действия */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          {status?.status !== 'COMPLETED' && (
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => window.location.reload()}
              sx={{
                borderColor: 'primary.main',
                color: 'primary.main',
                '&:hover': {
                  borderColor: 'primary.light',
                  backgroundColor: 'rgba(124, 58, 237, 0.1)',
                },
              }}
            >
              Обновить статус
            </Button>
          )}
          
          <Button
            variant="contained"
            fullWidth
            onClick={onNewMix}
            startIcon={<SendIcon />}
            sx={{
              py: 2,
              fontSize: '1.1rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
              '&:hover': {
                background: 'linear-gradient(135deg, #6D28D9, #DB2777)',
                transform: 'translateY(-2px)',
                boxShadow: '0px 8px 32px rgba(124, 58, 237, 0.6)',
              },
            }}
          >
            Начать новое микширование
          </Button>
        </Box>
      </Box>
    </Fade>
  );
};

export default MixingStatus;