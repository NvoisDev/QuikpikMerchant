import quikpikLogo from "@assets/Quikpik - Products_1751540073200.png";

interface FooterProps {
  className?: string;
}

export default function Footer({ className = "" }: FooterProps) {
  return (
    <footer className={`${className} border-t border-gray-200 bg-white py-4`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center space-y-2 text-sm text-gray-600">
          <img 
            src={quikpikLogo} 
            alt="Quikpik" 
            className="h-6 w-auto"
          />
          <span>Powered by Quikpik</span>
        </div>
      </div>
    </footer>
  );
}