import React from "react";
// Logo removed during cleanup

interface FooterProps {
  className?: string;
}

export default function Footer({ className = "" }: FooterProps) {
  return (
    <footer className={`${className} border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-4`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
          <span>Powered by</span>
          <span className="font-semibold text-green-600 dark:text-green-500 ml-1">Quikpik</span>
        </div>
      </div>
    </footer>
  );
}