import { createTheme } from '@mui/material/styles';

// Кастомная тёмная тема для CryptoMixer с акцентами криптографии
export const cryptoMixerTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7C3AED', // Фиолетовый - основной цвет криптографии
      light: '#A855F7',
      dark: '#5B21B6',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#EC4899', // Розовый для акцентов
      light: '#F472B6',
      dark: '#BE185D',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#0F0F23', // Очень тёмный фон
      paper: '#1A1B3A', // Тёмный фон для карточек
    },
    surface: {
      main: '#2D2D44', // Средний тон для поверхностей
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#CBD5E1',
      disabled: '#64748B',
    },
    error: {
      main: '#EF4444',
      light: '#F87171',
      dark: '#DC2626',
    },
    warning: {
      main: '#F59E0B',
      light: '#FBBF24',
      dark: '#D97706',
    },
    success: {
      main: '#10B981',
      light: '#34D399',
      dark: '#059669',
    },
    info: {
      main: '#3B82F6',
      light: '#60A5FA',
      dark: '#1D4ED8',
    },
    // Кастомные цвета для криптовалют
    crypto: {
      bitcoin: '#F7931A',
      ethereum: '#627EEA', 
      usdt: '#26A17B',
      solana: '#14F195',
      litecoin: '#BEBEBE',
      dash: '#008CE7',
      zcash: '#ECB244',
    },
    // Градиенты для современного вида
    gradients: {
      primary: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
      secondary: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
      accent: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #334155 100%)',
      crypto: 'linear-gradient(135deg, #7C3AED 0%, #3B82F6 50%, #10B981 100%)',
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '3.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    h2: {
      fontSize: '2.5rem',
      fontWeight: 600,
      lineHeight: 1.3,
    },
    h3: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none', // Убираем UPPERCASE
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
    },
  },
  shape: {
    borderRadius: 12, // Современные скругленные углы
  },
  shadows: [
    'none',
    '0px 2px 4px rgba(0, 0, 0, 0.1)',
    '0px 4px 8px rgba(0, 0, 0, 0.12)',
    '0px 8px 16px rgba(0, 0, 0, 0.14)',
    '0px 12px 24px rgba(0, 0, 0, 0.16)',
    '0px 16px 32px rgba(0, 0, 0, 0.18)',
    '0px 24px 48px rgba(0, 0, 0, 0.2)',
    // Добавляем цветные тени для эффектов
    '0px 4px 20px rgba(124, 58, 237, 0.3)', // Фиолетовая тень
    '0px 4px 20px rgba(236, 72, 153, 0.3)', // Розовая тень
    '0px 8px 32px rgba(124, 58, 237, 0.4)', // Усиленная фиолетовая
    '0px 8px 32px rgba(236, 72, 153, 0.4)', // Усиленная розовая
    '0px 16px 48px rgba(124, 58, 237, 0.5)',
    '0px 16px 48px rgba(236, 72, 153, 0.5)',
    '0px 24px 64px rgba(124, 58, 237, 0.6)',
    '0px 32px 80px rgba(124, 58, 237, 0.7)',
    '0px 40px 96px rgba(124, 58, 237, 0.8)',
    '0px 48px 112px rgba(124, 58, 237, 0.9)',
    '0px 56px 128px rgba(124, 58, 237, 1.0)',
    '0px 64px 144px rgba(124, 58, 237, 1.1)',
    '0px 72px 160px rgba(124, 58, 237, 1.2)',
    '0px 80px 176px rgba(124, 58, 237, 1.3)',
    '0px 88px 192px rgba(124, 58, 237, 1.4)',
    '0px 96px 208px rgba(124, 58, 237, 1.5)',
    '0px 104px 224px rgba(124, 58, 237, 1.6)',
    '0px 112px 240px rgba(124, 58, 237, 1.7)',
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: 'linear-gradient(135deg, #0F0F23 0%, #1A1B3A 50%, #2D2D44 100%)',
          backgroundAttachment: 'fixed',
          minHeight: '100vh',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 500,
          padding: '12px 24px',
          fontSize: '1rem',
          boxShadow: 'none',
          '&:hover': {
            transform: 'translateY(-2px)',
            transition: 'all 0.3s ease',
            boxShadow: '0px 8px 25px rgba(124, 58, 237, 0.4)',
          },
        },
        contained: {
          background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #6D28D9 0%, #DB2777 100%)',
          },
        },
        outlined: {
          borderColor: '#7C3AED',
          color: '#7C3AED',
          '&:hover': {
            borderColor: '#EC4899',
            backgroundColor: 'rgba(124, 58, 237, 0.1)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          background: 'rgba(26, 27, 58, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(124, 58, 237, 0.2)',
          '&:hover': {
            transform: 'translateY(-4px)',
            transition: 'all 0.3s ease',
            boxShadow: '0px 16px 48px rgba(124, 58, 237, 0.3)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            backgroundColor: 'rgba(45, 45, 68, 0.6)',
            '& fieldset': {
              borderColor: 'rgba(124, 58, 237, 0.3)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(124, 58, 237, 0.6)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#7C3AED',
              boxShadow: '0px 0px 0px 2px rgba(124, 58, 237, 0.2)',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
        filled: {
          background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
          color: '#FFFFFF',
        },
      },
    },
    MuiStepper: {
      styleOverrides: {
        root: {
          background: 'transparent',
        },
      },
    },
    MuiStep: {
      styleOverrides: {
        root: {
          '& .MuiStepIcon-root': {
            color: 'rgba(124, 58, 237, 0.3)',
            '&.Mui-active': {
              color: '#7C3AED',
            },
            '&.Mui-completed': {
              color: '#10B981',
            },
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
        },
        standardError: {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
        },
        standardWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        },
        standardSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        },
        standardInfo: {
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backdropFilter: 'blur(8px)',
          backgroundColor: 'rgba(15, 15, 35, 0.8)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          background: 'rgba(26, 27, 58, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(124, 58, 237, 0.3)',
        },
      },
    },
  },
});

// Дополнительные утилиты для темы
export const themeHelpers = {
  // Создание глассморфизм эффекта
  glass: (opacity = 0.1) => ({
    background: `rgba(26, 27, 58, ${opacity})`,
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(124, 58, 237, 0.2)',
  }),
  
  // Градиентный текст
  gradientText: (gradient = 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)') => ({
    background: gradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  }),
  
  // Анимированная тень
  glowShadow: (color = '#7C3AED', intensity = 0.4) => ({
    boxShadow: `0px 8px 32px rgba(124, 58, 237, ${intensity})`,
    transition: 'all 0.3s ease',
    '&:hover': {
      boxShadow: `0px 12px 40px rgba(124, 58, 237, ${intensity + 0.2})`,
      transform: 'translateY(-2px)',
    },
  }),
};

export default cryptoMixerTheme;