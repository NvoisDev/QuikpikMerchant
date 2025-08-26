import * as React from "react"
import { cn } from "@/lib/utils"

const AnimatedCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    hoverScale?: boolean
    fadeIn?: boolean
    bounceIn?: boolean
    delay?: number
  }
>(({ className, hoverScale = true, fadeIn = true, bounceIn = false, delay = 0, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-300",
      hoverScale && "hover:scale-[1.02] hover:shadow-lg hover:-translate-y-1",
      fadeIn && "animate-fade-in",
      bounceIn && "animate-bounce-gentle",
      className
    )}
    style={{
      animationDelay: `${delay}ms`
    }}
    {...props}
  />
))
AnimatedCard.displayName = "AnimatedCard"

const AnimatedCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
AnimatedCardHeader.displayName = "AnimatedCardHeader"

const AnimatedCardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
AnimatedCardTitle.displayName = "AnimatedCardTitle"

const AnimatedCardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
AnimatedCardDescription.displayName = "AnimatedCardDescription"

const AnimatedCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
AnimatedCardContent.displayName = "AnimatedCardContent"

const AnimatedCardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
AnimatedCardFooter.displayName = "AnimatedCardFooter"

export {
  AnimatedCard,
  AnimatedCardHeader,
  AnimatedCardTitle,
  AnimatedCardDescription,
  AnimatedCardContent,
  AnimatedCardFooter,
}