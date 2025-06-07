import React, { useState } from 'react';
import {
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  TextField,
  Button,
  InputAdornment,
  Chip,
  Fade,
  Zoom,
  Tooltip,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { themeHelpers } from '../theme/theme';

/**
 * Компонент выбора криптовалюты и суммы с современным Material-UI дизайном
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Полностью переписанный компонент с:
 * - Красивыми карточками валют с иконками
 * - Анимированными переходами и hover эффектами
 * - Адаптивной сеткой для всех устройств
 * - Расширенной информацией о комиссиях
 * - Профессиональным внешним видом
 */
const CurrencySelector = ({ 
  currency, 
  setCurrency, 
  amount, 
  setAmount, 
  fees, 
  onNext 
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [selectedCurrencyInfo, setSelectedCurrencyInfo] = useState(null);

  // Информация о криптовалютах с иконками и цветами
  const currencies = [
    { 
      code: 'BTC', 
      name: 'Bitcoin', 
      icon: '₿',
      color: '#F7931A',
      description: 'Первая и самая популярная криптовалюта',
      features: ['🔒 Максимальная безопасность', '💎 Сохранение стоимости', '🌍 Глобальное принятие']
    },
    { 
      code: 'ETH', 
      name: 'Ethereum', 
      icon: 'Ξ',
      color: '#627EEA',
      description: 'Смарт-контракты и DeFi экосистема',
      features: ['⚡ Быстрые транзакции', '🏗️ Смарт-контракты', '💱 DeFi интеграция']
    },
    { 
      code: 'USDT', 
      name: 'Tether', 
      icon: '₮',
      color: '#26A17B',
      description: 'Стабильная монета привязанная к USD',
      features: ['📈 Стабильность цены', '💰 1:1 к доллару', '🏦 Резервы банков']
    },
    { 
      code: 'SOL', 
      name: 'Solana', 
      icon: '◎',
      color: '#14F195',
      description: 'Высокопроизводительный блокчейн',
      features: ['🚀 Сверхскорость', '💡 Низкие комиссии', '🎮 NFT и игры']
    },
    { 
      code: 'LTC', 
      name: 'Litecoin', 
      icon: 'Ł',
      color: '#BEBEBE',
      description: 'Серебро криптовалют',
      features: ['⚡ Быстрые платежи', '💸 Низкие комиссии', '⛏️ Проверенная сеть']
    },
    { 
      code: 'DASH', 
      name: 'Dash', 
      icon: 'Đ',
      color: '#008CE7',
      description: 'Цифровые деньги для ежедневного использования',
      features: ['🔐 PrivateSend', '⚡ InstantSend', '🎯 Простота использования']
    },
    { 
      code: 'ZEC', 
      name: 'Zcash', 
      icon: 'ⓩ',
      color: '#ECB244',
      description: 'Полная приватность по умолчанию',
      features: ['🛡️ Максимальная приватность', '🔬 Zero-knowledge', '🎭 Анонимность']
    },
    { 
      code: 'XMR', 
      name: 'Monero', 
      icon: 'ɱ',
      color: '#FF6600',
      description: 'Приватные и неотслеживаемые транзакции',
      features: ['🕵️ Полная анонимность', '🔒 Конфиденциальность', '💫 Неотслеживаемость']
    }
  ];

  const calculateFee = () => {
    if (!amount || !fees[currency]) return 0;
    const feePercent = fees[currency]?.percentage || 1.5;
    const minFee = fees[currency]?.minimum || 0;
    const calculatedFee = parseFloat(amount) * (feePercent / 100);
    return Math.max(calculatedFee, minFee).toFixed(8);
  };

  const calculateReceiveAmount = () => {
    if (!amount) return 0;
    const fee = calculateFee();
    const receiveAmount = parseFloat(amount) - parseFloat(fee);
    return Math.max(receiveAmount, 0).toFixed(8);
  };

  const handleCurrencySelect = (currencyData) => {
    setCurrency(currencyData.code);
    setSelectedCurrencyInfo(currencyData);
  };

  const renderCurrencyGrid = () => (
    <Grid container spacing={2} sx={{ mb: 4 }}>
      {currencies.map((curr, index) => (
        <Grid item xs={6} sm={4} md={3} key={curr.code}>
          <Zoom in={true} timeout={300 + index * 100}>
            <Card
              onClick={() => handleCurrencySelect(curr)}
              sx={{
                cursor: 'pointer',
                border: currency === curr.code 
                  ? `2px solid ${curr.color}` 
                  : '1px solid rgba(124, 58, 237, 0.2)',
                background: currency === curr.code 
                  ? `linear-gradient(135deg, ${curr.color}15, ${curr.color}25)`
                  : 'rgba(26, 27, 58, 0.6)',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease',
                transform: currency === curr.code ? 'scale(1.05)' : 'scale(1)',
                '&:hover': {
                  transform: 'scale(1.05) translateY(-4px)',
                  boxShadow: `0px 8px 32px ${curr.color}40`,
                  border: `2px solid ${curr.color}`,
                },
              }}
            >
              <CardContent sx={{ textAlign: 'center', p: 2 }}>
                <Box
                  sx={{
                    fontSize: '2rem',
                    mb: 1,
                    color: curr.color,
                    textShadow: `0px 0px 10px ${curr.color}80`,
                  }}
                >
                  {curr.icon}
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {curr.code}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  {curr.name}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Chip
                    size="small"
                    label={`${fees[curr.code]?.percentage || '1.5'}%`}
                    sx={{
                      fontSize: '0.6rem',
                      height: 20,
                      backgroundColor: `${curr.color}20`,
                      color: curr.color,
                      border: `1px solid ${curr.color}40`,
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Zoom>
        </Grid>
      ))}
    </Grid>
  );

  const selectedCurrency = currencies.find(c => c.code === currency);

  return (
    <Box sx={{ space: 4 }}>
      <Typography 
        variant="h4" 
        sx={{ 
          mb: 3, 
          fontWeight: 600,
          ...themeHelpers.gradientText(),
        }}
      >
        Выберите валюту и сумму
      </Typography>

      {/* Currency Selection Grid */}
      {renderCurrencyGrid()}

      {/* Selected Currency Info */}
      {selectedCurrency && (
        <Fade in={!!selectedCurrency}>
          <Card
            sx={{
              mb: 4,
              background: `linear-gradient(135deg, ${selectedCurrency.color}10, ${selectedCurrency.color}20)`,
              border: `1px solid ${selectedCurrency.color}40`,
              backdropFilter: 'blur(10px)',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Box
                  sx={{
                    fontSize: '2rem',
                    mr: 2,
                    color: selectedCurrency.color,
                  }}
                >
                  {selectedCurrency.icon}
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {selectedCurrency.name} ({selectedCurrency.code})
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {selectedCurrency.description}
                  </Typography>
                </Box>
              </Box>
              
              <Grid container spacing={1}>
                {selectedCurrency.features.map((feature, index) => (
                  <Grid item xs={12} sm={4} key={index}>
                    <Chip
                      label={feature}
                      size="small"
                      sx={{
                        backgroundColor: `${selectedCurrency.color}20`,
                        color: 'text.primary',
                        border: `1px solid ${selectedCurrency.color}40`,
                        fontSize: '0.75rem',
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Fade>
      )}

      {/* Amount Input */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 500 }}>
          Сумма для микширования
        </Typography>
        
        <TextField
          fullWidth
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`0.0 ${currency}`}
          inputProps={{
            step: "0.00000001",
            min: "0"
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <WalletIcon sx={{ color: 'primary.main' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {currency}
                </Typography>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '1.2rem',
              fontWeight: 500,
            },
          }}
        />

        {/* Fee Information */}
        {amount && parseFloat(amount) > 0 && (
          <Fade in={true}>
            <Card
              sx={{
                mt: 2,
                ...themeHelpers.glass(0.6),
                border: '1px solid rgba(124, 58, 237, 0.2)',
              }}
            >
              <CardContent sx={{ p: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Комиссия сервиса
                      </Typography>
                      <Typography variant="h6" sx={{ color: 'warning.main', fontWeight: 600 }}>
                        {calculateFee()} {currency}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {fees[currency]?.percentage || '1.5'}% (мин: {fees[currency]?.minimum || '0.001'})
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Вы получите
                      </Typography>
                      <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 600 }}>
                        {calculateReceiveAmount()} {currency}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        После микширования
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Fade>
        )}
      </Box>

      {/* Security Features */}
      <Box sx={{ mb: 4 }}>
        <Grid container spacing={2}>
          {[
            { icon: SecurityIcon, title: 'Безопасность', desc: 'Военные стандарты шифрования' },
            { icon: SpeedIcon, title: 'Скорость', desc: 'Обработка за 1-6 подтверждений' },
            { icon: TrendingIcon, title: 'Надёжность', desc: '99.9% аптайм сервиса' },
            { icon: WalletIcon, title: 'Приватность', desc: 'Нулевое сохранение логов' },
          ].map((feature, index) => (
            <Grid item xs={6} md={3} key={index}>
              <Tooltip title={feature.desc} arrow>
                <Card
                  sx={{
                    textAlign: 'center',
                    ...themeHelpers.glass(0.4),
                    cursor: 'pointer',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      ...themeHelpers.glowShadow(),
                    },
                  }}
                >
                  <CardContent sx={{ p: 2 }}>
                    <feature.icon 
                      sx={{ 
                        fontSize: '2rem', 
                        color: 'primary.main', 
                        mb: 1 
                      }} 
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {feature.title}
                    </Typography>
                  </CardContent>
                </Card>
              </Tooltip>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Continue Button */}
      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={onNext}
        disabled={!amount || parseFloat(amount) <= 0}
        sx={{
          py: 2,
          fontSize: '1.1rem',
          fontWeight: 600,
          background: selectedCurrency
            ? `linear-gradient(135deg, ${selectedCurrency.color}, #7C3AED)`
            : 'linear-gradient(135deg, #7C3AED, #EC4899)',
          '&:hover': {
            background: selectedCurrency
              ? `linear-gradient(135deg, ${selectedCurrency.color}DD, #6D28D9)`
              : 'linear-gradient(135deg, #6D28D9, #DB2777)',
            transform: 'translateY(-2px)',
            boxShadow: `0px 8px 32px ${selectedCurrency?.color || '#7C3AED'}60`,
          },
          '&:disabled': {
            background: 'rgba(124, 58, 237, 0.3)',
            color: 'rgba(255, 255, 255, 0.5)',
          },
        }}
      >
        Продолжить настройку
      </Button>
    </Box>
  );
};

export default CurrencySelector;