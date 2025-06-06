import React from 'react';

const OutputConfiguration = ({
  currency,
  outputAddresses,
  setOutputAddresses,
  delay,
  setDelay,
  error,
  loading,
  onBack,
  onSubmit
}) => {
  const handleAddAddress = () => {
    setOutputAddresses([...outputAddresses, '']);
  };

  const handleRemoveAddress = (index) => {
    const newAddresses = outputAddresses.filter((_, i) => i !== index);
    setOutputAddresses(newAddresses);
  };

  const handleAddressChange = (index, value) => {
    const newAddresses = [...outputAddresses];
    newAddresses[index] = value;
    setOutputAddresses(newAddresses);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-4">Output Addresses</h2>
      
      <div className="space-y-4">
        {outputAddresses.map((address, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => handleAddressChange(index, e.target.value)}
              placeholder={`${currency} address #${index + 1}`}
              className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none"
            />
            {outputAddresses.length > 1 && (
              <button
                onClick={() => handleRemoveAddress(index)}
                className="px-4 py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors"
                title="Remove address"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleAddAddress}
        disabled={outputAddresses.length >= 10} // Limit to 10 addresses
        className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        + Add Another Address
      </button>

      <div>
        <label className="block text-sm font-medium mb-2">
          Delay (hours): {delay}h
        </label>
        <input
          type="range"
          min="1"
          max="72"
          value={delay}
          onChange={(e) => setDelay(parseInt(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1h</span>
          <span>24h</span>
          <span>72h</span>
        </div>
        <div className="text-center text-sm text-gray-400 mt-2">
          Outputs will be distributed over {delay} hours for better anonymity
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={onBack}
          className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
        >
          Back
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Creating...
            </div>
          ) : (
            'Start Mixing'
          )}
        </button>
      </div>
    </div>
  );
};

export default OutputConfiguration;