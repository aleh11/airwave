import { type DefinedTheme, defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export type PaletteName = "air" | "tide" | "ember";

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
  air: paletteTheme(
    "airwave-air",
    ["#5367C9", "#AEB8FF"],
    ["#5367C926", "#AEB8FF2E"],
  ),
  tide: paletteTheme(
    "airwave-tide",
    ["#177C75", "#76D8CC"],
    ["#177C7526", "#76D8CC2E"],
  ),
  ember: paletteTheme(
    "airwave-ember",
    ["#B45449", "#F3A79D"],
    ["#B4544926", "#F3A79D2E"],
  ),
};

export const paletteOptions = [
  { value: "air", label: "Air" },
  { value: "tide", label: "Tide" },
  { value: "ember", label: "Ember" },
];

export function isPaletteName(value: string): value is PaletteName {
  return value === "air" || value === "tide" || value === "ember";
}
