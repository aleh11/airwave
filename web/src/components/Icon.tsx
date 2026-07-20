import type { ReactNode } from "react";

interface IconProps {
  name:
    | "alarm"
    | "browser"
    | "chart"
    | "chevronLeft"
    | "chevronRight"
    | "clock"
    | "close"
    | "delete"
    | "device"
    | "discover"
    | "edit"
    | "heart"
    | "library"
    | "pause"
    | "play"
    | "plus"
    | "search"
    | "signal"
    | "volume";
  className?: string;
  filled?: boolean;
}

export function Icon({ name, className = "h-5 w-5", filled = false }: IconProps) {
  const paths: Record<IconProps["name"], ReactNode> = {
    alarm: <><circle cx="12" cy="13" r="7"/><path d="M12 10v4l3 2M5 3 2 6m17-3 3 3M7 21l-1 2m11-2 1 2"/></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></>,
    chart: <><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></>,
    chevronLeft: <path d="m15 18-6-6 6-6"/>,
    chevronRight: <path d="m9 18 6-6-6-6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    delete: <><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></>,
    device: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 17h6M12 7v6"/></>,
    discover: <><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></>,
    edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>,
    library: <><path d="M4 4h4v16H4zM10 4h4v16h-4zM17 5l3-1 3 15-3 1z"/></>,
    pause: <><path d="M8 5v14M16 5v14"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    signal: <><path d="M4 16a11 11 0 0 1 16 0M7 19a7 7 0 0 1 10 0M10 22a3 3 0 0 1 4 0"/><circle cx="12" cy="4" r="2"/></>,
    volume: <><path d="M5 10v4h4l5 4V6L9 10H5Z"/><path d="M18 9a5 5 0 0 1 0 6M20 6a9 9 0 0 1 0 12"/></>,
  };
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
