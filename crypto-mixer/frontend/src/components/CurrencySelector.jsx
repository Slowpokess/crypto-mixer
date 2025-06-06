import React from 'react';

const CurrencySelector = ({ 
  currency, 
  setCurrency, 
  amount, 
  setAmount, 
  fees, 
  onNext 
}) => {
  const calculateFee = () => {
    if (!amount || !fees[currency]) return 0;
    const feePercent = fees[currency]?.percentage || 1.5;
    const minFee = fees[currency]?.minimum || 0;
    const calculatedFee = parseFloat(amount) * (feePercent / 100);
    return Math.max(calculatedFee, minFee).toFixed(8);
  };

  const renderCurrencyGrid = () => (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {['BTC', 'ETH', 'USDT', 'SOL'].map((curr) => (
        <button
          key={curr}
          onClick={() => setCurrency(curr)}
          className={`p-4 rounded-lg border-2 transition-all ${
            currency === curr
              ? 'border-purple-500 bg-purple-500/20'
              : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <div className="text-lg font-bold">{curr}</div>
          <div className="text-sm text-gray-400">
            Min: {fees[curr]?.minimum || '0'} | Fee: {fees[curr]?.percentage || '1.5'}%
          </div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-4">Select Currency & Amount</h2>
      
      {renderCurrencyGrid()}

      <div>
        <label className="block text-sm font-medium mb-2">Amount to Mix</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`0.0 ${currency}`}
          className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
          step="0.00000001"
          min="0"
        />
        {amount && (
          <div className="mt-2 text-sm text-gray-400">
            Service fee: {calculateFee()} {currency}
          </div>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!amount || parseFloat(amount) <= 0}
        className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default CurrencySelector;