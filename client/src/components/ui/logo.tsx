import quikpikLogo from "@assets/Quikpik - Products_1751540073200.png";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "full" | "icon-only";
}

export default function Logo({ 
  className = "", 
  size = "md", 
  variant = "full" 
}: LogoProps) {
  const sizeClasses = {
    sm: "h-6",
    md: "h-8", 
    lg: "h-12",
    xl: "h-16"
  };

  if (variant === "icon-only") {
    return (
      <div className={`${className} flex items-center`}>
        <div className={`${sizeClasses[size]} aspect-square bg-primary rounded-full flex items-center justify-center`}>
          <div className="w-3/5 h-3/5 bg-white rounded-full relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1/2 h-1/2 bg-primary rounded-full"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} flex items-center space-x-3`}>
      <img 
        src={quikpikLogo} 
        alt="Quikpik Logo" 
        className={`${sizeClasses[size]} w-auto`}
      />
    </div>
  );
}