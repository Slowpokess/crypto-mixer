import React, { useState } from 'react';
import AdminAPI from '../../services/AdminAPI';

const SettingsTab = ({ onEmergencyStop }) => {
  const [fees, setFees] = useState({
    BTC: 1.5,
    ETH: 1.5,
    USDT: 1.0,
    SOL: 2.0,
  });
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const api = new AdminAPI();

  const handleUpdateFees = async () => {
    try {
      await api.updateFees(fees);
      alert('Fees updated successfully');
    } catch (error) {
      alert('Failed to update fees');
    }
  };

  const handleMaintenanceToggle = async () => {
    try {
      const reason = prompt('Enter reason for maintenance mode:');
      if (reason !== null) {
        await api.setMaintenanceMode(!maintenanceMode, reason);
        setMaintenanceMode(!maintenanceMode);
        alert(`Maintenance mode ${!maintenanceMode ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      alert('Failed to toggle maintenance mode');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-4">System Settings</h2>
      
      {/* Fee Configuration */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Fee Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(fees).map(([currency, fee]) => (
            <div key={currency} className="space-y-2">
              <label className="text-sm text-gray-400">{currency} Fee %</label>
              <input
                type="number"
                step="0.1"
                value={fee}
                onChange={(e) => setFees({...fees, [currency]: parseFloat(e.target.value)})}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:border-purple-500 focus:outline-none"
              />
            </div>
          ))}
        </div>
        <button 
          onClick={handleUpdateFees}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors"
        >
          Update Fees
        </button>
      </div>

      {/* System Controls */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">System Controls</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Maintenance Mode</p>
              <p className="text-sm text-gray-400">Disable new mix requests</p>
            </div>
            <button 
              onClick={handleMaintenanceToggle}
              className={`px-4 py-2 rounded transition-colors ${
                maintenanceMode 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {maintenanceMode ? 'Disable' : 'Enable'}
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Emergency Stop</p>
              <p className="text-sm text-gray-400">Halt all operations immediately</p>
            </div>
            <button 
              onClick={onEmergencyStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
            >
              Activate
            </button>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Security Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">HSM Status</p>
              <p className="text-sm text-gray-400">Hardware Security Module</p>
            </div>
            <span className="text-green-400">Connected</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Key Rotation</p>
              <p className="text-sm text-gray-400">Automatic key rotation interval</p>
            </div>
            <select className="px-3 py-2 bg-gray-700 border border-gray-600 rounded">
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
              <option value="72">72 hours</option>
              <option value="168">1 week</option>
            </select>
          </div>
        </div>
      </div>

      {/* Monitoring */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h3 className="text-lg font-bold mb-4">Monitoring & Alerts</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <span>Email Alerts</span>
            <span className="text-green-400">Enabled</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span>Slack Integration</span>
            <span className="text-green-400">Connected</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span>PagerDuty</span>
            <button className="text-yellow-400 hover:text-yellow-300">Configure</button>
          </div>
          <div className="flex items-center justify-between py-2">
            <span>Telegram Bot</span>
            <button className="text-blue-400 hover:text-blue-300">Setup</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;