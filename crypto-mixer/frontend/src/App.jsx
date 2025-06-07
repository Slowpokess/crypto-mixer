import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import CryptoMixer from './components/CryptoMixer';
import { cryptoMixerTheme } from './theme/theme';
import './App.css';

/**
 * Главный компонент приложения CryptoMixer
 * 
 * РУССКИЙ КОММЕНТАРИЙ: Создаём современное приложение с:
 * - Material-UI тёмной темой для профессионального вида
 * - CssBaseline для нормализации стилей
 * - Адаптивным дизайном для всех устройств
 * - Безопасной архитектурой компонентов
 */
function App() {
  return (
    <ThemeProvider theme={cryptoMixerTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #0F0F23 0%, #1A1B3A 50%, #2D2D44 100%)',
          backgroundAttachment: 'fixed',
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: `
              radial-gradient(circle at 20% 20%, rgba(124, 58, 237, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 40% 60%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)
            `,
            pointerEvents: 'none',
            zIndex: 0,
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <CryptoMixer />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;