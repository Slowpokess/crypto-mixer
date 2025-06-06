import React from 'react';

const ProgressSteps = ({ currentStep }) => {
  const steps = [
    { number: 1, label: 'Currency & Amount' },
    { number: 2, label: 'Output Addresses' },
    { number: 3, label: 'Deposit & Status' }
  ];

  return (
    <div className="flex justify-between mb-12">
      {steps.map((stepInfo, index) => (
        <div
          key={stepInfo.number}
          className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
        >
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-colors ${
                currentStep >= stepInfo.number
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-500'
              }`}
            >
              {currentStep > stepInfo.number ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                stepInfo.number
              )}
            </div>
            <div className={`text-xs mt-2 text-center max-w-20 ${
              currentStep >= stepInfo.number ? 'text-purple-400' : 'text-gray-500'
            }`}>
              {stepInfo.label}
            </div>
          </div>
          {index < steps.length - 1 && (
            <div
              className={`flex-1 h-1 mx-4 transition-colors ${
                currentStep > stepInfo.number ? 'bg-purple-600' : 'bg-gray-800'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ProgressSteps;