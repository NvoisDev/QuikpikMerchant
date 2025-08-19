import React from "react";
import quikpikLogo from "@assets/Quikpik - Products (2)_1755616492587.png";

export const QuikpikFooter = () => {
  return (
    <div className="w-full py-4 mt-8 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Powered by</span>
        <img 
          src={quikpikLogo} 
          alt="Quikpik Logo" 
          className="w-4 h-4 inline-block"
        />
        <span className="font-medium text-gray-700 dark:text-gray-300">Quikpik</span>
      </div>
    </div>
  );
};