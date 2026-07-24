import { type DefinedTheme, defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export type PaletteName = "signal" | "tide" | "ember";

const sharedTheme = {
  extends: neutralTheme,
  radius: { base: 4, multiplier: 1 },
  motion: { fast: 140, medium: 320, slow: 700, ratio: 0.75 },
  components: {
    card: {
      base: {
        borderRadius: "var(--radius-container)",
        boxShadow: "var(--shadow-low)",
      },
    },
    section: {
      base: { borderRadius: "var(--radius-page)" },
    },
    button: {
      base: { borderRadius: "var(--radius-element)" },
    },
    "segmented-control": {
      base: { borderRadius: "var(--radius-element)" },
    },
  },
} as const;

function paletteTheme(
  name: string,
  accent: [string, string],
  muted: [string, string],
): DefinedTheme {
  return defineTheme({
    ...sharedTheme,
    name,
    tokens: {
      "--color-accent": accent,
      "--color-text-accent": accent,
      "--color-icon-accent": accent,
      "--color-accent-muted": muted,
    },
  });
}

export const airwaveThemes: Record<PaletteName, DefinedTheme> = {
  signal: paletteTheme(
    "airwave-signal",
    ["#B0740E", "#F2B84B"],
    ["#B0740E26", "#F2B84B2E"],
  ),
  tide: paletteTheme(
    "airwave-tide",
    ["#177C75", "#76D8CC"],
    ["#177C7526", "#76D8CC2E"],
  ),
  ember: paletteTheme(
    "airwave-ember",
    ["#B4433A", "#F3A79D"],
    ["#B4433A26", "#F3A79D2E"],
  ),
};

export const paletteOptions = [
  { value: "signal", label: "Signal" },
  { value: "tide", label: "Tide" },
  { value: "ember", label: "Ember" },
];

export function isPaletteName(value: string): value is PaletteName {
  return value === "signal" || value === "tide" || value === "ember";
}
