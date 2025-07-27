interface FooterProps {
  className?: string;
}

export default function Footer({ className = "" }: FooterProps) {
  return (
    <footer className={`${className} border-t border-gray-200 bg-white py-4`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center space-y-2 text-sm text-gray-600">
          <div className="font-bold text-lg text-primary">Quikpik</div>
          <span>Powered by Quikpik</span>
        </div>
      </div>
    </footer>
  );
}