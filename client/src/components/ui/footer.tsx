import React from "react";

interface FooterProps {
  className?: string;
}

export default function Footer({ className = "" }: FooterProps) {
  return (
    <footer className={`${className} border-t border-gray-200 bg-white py-4`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center text-xs text-gray-500">
          <span>Powered by</span>
          <span className="font-semibold text-green-600 ml-1">Quikpik</span>
        </div>
      </div>
    </footer>
  );
}
