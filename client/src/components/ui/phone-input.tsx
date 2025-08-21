import React from "react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";
import type { E164Number } from "libphonenumber-js/core";

interface PhoneNumberInputProps {
  value?: E164Number;
  onChange?: (value: E164Number | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  defaultCountry?: "GB" | "US" | "CA" | "AU";
}

export function PhoneNumberInput({
  value,
  onChange,
  placeholder = "Enter phone number",
  className,
  disabled = false,
  defaultCountry = "GB"
}: PhoneNumberInputProps) {
  return (
    <div className={cn("relative", className)}>
      <PhoneInput
        international
        countryCallingCodeEditable={false}
        defaultCountry={defaultCountry}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <style dangerouslySetInnerHTML={{
        __html: `
          .PhoneInput {
            display: flex;
            align-items: center;
          }
          
          .PhoneInputCountry {
            margin-right: 8px;
            flex-shrink: 0;
          }
          
          .PhoneInputCountryIcon {
            width: 20px;
            height: 15px;
            border: 1px solid #ccc;
            border-radius: 2px;
          }
          
          .PhoneInputCountrySelect {
            background: transparent;
            border: none;
            padding: 0;
            margin-left: 4px;
            font-size: 14px;
            color: #666;
          }
          
          .PhoneInputInput {
            flex: 1;
            border: none;
            outline: none;
            background: transparent;
            font-size: 14px;
            padding: 0;
          }
          
          .PhoneInputInput:disabled {
            cursor: not-allowed;
            opacity: 0.5;
          }
        `
      }} />
    </div>
  );
}

export default PhoneNumberInput;