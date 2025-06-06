import React, { useState, useEffect } from 'react';
import { MixerAPI } from '../services/mixerAPI';
import CurrencySelector from './CurrencySelector';
import OutputConfiguration from './OutputConfiguration';
import MixingStatus from './MixingStatus';
import ProgressSteps from './ProgressSteps';
import { validateOutputAddresses, validateAmount } from '../utils/validation';
import { SUPPORTED_CURRENCIES, APP_CONFIG } from '../config/constants';

const CryptoMixer = () => {
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

  const api = new MixerAPI();

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
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            CryptoMixer
          </h1>
          <p className="text-gray-400">
            Anonymous cryptocurrency mixing service
          </p>
        </div>

        {/* Progress Steps */}
        <ProgressSteps currentStep={step} />

        {/* Main Content */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-gray-700">
          {renderCurrentStep()}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500">
          <p>No logs • No KYC • Tor friendly</p>
          <p className="mt-2">
            Connect via Tor: {' '}
            <span className="font-mono text-purple-400">
              xxxxxxxxxxxxxxxx.onion
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default CryptoMixer;