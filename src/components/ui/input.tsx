import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "focus-ring flex h-9 w-full rounded-md border border-input bg-card/70 px-2.5 py-2 text-[13px] text-foreground transition-colors placeholder:text-muted-foreground/55 focus-visible:border-ring/70 disabled:cursor-not-allowed disabled:opacity-50",
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
      "focus-ring flex min-h-[90px] w-full resize-y rounded-md border border-input bg-card/70 px-2.5 py-2 text-[13px] leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/55 focus-visible:border-ring/70 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
