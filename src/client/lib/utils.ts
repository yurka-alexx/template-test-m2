import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Klassen zusammenführen, spätere Tailwind-Klassen gewinnen (shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
