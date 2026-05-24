import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[50px] text-base font-medium transition-[background-color,color,border-color,transform,opacity] duration-200 ease-out active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-magenta)]",
  {
    variants: {
      variant: {
        primary: "bg-[var(--primary)] text-[var(--on-primary)]",
        secondary:
          "border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)] hover:bg-[var(--surface-soft)]",
        ghost: "bg-transparent text-[var(--ink)] hover:bg-[var(--surface-soft)]",
        magenta: "bg-[var(--accent-magenta)] text-[var(--on-primary)]",
        danger: "bg-[var(--semantic-danger)] text-[var(--on-primary)]"
      },
      size: {
        default: "px-5 py-2.5",
        sm: "min-h-10 px-4 py-2 text-sm",
        icon: "h-11 w-11 rounded-full p-0",
        tab: "min-h-10 px-4 py-2"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);

Button.displayName = "Button";

export { buttonVariants };
