import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function cleanText(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? "").trim();
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(dateString: string) {
  if (!dateString) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(dateString));
}

export function formatLatLng(lat: number, lng: number) {
  return `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? "N" : "S"} · ${Math.abs(lng).toFixed(2)} ${
    lng >= 0 ? "E" : "W"
  }`;
}

export function initials(name: string) {
  return cleanText(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
