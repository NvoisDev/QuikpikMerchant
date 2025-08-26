import * as React from "react"
import { cn } from "@/lib/utils"

export interface AnimatedInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  focusGlow?: boolean
  scaleOnFocus?: boolean
}

const AnimatedInput = React.forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ className, type, focusGlow = true, scaleOnFocus = true, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200",
          focusGlow && "focus:shadow-lg focus:shadow-primary/20",
          scaleOnFocus && "focus:scale-[1.01]",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
AnimatedInput.displayName = "AnimatedInput"

export { AnimatedInput }