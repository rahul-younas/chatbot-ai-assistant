import React from "react";
import { cn } from "../../lib/utils";

const variantClasses = {
  default: "bg-primary text-primary-foreground hover:brightness-110",
  secondary: "bg-secondary text-secondary-foreground hover:brightness-110",
  outline: "border border-input bg-background hover:bg-muted/60",
  ghost: "hover:bg-muted/60",
  destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
};

const sizeClasses = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3 rounded-lg",
  icon: "h-10 w-10",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:pointer-events-none disabled:opacity-50 ring-offset-background",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  );
}

