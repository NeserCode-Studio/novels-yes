import type { EmotionType, EmotionTypeConfig } from "./types";

const DEFAULT_EMOTION_TYPES: EmotionType[] = [
  {
    id: "preset-xi",
    name: "喜",
    color: { light: "#A56A18", dark: "#E3B45D" },
    order: 0,
    hidden: false,
    preset: true,
  },
  {
    id: "preset-nu",
    name: "怒",
    color: { light: "#B94A3F", dark: "#F08A7D" },
    order: 1,
    hidden: false,
    preset: true,
  },
  {
    id: "preset-ai",
    name: "哀",
    color: { light: "#587596", dark: "#91B5D1" },
    order: 2,
    hidden: false,
    preset: true,
  },
  {
    id: "preset-le",
    name: "乐",
    color: { light: "#2F7F70", dark: "#68C5B2" },
    order: 3,
    hidden: false,
    preset: true,
  },
];

export function defaultEmotionTypeConfig(): EmotionTypeConfig {
  return {
    version: 1,
    seeded: true,
    types: DEFAULT_EMOTION_TYPES.map((type) => ({
      ...type,
      color: { ...type.color },
    })),
  };
}
