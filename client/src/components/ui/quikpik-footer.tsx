import React from "react";
// Logo removed during cleanup

export const QuikpikFooter = () => {
  return (
    <div className="w-full py-4 mt-8 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center text-xs text-gray-500 dark:text-gray-400">
        <span>Powered by</span>
        <span className="font-semibold text-green-600 dark:text-green-500 ml-1">Quikpik</span>
      </div>
    </div>
  );
};