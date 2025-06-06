import React, { useState, useEffect } from 'react';
import { Shield, RefreshCw } from 'lucide-react';

// Components
import LoginForm from './components/LoginForm';
import OverviewTab from './components/Dashboard/OverviewTab';
import WalletsTab from './components/Dashboard/WalletsTab';
import SettingsTab from './components/Dashboard/SettingsTab';

// Services
import AdminAPI from './services/AdminAPI';

// Main Dashboard Component
const AdminDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [walletBalances, setWalletBalances] = useState({});
  const [systemHealth, setSystemHealth] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const api = new AdminAPI();

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      setIsAuthenticated(true);
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        refreshData();
      }, 30000); // Refresh every 30 seconds

      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const loadDashboardData = async () => {
    try {
      const [statsData, transactionsData, walletsData, healthData] = await Promise.all([
        api.getDashboardStats(),
        api.getTransactions({}),
        api.getWalletBalances(),
        api.getSystemHealth(),
      ]);

      setStats(statsData);
      setTransactions(transactionsData);
      setWalletBalances(walletsData);
      setSystemHealth(healthData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // If auth fails, redirect to login
      if (error.message.includes('auth')) {
        setIsAuthenticated(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
  };

  const handleEmergencyStop = async () => {
    if (window.confirm('Are you sure you want to initiate emergency stop? This will halt all mixing operations.')) {
      const reason = window.prompt('Enter reason for emergency stop:');
      if (reason) {
        try {
          await api.emergencyStop(reason);
          alert('Emergency stop initiated');
          await refreshData();
        } catch (error) {
          alert('Failed to initiate emergency stop');
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm onLogin={() => setIsAuthenticated(true)} />;
  }


  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Shield className="w-8 h-8 text-purple-500" />
              <h1 className="text-xl font-bold">CryptoMixer Admin</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={refreshData}
                className="p-2 hover:bg-gray-700 rounded transition-colors"
                disabled={refreshing}
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex gap-6">
            {['overview', 'wallets', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-4 capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-purple-500 text-purple-400'
                    : 'border-transparent hover:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 pb-20">
        {activeTab === 'overview' && (
          <OverviewTab 
            stats={stats} 
            transactions={transactions} 
            systemHealth={systemHealth} 
          />
        )}
        {activeTab === 'wallets' && (
          <WalletsTab 
            walletBalances={walletBalances} 
            onRefresh={refreshData}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsTab 
            onEmergencyStop={handleEmergencyStop}
          />
        )}
      </main>

      {/* System Status Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  systemHealth.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span>System: {systemHealth.status || 'Unknown'}</span>
              </div>
              
              <div>
                <span className="text-gray-400">Uptime:</span> {systemHealth.uptime || 'N/A'}
              </div>
              
              <div>
                <span className="text-gray-400">CPU:</span> {systemHealth.cpu || 'N/A'}%
              </div>
              
              <div>
                <span className="text-gray-400">Memory:</span> {systemHealth.memory || 'N/A'}%
              </div>
            </div>
            
            <div className="text-gray-400">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;