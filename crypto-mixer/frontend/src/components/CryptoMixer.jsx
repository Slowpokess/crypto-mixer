import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Stepper,
  Step,
  StepLabel,
  Card,
  CardContent,
  Alert,
  Backdrop,
  CircularProgress,
  Chip,
  Fade,
  Slide,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { MixerAPI } from '../services/mixerAPI';
import CurrencySelector from './CurrencySelector';
import OutputConfiguration from './OutputConfiguration';
import MixingStatus from './MixingStatus';
import { validateOutputAddresses, validateAmount } from '../utils/validation';
import { SUPPORTED_CURRENCIES, APP_CONFIG } from '../config/constants';
import { themeHelpers } from '../theme/theme';

/**
 * Главный компонент CryptoMixer с современным Material-UI дизайном
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Полностью переписанный компонент с:
 * - Современным Material-UI интерфейсом
 * - Адаптивным дизайном для всех устройств
 * - Плавными анимациями и переходами
 * - Улучшенной безопасностью и UX
 * - Профессиональным внешним видом
 */
const CryptoMixer = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  // Application state
  const [step, setStep] = useState(1);
  const [currency, setCurrency] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [outputAddresses, setOutputAddresses] = useState(['']);
  const [delay, setDelay] = useState(APP_CONFIG.DEFAULT_DELAY_HOURS);
  const [mixRequest, setMixRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fees, setFees] = useState({});
  const [status, setStatus] = useState(null);
  const [fadeIn, setFadeIn] = useState(false);

  const api = new MixerAPI();

  // Шаги процесса микширования
  const steps = [
    'Выбор валюты и суммы',
    'Настройка вывода',
    'Мониторинг процесса'
  ];

  // Анимация появления при загрузке
  useEffect(() => {
    setFadeIn(true);
  }, []);

  // Load initial data and check for existing session
  useEffect(() => {
    loadFees();
    checkExistingSession();
  }, []);

  // Set up status polling when mix request exists
  useEffect(() => {
    if (mixRequest?.sessionId) {
      const interval = setInterval(() => {
        checkStatus();
      }, APP_CONFIG.STATUS_CHECK_INTERVAL);

      return () => clearInterval(interval);
    }
  }, [mixRequest]);

  const loadFees = async () => {
    try {
      const feesData = await api.getFees();
      setFees(feesData);
    } catch (err) {
      console.error('Failed to load fees:', err);
      // Use default fees as fallback
      const defaultFees = {};
      SUPPORTED_CURRENCIES.forEach(curr => {
        defaultFees[curr] = { percentage: 1.5, minimum: 0.001 };
      });
      setFees(defaultFees);
    }
  };

  const checkExistingSession = async () => {
    const sessionId = localStorage.getItem(APP_CONFIG.SESSION_STORAGE_KEY);
    if (sessionId) {
      try {
        const statusData = await api.getStatus(sessionId);
        if (statusData) {
          setStatus(statusData);
          setMixRequest({ sessionId });
          setStep(3);
        }
      } catch (err) {
        localStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
      }
    }
  };

  const checkStatus = async () => {
    if (!mixRequest?.sessionId) return;
    
    try {
      const statusData = await api.getStatus(mixRequest.sessionId);
      setStatus(statusData);
    } catch (err) {
      console.error('Failed to check status:', err);
    }
  };

  const handleStep1Next = () => {
    setError('');
    
    const amountValidation = validateAmount(amount, currency, fees);
    if (!amountValidation.isValid) {
      setError(amountValidation.error);
      return;
    }

    setStep(2);
  };

  const handleStep2Back = () => {
    setError('');
    setStep(1);
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      // Validate output addresses
      const addressValidation = validateOutputAddresses(outputAddresses, currency);
      if (!addressValidation.isValid) {
        throw new Error(addressValidation.error);
      }

      // Validate amount one more time
      const amountValidation = validateAmount(amount, currency, fees);
      if (!amountValidation.isValid) {
        throw new Error(amountValidation.error);
      }

      // Prepare mix request data
      const validAddresses = outputAddresses.filter(addr => addr.trim() !== '');
      const data = {
        currency,
        amount: parseFloat(amount),
        outputAddresses: validAddresses.map(addr => ({
          address: addr.trim(),
          percentage: 100 / validAddresses.length,
        })),
        delay,
      };

      const result = await api.createMixRequest(data);
      setMixRequest(result);
      localStorage.setItem(APP_CONFIG.SESSION_STORAGE_KEY, result.sessionId);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNewMix = () => {
    localStorage.removeItem(APP_CONFIG.SESSION_STORAGE_KEY);
    setStep(1);
    setCurrency('BTC');
    setAmount('');
    setOutputAddresses(['']);
    setDelay(APP_CONFIG.DEFAULT_DELAY_HOURS);
    setMixRequest(null);
    setStatus(null);
    setError('');
  };

  const renderCurrentStep = () => {
    switch (step) {
      case 1:
        return (
          <CurrencySelector
            currency={currency}
            setCurrency={setCurrency}
            amount={amount}
            setAmount={setAmount}
            fees={fees}
            onNext={handleStep1Next}
          />
        );
      case 2:
        return (
          <OutputConfiguration
            currency={currency}
            outputAddresses={outputAddresses}
            setOutputAddresses={setOutputAddresses}
            delay={delay}
            setDelay={setDelay}
            error={error}
            loading={loading}
            onBack={handleStep2Back}
            onSubmit={handleSubmit}
          />
        );
      case 3:
        return (
          <MixingStatus
            currency={currency}
            mixRequest={mixRequest}
            status={status}
            onNewMix={handleNewMix}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Fade in={fadeIn} timeout={1000}>
      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
        {/* Header Section */}
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '2.5rem', md: '3.5rem' },
              fontWeight: 700,
              mb: 2,
              ...themeHelpers.gradientText(),
            }}
          >
            CryptoMixer
          </Typography>
          <Typography
            variant="h5"
            sx={{
              color: 'text.secondary',
              fontWeight: 300,
              mb: 3,
              fontSize: { xs: '1.1rem', md: '1.25rem' },
            }}
          >
            Анонимный сервис микширования криптовалют
          </Typography>
          
          {/* Security Features */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 1,
              mb: 4,
            }}
          >
            <Chip
              label="🚫 Без логов"
              variant="outlined"
              size="small"
              sx={{ borderColor: 'success.main', color: 'success.main' }}
            />
            <Chip
              label="🔒 Без KYC"
              variant="outlined"
              size="small"
              sx={{ borderColor: 'primary.main', color: 'primary.main' }}
            />
            <Chip
              label="🧅 Tor дружелюбно"
              variant="outlined"
              size="small"
              sx={{ borderColor: 'secondary.main', color: 'secondary.main' }}
            />
            <Chip
              label="⚡ Быстро и надёжно"
              variant="outlined"
              size="small"
              sx={{ borderColor: 'warning.main', color: 'warning.main' }}
            />
          </Box>
        </Box>

        {/* Progress Stepper */}
        <Box sx={{ mb: { xs: 3, md: 4 } }}>
          <Stepper
            activeStep={step - 1}
            orientation={isMobile ? 'vertical' : 'horizontal'}
            sx={{
              '& .MuiStepConnector-line': {
                borderColor: 'rgba(124, 58, 237, 0.3)',
              },
            }}
          >
            {steps.map((label, index) => (
              <Step key={label}>
                <StepLabel
                  sx={{
                    '& .MuiStepLabel-label': {
                      color: 'text.secondary',
                      fontSize: { xs: '0.875rem', md: '1rem' },
                    },
                    '& .MuiStepLabel-label.Mui-active': {
                      color: 'primary.main',
                      fontWeight: 600,
                    },
                    '& .MuiStepLabel-label.Mui-completed': {
                      color: 'success.main',
                    },
                  }}
                >
                  {label}
                </StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        {/* Main Content Card */}
        <Slide direction="up" in={fadeIn} timeout={800}>
          <Card
            sx={{
              ...themeHelpers.glass(0.8),
              ...themeHelpers.glowShadow(),
              borderRadius: { xs: 2, md: 4 },
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(124, 58, 237, 0.2)',
              transition: 'all 0.3s ease',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: '0px 16px 48px rgba(124, 58, 237, 0.4)',
              },
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              {/* Error Alert */}
              {error && (
                <Fade in={!!error}>
                  <Alert
                    severity="error"
                    sx={{
                      mb: 3,
                      borderRadius: 2,
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                    onClose={() => setError('')}
                  >
                    {error}
                  </Alert>
                </Fade>
              )}

              {/* Current Step Content */}
              <Box sx={{ minHeight: { xs: 'auto', md: '400px' } }}>
                {renderCurrentStep()}
              </Box>
            </CardContent>
          </Card>
        </Slide>

        {/* Footer Section */}
        <Box
          sx={{
            mt: { xs: 4, md: 6 },
            textAlign: 'center',
            color: 'text.secondary',
          }}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Подключение через Tor:{' '}
            <Box
              component="span"
              sx={{
                fontFamily: 'monospace',
                color: 'primary.main',
                fontWeight: 500,
              }}
            >
              xxxxxxxxxxxxxxxx.onion
            </Box>
          </Typography>
          <Typography variant="caption" sx={{ display: 'block' }}>
            © 2024 CryptoMixer. Приватность и анонимность — наш приоритет.
          </Typography>
        </Box>

        {/* Loading Backdrop */}
        <Backdrop
          sx={{
            color: '#fff',
            zIndex: (theme) => theme.zIndex.drawer + 1,
            backdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(15, 15, 35, 0.8)',
          }}
          open={loading}
        >
          <Box sx={{ textAlign: 'center' }}>
            <CircularProgress
              size={60}
              sx={{
                color: 'primary.main',
                mb: 2,
              }}
            />
            <Typography variant="h6" sx={{ color: 'primary.main' }}>
              Обработка запроса...
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Пожалуйста, подождите
            </Typography>
          </Box>
        </Backdrop>
      </Container>
    </Fade>
  );
};

export default CryptoMixer;