import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useLocalStorageState } from "ahooks";

import { fontStackToCss } from "@/lib/fonts";
import {
  DEFAULT_ARTICLE_FONT_STACK,
  DEFAULT_PREFERENCES,
  DEFAULT_UI_FONT_STACK,
  MAX_FONT_STACK_SIZE,
  PreferencesContext,
  type PreferencesContextValue,
  type WritingPreferences,
} from "./preferences";

const PREFS_KEY = "novels-yes:preferences";

type StoredWritingPreferences = Partial<WritingPreferences> & {
  uiFont?: string;
  articleFont?: string;
};

const LEGACY_UI_FONT_STACKS: Record<string, readonly string[]> = {
  "system-sans": DEFAULT_UI_FONT_STACK,
  "system-serif": [
    "Georgia",
    "Times New Roman",
    "Songti SC",
    "SimSun",
    "Noto Serif CJK SC",
  ],
  "system-mono": [
    "Cascadia Code",
    "Consolas",
    "SF Mono",
    "Menlo",
    "Noto Sans Mono CJK SC",
  ],
};

const LEGACY_ARTICLE_FONT_STACKS: Record<string, readonly string[]> = {
  songti: DEFAULT_ARTICLE_FONT_STACK,
  "source-han-serif": ["Source Han Serif SC", "Noto Serif CJK SC", "Songti SC"],
  "lxgw-wenkai": ["LXGW WenKai", "霞鹜文楷", "Kaiti SC", "KaiTi", "STKaiti"],
  "system-sans": DEFAULT_UI_FONT_STACK,
};

function normalizeFontStack(
  current: unknown,
  legacyValue: string | undefined,
  legacyStacks: Record<string, readonly string[]>,
  fallback: readonly string[]
): string[] {
  const source = Array.isArray(current)
    ? current
    : legacyValue && legacyStacks[legacyValue]
      ? legacyStacks[legacyValue]
      : fallback;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of source) {
    if (typeof value !== "string") continue;
    const fontFamily = value.trim();
    const key = fontFamily.toLocaleLowerCase();
    if (!fontFamily || seen.has(key)) continue;

    seen.add(key);
    result.push(fontFamily);
    if (result.length === MAX_FONT_STACK_SIZE) break;
  }

  return result.length > 0 ? result : [...fallback];
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorageState<StoredWritingPreferences>(
    PREFS_KEY,
    {
      defaultValue: DEFAULT_PREFERENCES,
    }
  );

  const prefs = useMemo<WritingPreferences>(() => {
    const { uiFont, articleFont, ...value } = stored ?? {};
    return {
      ...DEFAULT_PREFERENCES,
      ...value,
      uiFontStack: normalizeFontStack(
        value.uiFontStack,
        uiFont,
        LEGACY_UI_FONT_STACKS,
        DEFAULT_UI_FONT_STACK
      ),
      articleFontStack: normalizeFontStack(
        value.articleFontStack,
        articleFont,
        LEGACY_ARTICLE_FONT_STACKS,
        DEFAULT_ARTICLE_FONT_STACK
      ),
    };
  }, [stored]);

  /* 把排版偏好同步到 DOM 变量，正文与界面各用各的变量，互不干扰。 */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--app-font-ui",
      fontStackToCss(prefs.uiFontStack, "sans-serif")
    );
    root.style.setProperty("--app-font-ui-size", `${prefs.uiFontSize}px`);
    root.style.setProperty(
      "--app-font-ui-root-size",
      `${prefs.uiFontSize / 0.875}px`
    );
    root.style.setProperty(
      "--app-font-article",
      fontStackToCss(prefs.articleFontStack, "serif")
    );
    root.style.setProperty("--app-font-article-size", `${prefs.fontSize}px`);
    root.style.setProperty("--app-line-height", String(prefs.lineHeight));
    root.style.setProperty("--app-line-width", `${prefs.lineWidth}em`);
    root.style.setProperty("--app-indent", `${prefs.indentSpaces}em`);
    root.style.setProperty(
      "--app-paragraph-gap",
      prefs.paragraphGap ? "0.9em" : "0"
    );
  }, [prefs]);

  const setPref = useCallback(
    <K extends keyof WritingPreferences>(
      key: K,
      value: WritingPreferences[K]
    ) => {
      setStored({ ...prefs, [key]: value });
    },
    [prefs, setStored]
  );

  const updatePrefs = useCallback(
    (patch: Partial<WritingPreferences>) => {
      const next = { ...prefs, ...patch };
      setStored(next);
      return next;
    },
    [prefs, setStored]
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({ prefs, setPref, updatePrefs }),
    [prefs, setPref, updatePrefs]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}
