import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-600",
        className
      )}
      {...props}
    />
  );
}
