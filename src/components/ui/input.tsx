import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "focus-ring flex h-10 w-full rounded-lg bg-secondary/60 px-3 py-2 text-[13px] text-foreground transition-colors placeholder:text-muted-foreground/70 hover:bg-secondary/80 focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "focus-ring flex min-h-[90px] w-full resize-y rounded-lg bg-secondary/60 px-3 py-2.5 text-[13px] leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/70 hover:bg-secondary/80 focus-visible:bg-card disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
