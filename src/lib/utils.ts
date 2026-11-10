import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { getLocale, t, tp } from "@/i18n/core";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pct(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function plural(count: number, one: string, many = `${one}s`) {
  return count === 1 ? one : many;
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return t("{seconds} s", { seconds: total });
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const rest = total % 60;
    return rest === 0
      ? t("{minutes} min", { minutes })
      : t("{minutes} min {seconds} s", { minutes, seconds: rest });
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? t("{hours} h", { hours })
    : t("{hours} h {minutes} min", { hours, minutes: rest });
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(getLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(getLocale(), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return t("never");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t("never");
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return t("just now");
  if (minutes < 60) return t("{count} min ago", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tp(hours, "{count} hour ago", "{count} hours ago");
  const days = Math.round(hours / 24);
  if (days === 1) return t("yesterday");
  if (days < 30) return t("{count} days ago", { count: days });
  return formatDate(iso);
}

export function shortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(getLocale(), { day: "numeric", month: "short" });
}

export function weekday(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString(getLocale(), { weekday: "short" });
}

export function isDueToday(iso: string | null) {
  if (!iso) return false;
  return new Date(iso).getTime() <= Date.now();
}

export function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return t("Still up");
  if (hour < 12) return t("Good morning");
  if (hour < 18) return t("Good afternoon");
  return t("Good evening");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export function downloadTextFile(name: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return t("Something went wrong.");
}

const MODE_LABEL_KEYS: Record<string, string> = {
  flashcards: "Flashcards",
  adaptive: "Adaptive learning",
  write: "Writing",
  spaced: "Spaced repetition",
  test: "Practice test",
  matching: "Matching game",
  review: "Review",
};

export function modeLabel(mode: string) {
  return t(MODE_LABEL_KEYS[mode] ?? mode);
}

export const CARD_TYPES = [
  { value: "term_definition", label: "Term & definition" },
  { value: "question_answer", label: "Question & answer" },
  { value: "vocabulary", label: "Vocabulary & translation" },
  { value: "formula", label: "Formula & explanation" },
  { value: "date_event", label: "Date & event" },
  { value: "custom", label: "Custom" },
];
