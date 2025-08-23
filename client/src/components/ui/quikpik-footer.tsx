import React from "react";
// Logo removed during cleanup

export const QuikpikFooter = () => {
  return (
    <div className="w-full py-4 mt-8 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Powered by</span>
        <div className="w-4 h-4 inline-block bg-green-600 text-white rounded-sm flex items-center justify-center text-xs font-bold">
          Q
        </div>
        <span className="font-medium text-gray-700 dark:text-gray-300">Quikpik</span>
      </div>
    </div>
  );
};