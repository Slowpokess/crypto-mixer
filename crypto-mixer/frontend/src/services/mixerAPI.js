// Mixer API Service
export class MixerAPI {
  constructor(baseURL = '/api/v1') {
    this.baseURL = baseURL;
  }

  async createMixRequest(data) {
    const sessionId = localStorage.getItem('sessionId') || this.generateSessionId();
    const response = await fetch(`${this.baseURL}/mixer/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to create mix request');
    }
    
    const result = await response.json();
    localStorage.setItem('sessionId', result.sessionId);
    return result;
  }

  async getStatus(sessionId) {
    const response = await fetch(`${this.baseURL}/mixer/status/${sessionId}`, {
      headers: {
        'X-Session-ID': sessionId,
      },
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to get status');
    }
    
    return response.json();
  }

  async getFees() {
    const response = await fetch(`${this.baseURL}/mixer/fees`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to get fees');
    }
    
    return response.json();
  }

  generateSessionId() {
    return 'xxxx-xxxx-xxxx-xxxx'.replace(/[x]/g, () => 
      (Math.random() * 16 | 0).toString(16)
    );
  }

  // Health check for API availability
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Get supported currencies
  async getSupportedCurrencies() {
    try {
      const response = await fetch(`${this.baseURL}/currencies`);
      if (!response.ok) return ['BTC', 'ETH', 'USDT', 'SOL']; // fallback
      return response.json();
    } catch (error) {
      return ['BTC', 'ETH', 'USDT', 'SOL']; // fallback
    }
  }
}