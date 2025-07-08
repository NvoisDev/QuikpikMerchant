import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeColor?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  loading?: boolean;
  className?: string;
  tooltip?: string;
}

export default function StatsCard({
  title,
  value,
  change,
  changeColor = "text-green-600",
  icon: Icon,
  iconColor = "text-blue-600",
  iconBg = "bg-blue-100",
  loading = false,
  className,
  tooltip
}: StatsCardProps) {
  const { currentTheme } = useTheme();
  
  // Theme-aware styling
  const cardBg = currentTheme === 'dark' 
    ? 'bg-gray-800 border-gray-700'
    : currentTheme === 'minimal'
    ? 'bg-white border-gray-200 shadow-lg'
    : 'bg-gradient-to-br from-blue-500 to-purple-600 border-0 text-white';

  const textColor = currentTheme === 'minimal' ? 'text-gray-900' : 'text-white';
  const subtextColor = currentTheme === 'minimal' ? 'text-gray-600' : 'text-white/80';
  if (loading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-4 bg-gray-300 rounded w-3/4 mb-3"></div>
              <div className="h-8 bg-gray-300 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-300 rounded w-2/3"></div>
            </div>
            <div className={cn("w-12 h-12 rounded-lg bg-gray-300")}></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "group cursor-pointer transform transition-all duration-300 ease-out", 
      "hover:shadow-xl hover:-translate-y-1 hover:scale-105",
      cardBg,
      className
    )}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1 transition-colors duration-300">
            <p className={cn("text-sm font-medium mb-1 transition-colors duration-300", subtextColor)}>
              {title}
            </p>
            <p className={cn("text-2xl font-bold mb-1 transition-colors duration-300", textColor)}>
              {value}
            </p>
            {change && (
              <p className={cn("text-sm transition-colors duration-300", changeColor, "group-hover:opacity-80")}>
                {change}
              </p>
            )}
          </div>
          {tooltip ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center cursor-help",
                    "transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3",
                    "group-hover:shadow-lg",
                    currentTheme === 'minimal' ? iconBg : 'bg-white/20'
                  )}>
                    <Icon className={cn("h-6 w-6 transition-all duration-300 group-hover:scale-110", 
                      currentTheme === 'minimal' ? iconColor : 'text-white')} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center",
              "transition-all duration-300 transform group-hover:scale-110 group-hover:rotate-3",
              "group-hover:shadow-lg",
              currentTheme === 'minimal' ? iconBg : 'bg-white/20'
            )}>
              <Icon className={cn("h-6 w-6 transition-all duration-300 group-hover:scale-110", 
                currentTheme === 'minimal' ? iconColor : 'text-white')} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
