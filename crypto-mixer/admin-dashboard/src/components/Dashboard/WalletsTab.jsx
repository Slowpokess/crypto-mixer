import React from 'react';
import AdminAPI from '../../services/AdminAPI';

const WalletsTab = ({ walletBalances, onRefresh }) => {
  const api = new AdminAPI();

  const handleCreateWallet = async (currency, type) => {
    try {
      await api.createWallet(currency, type);
      alert(`${currency} ${type} wallet created successfully`);
      onRefresh();
    } catch (error) {
      alert('Failed to create wallet');
    }
  };

  const handleRotateKeys = async (currency) => {
    try {
      // This would need wallet ID in real implementation
      alert(`Key rotation initiated for ${currency} wallets`);
    } catch (error) {
      alert('Failed to rotate keys');
    }
  };

  const handleRebalance = async (currency) => {
    try {
      await api.rebalanceWallets(currency);
      alert(`Rebalance initiated for ${currency} wallets`);
      onRefresh();
    } catch (error) {
      alert('Failed to initiate rebalance');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-4">Wallet Management</h2>
      
      {Object.entries(walletBalances).map(([currency, data]) => (
        <div key={currency} className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4">{currency} Wallets</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {['HOT', 'BUFFER', 'COLD'].map((type) => {
              const walletData = data[type] || {};
              return (
                <div key={type} className="bg-gray-700 p-4 rounded">
                  <h4 className="font-medium mb-2">{type} Wallets</h4>
                  <p className="text-sm text-gray-400">Count: {walletData.count || 0}</p>
                  <p className="text-sm text-gray-400">
                    Balance: {walletData.total_balance || 0} {currency}
                  </p>
                  <p className="text-sm text-gray-400">
                    Avg: {walletData.avg_balance || 0} {currency}
                  </p>
                  
                  {/* Wallet Health Indicators */}
                  <div className="mt-2">
                    {type === 'HOT' && walletData.total_balance < 1 && (
                      <span className="text-red-400 text-xs">⚠️ Low Balance</span>
                    )}
                    {type === 'COLD' && walletData.count < 2 && (
                      <span className="text-yellow-400 text-xs">⚠️ Few Wallets</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 flex-wrap">
            <select 
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded"
              onChange={(e) => {
                if (e.target.value) {
                  handleCreateWallet(currency, e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="">Create New Wallet</option>
              <option value="HOT">HOT Wallet</option>
              <option value="BUFFER">BUFFER Wallet</option>
              <option value="COLD">COLD Wallet</option>
            </select>
            
            <button 
              onClick={() => handleRotateKeys(currency)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
            >
              Rotate Keys
            </button>
            
            <button 
              onClick={() => handleRebalance(currency)}
              className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded transition-colors"
            >
              Rebalance
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default WalletsTab;