import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "press focus-ring inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-primary/88",
        secondary:
          "border border-border bg-card text-secondary-foreground hover:bg-secondary",
        outline:
          "border border-border bg-transparent hover:bg-secondary hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        soft: "bg-primary/9 text-primary hover:bg-primary/14",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/88",
        success: "bg-success text-success-foreground hover:bg-success/88",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 gap-1 rounded-sm px-2 text-[11.5px] [&_svg]:size-3.5",
        sm: "h-8 px-2.5 text-[12.5px]",
        default: "h-9 px-3.5",
        lg: "h-10 px-5 text-[13.5px]",
        icon: "size-9",
        "icon-sm": "size-7 rounded-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
