import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
    getValue: () => ({ from: startOfToday(), to: new Date(), label: "Today" })
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
    getValue: () => ({ from: subDays(startOfToday(), 6), to: endOfDay(startOfToday()), label: "Last 7 days" })
  },
  {
    label: "Last 30 days",
    getValue: () => ({ from: subDays(startOfToday(), 29), to: endOfDay(startOfToday()), label: "Last 30 days" })
  },
  {
    label: "Last 90 days",
    getValue: () => ({ from: subDays(startOfToday(), 89), to: endOfDay(startOfToday()), label: "Last 90 days" })
  },
  {
    label: "Last 365 days",
    getValue: () => ({ from: subDays(startOfToday(), 364), to: endOfDay(startOfToday()), label: "Last 365 days" })
  },
  {
    label: "Last month",
    getValue: () => {
      const lastMonth = subMonths(startOfToday(), 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth), label: "Last month" };
    }
  },
  {
    label: "Last 12 months",
    getValue: () => ({ from: subMonths(startOfToday(), 12), to: endOfDay(startOfToday()), label: "Last 12 months" })
  },
  {
    label: "Last year",
    getValue: () => ({ from: subYears(startOfToday(), 1), to: endOfDay(startOfToday()), label: "Last year" })
  }
];

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    setIsMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

function formatDateDisplay(range: DateRange) {
  if (isToday(range.from) && isToday(range.to)) return "Today";
  if (isYesterday(range.from) && isYesterday(range.to)) return "Yesterday";
  if (range.label.startsWith("Last")) return range.label;
  return `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;
}

function PickerBody({
  value,
  customFrom,
  customTo,
  onRangeSelect,
  onCustomFromChange,
  onCustomToChange,
  onCancel,
  onApply,
}: {
  value: DateRange;
  customFrom: Date;
  customTo: Date;
  onRangeSelect: (r: DateRange) => void;
  onCustomFromChange: (d: Date) => void;
  onCustomToChange: (d: Date) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-col">
      {/* Presets */}
      <div className="p-3 space-y-1">
        {predefinedRanges.map((range, index) => {
          const rv = range.getValue();
          const isSelected = value.label === rv.label;
          return (
            <button
              key={index}
              onClick={() => onRangeSelect(rv)}
              className={`w-full text-left px-3 py-2.5 text-sm rounded-md transition-colors flex items-center justify-between ${
                isSelected
                  ? "bg-gray-900 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {range.label}
              {isSelected && <Check className="h-4 w-4 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-3" />

      {/* Custom range */}
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Custom range</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <input
              type="date"
              value={format(customFrom, "yyyy-MM-dd")}
              onChange={(e) => onCustomFromChange(new Date(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input
              type="date"
              value={format(customTo, "yyyy-MM-dd")}
              onChange={(e) => onCustomToChange(new Date(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} className="text-gray-600">
            Cancel
          </Button>
          <Button size="sm" onClick={onApply} className="bg-gray-900 hover:bg-gray-800 text-white">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date>(value.from);
  const [customTo, setCustomTo] = useState<Date>(value.to);
  const isMobile = useIsMobile();

  const handleRangeSelect = (range: DateRange) => {
    onChange(range);
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    onChange({
      from: customFrom,
      to: endOfDay(customTo),
      label: `${format(customFrom, "MMM d, yyyy")} – ${format(customTo, "MMM d, yyyy")}`
    });
    setIsOpen(false);
  };

  const bodyProps = {
    value,
    customFrom,
    customTo,
    onRangeSelect: handleRangeSelect,
    onCustomFromChange: setCustomFrom,
    onCustomToChange: setCustomTo,
    onCancel: () => setIsOpen(false),
    onApply: handleCustomApply,
  };

  const buttonContent = (
    <>
      <Calendar className="mr-2 h-4 w-4 text-gray-500 flex-shrink-0" />
      <span className="truncate">{formatDateDisplay(value)}</span>
      <ChevronDown className="ml-2 h-4 w-4 text-gray-500 flex-shrink-0" />
    </>
  );

  if (isMobile) {
    return (
      <>
        <Button
          variant="outline"
          className={`w-auto justify-start text-left font-normal bg-white border-gray-200 hover:bg-gray-50 ${className}`}
          onClick={() => setIsOpen(true)}
        >
          {buttonContent}
        </Button>
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent side="bottom" className="px-0 pb-0 rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <SheetHeader className="px-4 pb-2 border-b border-gray-100">
              <SheetTitle className="text-base">Select date range</SheetTitle>
            </SheetHeader>
            <PickerBody {...bodyProps} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-auto justify-start text-left font-normal bg-white border-gray-200 hover:bg-gray-50 ${className}`}
        >
          {buttonContent}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 shadow-lg border-gray-200" align="end">
        <PickerBody {...bodyProps} />
      </PopoverContent>
    </Popover>
  );
}
