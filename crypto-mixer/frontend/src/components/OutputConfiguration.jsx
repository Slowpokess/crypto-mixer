import React, { useState } from 'react';
import {
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  TextField,
  Button,
  IconButton,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Divider,
  Chip,
  Tooltip,
  Fade,
  Zoom,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  Shuffle as ShuffleIcon,
  Security as SecurityIcon,
  AccountBalanceWallet as WalletIcon,
  AccessTime as TimeIcon,
  AutoFixHigh as MagicIcon,
} from '@mui/icons-material';
import { themeHelpers } from '../theme/theme';

/**
 * Компонент настройки выходных адресов и параметров микширования
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Современный компонент с:
 * - Динамическим добавлением/удалением адресов
 * - Настройкой задержки и процентного распределения
 * - Красивыми анимациями и валидацией
 * - Интуитивным интерфейсом для сложных настроек
 */
const OutputConfiguration = ({
  currency,
  outputAddresses,
  setOutputAddresses,
  delay,
  setDelay,
  error,
  loading,
  onBack,
  onSubmit,
}) => {
  const [percentages, setPercentages] = useState([100]);
  const [customDelay, setCustomDelay] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Предустановленные варианты задержки
  const delayOptions = [
    { value: 0, label: 'Мгновенно', desc: 'Без задержки', icon: '⚡' },
    { value: 1, label: '1 час', desc: 'Быстро и надёжно', icon: '🚀' },
    { value: 6, label: '6 часов', desc: 'Рекомендуется', icon: '✨' },
    { value: 24, label: '24 часа', desc: 'Максимальная приватность', icon: '🛡️' },
    { value: 72, label: '3 дня', desc: 'Экстра безопасность', icon: '🔒' },
    { value: -1, label: 'Настроить', desc: 'Свой интервал', icon: '⚙️' },
  ];

  const addAddress = () => {
    setOutputAddresses([...outputAddresses, '']);
    // Автоматически распределяем проценты поровну
    const newCount = outputAddresses.length + 1;
    const equalPercentage = Math.floor(100 / newCount);
    const newPercentages = new Array(newCount).fill(equalPercentage);
    // Добавляем остаток к первому адресу
    newPercentages[0] += 100 - (equalPercentage * newCount);
    setPercentages(newPercentages);
  };

  const removeAddress = (index) => {
    if (outputAddresses.length <= 1) return;
    
    const newAddresses = outputAddresses.filter((_, i) => i !== index);
    setOutputAddresses(newAddresses);
    
    // Перераспределяем проценты
    const newPercentages = percentages.filter((_, i) => i !== index);
    const remainingSum = newPercentages.reduce((sum, p) => sum + p, 0);
    if (remainingSum < 100 && newPercentages.length > 0) {
      newPercentages[0] += 100 - remainingSum;
    }
    setPercentages(newPercentages);
  };

  const updateAddress = (index, value) => {
    const newAddresses = [...outputAddresses];
    newAddresses[index] = value;
    setOutputAddresses(newAddresses);
  };

  const updatePercentage = (index, value) => {
    const newPercentages = [...percentages];
    newPercentages[index] = value;
    setPercentages(newPercentages);
  };

  const distributeEvenly = () => {
    const count = outputAddresses.length;
    const evenPercentage = Math.floor(100 / count);
    const newPercentages = new Array(count).fill(evenPercentage);
    // Добавляем остаток к первому адресу
    newPercentages[0] += 100 - (evenPercentage * count);
    setPercentages(newPercentages);
  };

  const randomizePercentages = () => {
    const count = outputAddresses.length;
    let remaining = 100;
    const newPercentages = [];
    
    for (let i = 0; i < count - 1; i++) {
      const maxForThis = remaining - (count - i - 1) * 5; // Минимум 5% для остальных
      const percentage = Math.floor(Math.random() * (maxForThis - 5) + 5);
      newPercentages.push(percentage);
      remaining -= percentage;
    }
    newPercentages.push(remaining);
    
    setPercentages(newPercentages);
  };

  const getTotalPercentage = () => {
    return percentages.reduce((sum, p) => sum + p, 0);
  };

  const isValidConfiguration = () => {
    const validAddresses = outputAddresses.filter(addr => addr.trim() !== '');
    const totalPercentage = getTotalPercentage();
    return validAddresses.length > 0 && totalPercentage === 100;
  };

  return (
    <Box>
      <Typography 
        variant="h4" 
        sx={{ 
          mb: 3, 
          fontWeight: 600,
          ...themeHelpers.gradientText(),
        }}
      >
        Настройка вывода средств
      </Typography>

      {/* Выходные адреса */}
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
            <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }}>
              Адреса получения
            </Typography>
            <Tooltip title="Добавить адрес">
              <IconButton
                onClick={addAddress}
                disabled={outputAddresses.length >= 10}
                sx={{
                  color: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                  },
                }}
              >
                <AddIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {outputAddresses.map((address, index) => (
            <Zoom in={true} timeout={300 + index * 100} key={index}>
              <Card
                sx={{
                  mb: 2,
                  background: 'rgba(45, 45, 68, 0.6)',
                  border: '1px solid rgba(124, 58, 237, 0.1)',
                }}
              >
                <CardContent sx={{ p: 2 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={8}>
                      <TextField
                        fullWidth
                        label={`Адрес ${index + 1}`}
                        value={address}
                        onChange={(e) => updateAddress(index, e.target.value)}
                        placeholder={`Введите ${currency} адрес...`}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {currency}
                              </Typography>
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            fontFamily: 'monospace',
                            fontSize: '0.9rem',
                          },
                        }}
                      />
                    </Grid>
                    <Grid item xs={8} md={3}>
                      <TextField
                        fullWidth
                        type="number"
                        label="Процент"
                        value={percentages[index] || 0}
                        onChange={(e) => updatePercentage(index, parseInt(e.target.value) || 0)}
                        inputProps={{
                          min: 1,
                          max: 100,
                        }}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">%</InputAdornment>
                          ),
                        }}
                      />
                    </Grid>
                    <Grid item xs={4} md={1}>
                      <Tooltip title="Удалить адрес">
                        <span>
                          <IconButton
                            onClick={() => removeAddress(index)}
                            disabled={outputAddresses.length <= 1}
                            sx={{
                              color: 'error.main',
                              '&:hover': {
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                              },
                            }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Zoom>
          ))}

          {/* Быстрые действия для процентов */}
          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<MagicIcon />}
              onClick={distributeEvenly}
              sx={{ borderRadius: 2 }}
            >
              Поровну
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ShuffleIcon />}
              onClick={randomizePercentages}
              sx={{ borderRadius: 2 }}
            >
              Случайно
            </Button>
            <Chip
              label={`Итого: ${getTotalPercentage()}%`}
              color={getTotalPercentage() === 100 ? 'success' : 'error'}
              sx={{ ml: 'auto' }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Настройка задержки */}
      <Card
        sx={{
          mb: 4,
          ...themeHelpers.glass(0.8),
          border: '1px solid rgba(124, 58, 237, 0.2)',
        }}
      >
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <TimeIcon sx={{ color: 'primary.main', mr: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Задержка микширования
            </Typography>
          </Box>

          <Grid container spacing={2}>
            {delayOptions.map((option, index) => (
              <Grid item xs={6} sm={4} md={2} key={option.value}>
                <Card
                  onClick={() => {
                    if (option.value === -1) {
                      setCustomDelay(true);
                    } else {
                      setDelay(option.value);
                      setCustomDelay(false);
                    }
                  }}
                  sx={{
                    cursor: 'pointer',
                    textAlign: 'center',
                    background: (delay === option.value && !customDelay) || (customDelay && option.value === -1)
                      ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(236, 72, 153, 0.2))'
                      : 'rgba(45, 45, 68, 0.6)',
                    border: (delay === option.value && !customDelay) || (customDelay && option.value === -1)
                      ? '2px solid #7C3AED'
                      : '1px solid rgba(124, 58, 237, 0.2)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      border: '2px solid #7C3AED',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="h4" sx={{ mb: 1 }}>
                      {option.icon}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {option.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {option.desc}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {customDelay && (
            <Fade in={customDelay}>
              <Box sx={{ mt: 3 }}>
                <Typography variant="body2" sx={{ mb: 2 }}>
                  Настроить собственную задержку (часы):
                </Typography>
                <Slider
                  value={delay}
                  onChange={(e, value) => setDelay(value)}
                  min={0}
                  max={168} // 7 дней
                  step={1}
                  marks={[
                    { value: 0, label: '0ч' },
                    { value: 24, label: '1д' },
                    { value: 72, label: '3д' },
                    { value: 168, label: '7д' },
                  ]}
                  valueLabelDisplay="auto"
                  sx={{
                    '& .MuiSlider-thumb': {
                      background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                    },
                    '& .MuiSlider-track': {
                      background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                    },
                  }}
                />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Выбрано: {delay} {delay === 1 ? 'час' : delay < 5 ? 'часа' : 'часов'}
                </Typography>
              </Box>
            </Fade>
          )}
        </CardContent>
      </Card>

      {/* Дополнительные настройки безопасности */}
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
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Параметры безопасности
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, background: 'rgba(16, 185, 129, 0.1)', borderRadius: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  🔒 Уровень приватности: Максимальный
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Все транзакции будут полностью анонимизированы
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, background: 'rgba(59, 130, 246, 0.1)', borderRadius: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                  🛡️ Защита от анализа: Включена
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Дополнительные меры против blockchain анализа
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Ошибки валидации */}
      {!isValidConfiguration() && (
        <Fade in={true}>
          <Alert
            severity="warning"
            sx={{
              mb: 3,
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
            }}
          >
            {getTotalPercentage() !== 100 
              ? `Сумма процентов должна равняться 100% (текущая: ${getTotalPercentage()}%)`
              : 'Добавьте хотя бы один валидный адрес'
            }
          </Alert>
        </Fade>
      )}

      {/* Кнопки управления */}
      <Box sx={{ display: 'flex', gap: 2, mt: 4 }}>
        <Button
          variant="outlined"
          size="large"
          onClick={onBack}
          sx={{
            flex: 1,
            py: 2,
            borderColor: 'primary.main',
            color: 'primary.main',
            '&:hover': {
              borderColor: 'primary.light',
              backgroundColor: 'rgba(124, 58, 237, 0.1)',
            },
          }}
        >
          Назад
        </Button>
        <Button
          variant="contained"
          size="large"
          onClick={onSubmit}
          disabled={loading || !isValidConfiguration()}
          sx={{
            flex: 2,
            py: 2,
            fontSize: '1.1rem',
            fontWeight: 600,
            background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
            '&:hover': {
              background: 'linear-gradient(135deg, #6D28D9, #DB2777)',
              transform: 'translateY(-2px)',
              boxShadow: '0px 8px 32px rgba(124, 58, 237, 0.6)',
            },
            '&:disabled': {
              background: 'rgba(124, 58, 237, 0.3)',
              color: 'rgba(255, 255, 255, 0.5)',
            },
          }}
        >
          {loading ? 'Обработка...' : 'Начать микширование'}
        </Button>
      </Box>
    </Box>
  );
};

export default OutputConfiguration;