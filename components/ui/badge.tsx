import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-[50px] border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-1 text-sm",
        className
      )}
      {...props}
    />
  );
}
