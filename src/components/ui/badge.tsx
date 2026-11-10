import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] transition-colors [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/8 text-primary",
        secondary: "border-border bg-secondary/60 text-secondary-foreground",
        outline: "border-border text-muted-foreground",
        success: "border-success/25 bg-success/8 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        destructive: "border-destructive/25 bg-destructive/8 text-destructive",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
