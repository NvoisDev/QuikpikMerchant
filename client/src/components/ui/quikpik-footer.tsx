import React from "react";

// Simple Quikpik logo as SVG
const QuikpikLogo = ({ size = 16 }: { size?: number }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className="inline-block"
  >
    <circle cx="12" cy="12" r="10" fill="var(--theme-primary)" fillOpacity="0.1"/>
    <path 
      d="M8 8h8l-2 2h-4l-2 2h6l-2 2h-4l-2 2h8" 
      stroke="var(--theme-primary)" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
    <circle cx="16" cy="8" r="1.5" fill="var(--theme-primary)"/>
  </svg>
);

export const QuikpikFooter = () => {
  return (
    <div className="w-full py-4 mt-8 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Powered by</span>
        <QuikpikLogo size={16} />
        <span className="font-medium text-gray-700 dark:text-gray-300">Quikpik</span>
      </div>
    </div>
  );
};