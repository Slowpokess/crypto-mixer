import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import AdminAPI from '../services/AdminAPI';

const LoginForm = ({ onLogin }) => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    totpCode: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);

    try {
      const api = new AdminAPI();
      await api.authenticate(
        credentials.username,
        credentials.password,
        credentials.totpCode
      );
      onLogin();
    } catch (err) {
      setError('Invalid credentials or 2FA code');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 p-8 rounded-lg shadow-2xl w-96">
        <div className="flex items-center justify-center mb-6">
          <Shield className="w-12 h-12 text-purple-500" />
        </div>
        
        <h2 className="text-2xl font-bold text-center mb-6">Admin Login</h2>
        
        <div className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={credentials.username}
            onChange={(e) => setCredentials({...credentials, username: e.target.value})}
            onKeyPress={handleKeyPress}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none"
            required
          />
          
          <input
            type="password"
            placeholder="Password"
            value={credentials.password}
            onChange={(e) => setCredentials({...credentials, password: e.target.value})}
            onKeyPress={handleKeyPress}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none"
            required
          />
          
          <input
            type="text"
            placeholder="2FA Code"
            value={credentials.totpCode}
            onChange={(e) => setCredentials({...credentials, totpCode: e.target.value})}
            onKeyPress={handleKeyPress}
            className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:border-purple-500 focus:outline-none"
            maxLength="6"
            required
          />
          
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Authenticating...' : 'Login'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;