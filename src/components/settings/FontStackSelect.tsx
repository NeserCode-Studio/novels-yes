import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  LoaderCircle,
  X,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/composables";
import { MAX_FONT_STACK_SIZE } from "@/contexts/preferences";
import { fontFamilyToCss } from "@/lib/fonts";

interface FontStackSelectProps {
  title: string;
  value: string[];
  options: string[];
  loading: boolean;
  loadFailed: boolean;
  onChange: (value: string[]) => void;
}

export default function FontStackSelect({
  title,
  value,
  options,
  loading,
  loadFailed,
  onChange,
}: FontStackSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const fontOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const font of [...options, ...value]) {
      const name = font.trim();
      if (name && !names.has(name.toLocaleLowerCase())) {
        names.set(name.toLocaleLowerCase(), name);
      }
    }
    return [...names.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" })
    );
  }, [options, value]);

  const toggleFont = (font: string) => {
    const selectedIndex = value.findIndex(
      (item) => item.toLocaleLowerCase() === font.toLocaleLowerCase()
    );
    if (selectedIndex >= 0) {
      if (value.length > 1) {
        onChange(value.filter((_, index) => index !== selectedIndex));
      }
      return;
    }
    if (value.length < MAX_FONT_STACK_SIZE) {
      onChange([...value, font]);
    }
  };

  const moveFont = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= value.length) return;

    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-44 justify-between px-3 font-normal"
          title={value.join(", ")}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {value.join(", ")}
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(40rem,calc(100vh-2rem))] w-[min(36rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t("Prefs.font.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b p-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-muted-foreground text-xs">
              {t("Prefs.font.stack")}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {value.length} / {MAX_FONT_STACK_SIZE}
            </span>
          </div>
          <div className="scrollbar-app flex max-h-36 flex-col gap-1 overflow-y-auto">
            {value.map((font, index) => (
              <div
                key={font}
                className="bg-muted/40 flex h-8 items-center gap-1 rounded-sm px-1.5"
              >
                <span className="text-muted-foreground w-4 shrink-0 text-center text-[11px] tabular-nums">
                  {index + 1}
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  style={{ fontFamily: fontFamilyToCss(font) }}
                >
                  {font}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-6 p-0"
                  aria-label={t("Prefs.font.moveUp")}
                  disabled={index === 0}
                  onClick={() => moveFont(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-6 p-0"
                  aria-label={t("Prefs.font.moveDown")}
                  disabled={index === value.length - 1}
                  onClick={() => moveFont(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-6 p-0"
                  aria-label={t("Prefs.font.remove")}
                  disabled={value.length === 1}
                  onClick={() =>
                    onChange(
                      value.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Command className="min-h-0 flex-1">
          <CommandInput autoFocus placeholder={t("Prefs.font.search")} />
          {loadFailed ? (
            <p className="text-muted-foreground shrink-0 border-b px-3 py-2 text-xs">
              {t("Prefs.font.error")}
            </p>
          ) : null}
          <CommandList className="scrollbar-app max-h-none min-h-0 flex-1">
            <CommandEmpty>
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t("Prefs.font.loading")}
                </span>
              ) : (
                t("Prefs.font.empty")
              )}
            </CommandEmpty>
            {fontOptions.map((font) => {
              const selectedIndex = value.findIndex(
                (item) => item.toLocaleLowerCase() === font.toLocaleLowerCase()
              );
              const selected = selectedIndex >= 0;
              return (
                <CommandItem
                  key={font}
                  value={font}
                  disabled={!selected && value.length >= MAX_FONT_STACK_SIZE}
                  onSelect={() => toggleFont(font)}
                >
                  <Check className={selected ? "opacity-100" : "opacity-0"} />
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={{ fontFamily: fontFamilyToCss(font) }}
                  >
                    {font}
                  </span>
                  {selected ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {selectedIndex + 1}
                    </span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
