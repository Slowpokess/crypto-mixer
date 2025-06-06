// Formatting utilities
export const formatAmount = (amount, currency) => {
  if (!amount) return '0';
  
  const decimals = {
    BTC: 8,
    ETH: 6,
    USDT: 2,
    SOL: 6
  };

  const numAmount = parseFloat(amount);
  const decimal = decimals[currency] || 6;
  
  return numAmount.toFixed(decimal).replace(/\.?0+$/, '');
};

export const formatCurrency = (amount, currency) => {
  const formattedAmount = formatAmount(amount, currency);
  return `${formattedAmount} ${currency}`;
};

export const formatAddress = (address, length = 8) => {
  if (!address || address.length <= length * 2) return address;
  
  return `${address.slice(0, length)}...${address.slice(-length)}`;
};

export const formatTime = (hours) => {
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  
  if (remainingHours === 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  }
  
  return `${days}d ${remainingHours}h`;
};

export const formatTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatPercentage = (percentage) => {
  return `${percentage.toFixed(2)}%`;
};

export const formatSessionId = (sessionId) => {
  if (!sessionId) return '';
  
  // Format as XXXX-XXXX-XXXX-XXXX
  return sessionId.replace(/(.{4})/g, '$1-').slice(0, -1);
};