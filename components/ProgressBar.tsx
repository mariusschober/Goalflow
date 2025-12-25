import React from 'react';

interface ProgressBarProps {
  value: number;
  max: number;
  colorClass?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, max, colorClass = 'bg-green-500' }) => {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5">
      <div
        className={`${colorClass} h-2.5 rounded-full transition-all duration-500`}
        style={{ width: `${percentage}%` }}
      ></div>
    </div>
  );
};
