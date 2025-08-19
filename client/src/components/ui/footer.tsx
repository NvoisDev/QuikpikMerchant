import React from "react";
import quikpikLogo from "@assets/Quikpik - Products (2)_1755616492587.png";

interface FooterProps {
  className?: string;
}

export default function Footer({ className = "" }: FooterProps) {
  return (
    <footer className={`${className} border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-4`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
    </footer>
  );
}