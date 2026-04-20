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
  changeColor = "text-emerald-600",
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
    ? 'bg-slate-800 border-slate-700'
    : currentTheme === 'minimal'
    ? 'bg-white border-slate-200 shadow-sm'
    : 'bg-white border-slate-200 shadow-sm';

  const textColor = currentTheme === 'dark' ? 'text-white' : 'text-slate-900';
  const subtextColor = currentTheme === 'dark' ? 'text-slate-400' : 'text-slate-500';

  if (loading) {
    return (
      <Card className={cn("animate-pulse", className)}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-3"></div>
              <div className="h-8 bg-slate-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-slate-200 rounded w-2/3"></div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-slate-200"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(
      "group cursor-pointer transition-shadow duration-200 hover:shadow-md",
      cardBg,
      className
    )}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className={cn("text-xs font-medium uppercase tracking-wide mb-1.5", subtextColor)}>
              {title}
            </p>
            <p className={cn("text-2xl font-bold mb-1 tracking-tight", textColor)}>
              {value}
            </p>
            {change && (
              <p className={cn("text-xs font-medium", changeColor)}>
                {change}
              </p>
            )}
          </div>
          {tooltip ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center cursor-help flex-shrink-0",
                    currentTheme === 'dark' ? 'bg-slate-700' : iconBg
                  )}>
                    <Icon className={cn("h-5 w-5",
                      currentTheme === 'dark' ? 'text-slate-300' : iconColor)} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0",
              currentTheme === 'dark' ? 'bg-slate-700' : iconBg
            )}>
              <Icon className={cn("h-5 w-5",
                currentTheme === 'dark' ? 'text-slate-300' : iconColor)} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
