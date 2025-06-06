// API Service for Admin Dashboard
class AdminAPI {
  constructor(baseURL = '/api/v1/admin') {
    this.baseURL = baseURL;
    this.token = localStorage.getItem('adminToken');
  }

  async authenticate(username, password, totpCode) {
    const response = await fetch(`${this.baseURL}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, totpCode }),
    });
    
    if (!response.ok) throw new Error('Authentication failed');
    
    const data = await response.json();
    this.token = data.token;
    localStorage.setItem('adminToken', data.token);
    return data;
  }

  async fetchWithAuth(endpoint, options = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.token}`,
      },
    });
    
    if (response.status === 401) {
      localStorage.removeItem('adminToken');
      window.location.reload();
    }
    
    if (!response.ok) throw new Error('Request failed');
    return response.json();
  }

  async getDashboardStats() {
    return this.fetchWithAuth('/stats');
  }

  async getTransactions(filters) {
    const params = new URLSearchParams(filters);
    return this.fetchWithAuth(`/transactions?${params}`);
  }

  async getWalletBalances() {
    return this.fetchWithAuth('/wallets/balances');
  }

  async getSystemHealth() {
    return this.fetchWithAuth('/system/health');
  }

  async updateFees(fees) {
    return this.fetchWithAuth('/fees', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fees),
    });
  }

  async emergencyStop(reason) {
    return this.fetchWithAuth('/emergency/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  }

  async createWallet(currency, type) {
    return this.fetchWithAuth('/wallets/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currency, type }),
    });
  }

  async rotateWalletKeys(walletId) {
    return this.fetchWithAuth(`/wallets/${walletId}/rotate`, {
      method: 'POST',
    });
  }

  async rebalanceWallets(currency) {
    return this.fetchWithAuth(`/wallets/${currency}/rebalance`, {
      method: 'POST',
    });
  }

  async setMaintenanceMode(enabled, reason) {
    return this.fetchWithAuth('/system/maintenance', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, reason }),
    });
  }
}

export default AdminAPI;