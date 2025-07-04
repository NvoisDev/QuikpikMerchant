import { useAuth } from "@/hooks/useAuth";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "full" | "icon-only";
  user?: any; // Optional user override
}

export default function Logo({ 
  className = "", 
  size = "md", 
  variant = "full",
  user: propUser
}: LogoProps) {
  const { user: authUser } = useAuth();
  const user = propUser || authUser;

  const sizeClasses = {
    sm: "h-6",
    md: "h-8", 
    lg: "h-12",
    xl: "h-16"
  };

  const textSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-xl",
    xl: "text-2xl"
  };

  // Function to generate initials
  const getInitials = () => {
    if (!user) return "QP";
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.businessName) {
      const words = user.businessName.split(' ');
      if (words.length >= 2) {
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
      }
      return user.businessName.substring(0, 2).toUpperCase();
    }
    return "QP";
  };

  // Determine what to show based on user settings hierarchy
  const renderLogo = () => {
    // 1. Custom uploaded logo (highest priority)
    if (user?.logoType === "custom" && user?.logoUrl) {
      return (
        <img 
          src={user.logoUrl} 
          alt={user.businessName || "Business logo"} 
          className={`${sizeClasses[size]} w-auto object-contain rounded`}
        />
      );
    }
    
    // 2. Business name initials
    if (user?.logoType === "business" && user?.businessName) {
      const businessInitials = user.businessName
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase())
        .join('')
        .substring(0, 2);
      
      return (
        <div className={`${sizeClasses[size]} aspect-square bg-primary rounded-full flex items-center justify-center`}>
          <span className={`${textSizeClasses[size]} font-bold text-white`}>
            {businessInitials}
          </span>
        </div>
      );
    }
    
    // 3. Name initials (fallback - default)
    const nameInitials = getInitials();
    return (
      <div className={`${sizeClasses[size]} aspect-square bg-primary rounded-full flex items-center justify-center`}>
        <span className={`${textSizeClasses[size]} font-bold text-white`}>
          {nameInitials}
        </span>
      </div>
    );
  };

  if (variant === "icon-only") {
    return (
      <div className={`${className} flex items-center`}>
        {renderLogo()}
      </div>
    );
  }

  return (
    <div className={`${className} flex items-center space-x-3`}>
      {renderLogo()}
    </div>
  );
}