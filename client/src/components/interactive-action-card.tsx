import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface InteractiveActionCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  metric: string;
  colorClass: string;
  gradientFrom: string;
  gradientTo: string;
}

export default function InteractiveActionCard({
  href,
  icon: Icon,
  title,
  description,
  metric,
  colorClass,
  gradientFrom,
  gradientTo,
}: InteractiveActionCardProps) {
  const [isClicked, setIsClicked] = useState(false);

  const handleClick = () => {
    setIsClicked(true);
    setTimeout(() => setIsClicked(false), 200);
  };

  // Extract color name for dynamic classes
  const colorName = colorClass.includes('blue') ? 'blue' : 
                   colorClass.includes('emerald') ? 'emerald' :
                   colorClass.includes('purple') ? 'purple' : 'orange';

  return (
    <Link href={href}>
      <Card 
        className={`group cursor-pointer hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 border-0 bg-white/90 backdrop-blur-sm overflow-hidden relative ${
          isClicked ? 'scale-95' : 'hover:scale-[1.02]'
        }`}
        onClick={handleClick}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${gradientFrom} ${gradientTo} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
        
        {/* Ripple effect */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 w-0 h-0 bg-white/20 rounded-full transition-all duration-700 group-hover:w-96 group-hover:h-96 group-hover:-translate-x-48 group-hover:-translate-y-48"></div>
        </div>
        
        <CardContent className="p-6 text-center relative z-10">
          {/* Animated icon container */}
          <div className={`w-16 h-16 bg-gradient-to-br ${colorClass} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-lg group-hover:shadow-xl`}>
            <Icon className="h-8 w-8 text-white group-hover:scale-110 transition-transform duration-300" />
          </div>
          
          {/* Animated text */}
          <h3 className={`font-bold text-lg text-gray-900 mb-2 ${
            colorName === 'blue' ? 'group-hover:text-blue-700' :
            colorName === 'emerald' ? 'group-hover:text-emerald-700' :
            colorName === 'purple' ? 'group-hover:text-purple-700' : 'group-hover:text-orange-700'
          } transition-colors duration-300`}>{title}</h3>
          
          <p className={`text-sm text-gray-600 ${
            colorName === 'blue' ? 'group-hover:text-blue-600' :
            colorName === 'emerald' ? 'group-hover:text-emerald-600' :
            colorName === 'purple' ? 'group-hover:text-purple-600' : 'group-hover:text-orange-600'
          } transition-colors duration-300`}>{description}</p>
          
          {/* Animated metric */}
          <div className={`mt-3 text-lg font-bold ${
            colorName === 'blue' ? 'text-blue-600' :
            colorName === 'emerald' ? 'text-emerald-600' :
            colorName === 'purple' ? 'text-purple-600' : 'text-orange-600'
          } group-hover:scale-105 transition-transform duration-300`}>
            {metric}
          </div>
          
          {/* Animated bottom border */}
          <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r ${colorClass} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500`}></div>
          
          {/* Floating particles effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
            <div className="absolute top-4 left-4 w-1 h-1 bg-white/40 rounded-full animate-pulse"></div>
            <div className="absolute top-8 right-6 w-1 h-1 bg-white/40 rounded-full animate-pulse delay-100"></div>
            <div className="absolute bottom-6 left-8 w-1 h-1 bg-white/40 rounded-full animate-pulse delay-200"></div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}