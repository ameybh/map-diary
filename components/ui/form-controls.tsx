import * as React from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-semibold", className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "min-h-12 w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-3.5 py-3 text-base outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-magenta)]",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-32 w-full resize-y rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-3.5 py-3 text-base outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-magenta)]",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "min-h-12 w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-3.5 py-3 text-base outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-magenta)]",
        className
      )}
      {...props}
    />
  )
);
Select.displayName = "Select";
