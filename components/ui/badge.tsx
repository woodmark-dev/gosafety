import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "success" | "warning" | "danger";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
};

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        variants.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const variant: BadgeVariant =
    key === "closed" || key === "manager_confirmed"
      ? "success"
      : key === "resolved"
        ? "warning"
        : key === "canceled"
          ? "danger"
          : "neutral";

  return <Badge className={variants[variant]}>{status.replaceAll("_", " ")}</Badge>;
}
