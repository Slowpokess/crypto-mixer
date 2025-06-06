import React, { useState } from 'react';

const MixingStatus = ({ 
  currency, 
  mixRequest, 
  status, 
  onNewMix 
}) => {
  const [copied, setCopied] = useState(false);
  
  const depositInfo = mixRequest || status;

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusColor = (currentStatus) => {
    switch (currentStatus) {
      case 'COMPLETED':
        return 'bg-green-500/20 text-green-400';
      case 'PROCESSING':
      case 'MIXING':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'FAILED':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-blue-500/20 text-blue-400';
    }
  };

  const getStatusIcon = (currentStatus) => {
    switch (currentStatus) {
      case 'COMPLETED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'PROCESSING':
      case 'MIXING':
        return (
          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'FAILED':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold mb-4">Deposit Information</h2>
      
      {depositInfo?.depositAddress && (
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="text-sm text-gray-400 mb-2">Send exactly:</div>
          <div className="text-2xl font-bold text-purple-400 mb-4">
            {depositInfo.amount} {currency}
          </div>
          
          <div className="text-sm text-gray-400 mb-2">To this address:</div>
          <div className="p-3 bg-gray-900 rounded font-mono text-sm break-all border border-gray-700">
            {depositInfo.depositAddress}
          </div>
          
          <button
            onClick={() => copyToClipboard(depositInfo.depositAddress)}
            className="mt-3 w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded transition-colors flex items-center justify-center gap-2"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Address
              </>
            )}
          </button>
        </div>
      )}

      {status && (
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-gray-400">Status:</span>
            <span className={`px-3 py-1 rounded-full text-sm flex items-center gap-2 ${getStatusColor(status.status)}`}>
              {getStatusIcon(status.status)}
              {status.status}
            </span>
          </div>
          
          {status.confirmations !== undefined && (
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm text-gray-400">Confirmations:</span>
              <span className="text-sm">
                {status.confirmations} / {status.requiredConfirmations}
              </span>
            </div>
          )}

          {status.estimatedCompletion && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Estimated completion:</span>
              <span className="text-sm">
                {new Date(status.estimatedCompletion).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm text-yellow-200">
            <p className="font-medium mb-1">Important:</p>
            <ul className="list-disc list-inside space-y-1 text-yellow-300">
              <li>Send the exact amount shown above</li>
              <li>Transaction expires in 24 hours</li>
              <li>Save your session ID: {depositInfo?.sessionId}</li>
              <li>Do not close this page until mixing is complete</li>
            </ul>
          </div>
        </div>
      </div>

      {status?.status === 'COMPLETED' && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="text-sm text-green-200">
              <p className="font-medium">Mixing completed successfully!</p>
              <p className="text-green-300">Your funds have been sent to the specified addresses.</p>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onNewMix}
        className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
      >
        Start New Mix
      </button>
    </div>
  );
};

export default MixingStatus;