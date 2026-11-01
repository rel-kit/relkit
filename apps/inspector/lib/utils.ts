import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets later Tailwind utilities override earlier ones (shadcn convention). */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
