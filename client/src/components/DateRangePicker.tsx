import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar, ChevronDown, Check } from "lucide-react";
import { format, startOfToday, subDays, subMonths, subYears, startOfMonth, endOfMonth, endOfDay, isToday, isYesterday } from "date-fns";

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const predefinedRanges = [
  {
    label: "Today",
    getValue: () => ({
      from: startOfToday(),
      to: new Date(),
      label: "Today"
    })
  },
  {
    label: "Yesterday",
    getValue: () => ({
      from: subDays(startOfToday(), 1),
      to: endOfDay(subDays(startOfToday(), 1)),
      label: "Yesterday"
    })
  },
  {
    label: "Last 7 days",
    getValue: () => ({
      from: subDays(startOfToday(), 6),
      to: endOfDay(startOfToday()),
      label: "Last 7 days"
    })
  },
  {
    label: "Last 30 days",
    getValue: () => ({
      from: subDays(startOfToday(), 29),
      to: endOfDay(startOfToday()),
      label: "Last 30 days"
    })
  },
  {
    label: "Last 90 days",
    getValue: () => ({
      from: subDays(startOfToday(), 89),
      to: endOfDay(startOfToday()),
      label: "Last 90 days"
    })
  },
  {
    label: "Last 365 days",
    getValue: () => ({
      from: subDays(startOfToday(), 364),
      to: endOfDay(startOfToday()),
      label: "Last 365 days"
    })
  },
  {
    label: "Last month",
    getValue: () => {
      const lastMonth = subMonths(startOfToday(), 1);
      return {
        from: startOfMonth(lastMonth),
        to: endOfMonth(lastMonth),
        label: "Last month"
      };
    }
  },
  {
    label: "Last 12 months",
    getValue: () => ({
      from: subMonths(startOfToday(), 12),
      to: endOfDay(startOfToday()),
      label: "Last 12 months"
    })
  },
  {
    label: "Last year",
    getValue: () => ({
      from: subYears(startOfToday(), 1),
      to: endOfDay(startOfToday()),
      label: "Last year"
    })
  }
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date>(value.from);
  const [customTo, setCustomTo] = useState<Date>(value.to);

  const handleRangeSelect = (range: DateRange) => {
    onChange(range);
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    const customRange = {
      from: customFrom,
      to: endOfDay(customTo),
      label: `${format(customFrom, "MMM d, yyyy")} - ${format(customTo, "MMM d, yyyy")}`
    };
    onChange(customRange);
    setIsOpen(false);
  };

  const formatDateDisplay = (range: DateRange) => {
    if (isToday(range.from) && isToday(range.to)) {
      return "Today";
    }
    if (isYesterday(range.from) && isYesterday(range.to)) {
      return "Yesterday";
    }
    if (range.label.startsWith("Last")) {
      return range.label;
    }
    return `${format(range.from, "MMM d, yyyy")} - ${format(range.to, "MMM d, yyyy")}`;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-auto justify-start text-left font-normal bg-white border-gray-200 hover:bg-gray-50 ${className}`}
        >
          <Calendar className="mr-2 h-4 w-4 text-gray-500" />
          {formatDateDisplay(value)}
          <ChevronDown className="ml-2 h-4 w-4 text-gray-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(calc(100vw-2rem),420px)] p-0 shadow-lg border-gray-200 overflow-hidden" align="end">
        <Card className="border-0">
          <CardContent className="p-0">
            <div className="flex flex-col sm:flex-row min-w-0">
              {/* Presets list */}
              <div className="w-full sm:w-48 border-b border-gray-100 sm:border-b-0 sm:border-r bg-gray-50 max-h-48 overflow-y-auto sm:max-h-none">
                <div className="p-3 space-y-1">
                  {predefinedRanges.map((range, index) => {
                    const rangeValue = range.getValue();
                    const isSelected = value.label === rangeValue.label;

                    return (
                      <button
                        key={index}
                        onClick={() => handleRangeSelect(rangeValue)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between ${
                          isSelected
                            ? "bg-gray-900 text-white"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        {range.label}
                        {isSelected && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom date inputs */}
              <div className="w-full sm:min-w-0 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From
                    </label>
                    <input
                      type="date"
                      value={format(customFrom, "yyyy-MM-dd")}
                      onChange={(e) => setCustomFrom(new Date(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center justify-center pt-6">
                    <div className="w-3 h-px bg-gray-300"></div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To
                    </label>
                    <input
                      type="date"
                      value={format(customTo, "yyyy-MM-dd")}
                      onChange={(e) => setCustomTo(new Date(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                    className="text-gray-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCustomApply}
                    className="bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
