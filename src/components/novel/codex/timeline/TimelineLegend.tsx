import { Eye, EyeOff, Settings2 } from "lucide-react";

import { useI18n } from "@/composables";
import { useThemeContext } from "@/contexts/theme";
import type { EmotionType } from "@/services/timeline";
import { Button } from "@/components/ui/button";

interface TimelineLegendProps {
  types: EmotionType[];
  counts: Map<string, number>;
  visibleTypeIds: Set<string>;
  onToggleType: (typeId: string) => void;
  onShowHidden: () => void;
  onManageTypes: () => void;
}

export function TimelineLegend({
  types,
  counts,
  visibleTypeIds,
  onToggleType,
  onShowHidden,
  onManageTypes,
}: TimelineLegendProps) {
  const { t } = useI18n();
  const { theme } = useThemeContext();
  const hiddenWithData = types.filter(
    (type) => !visibleTypeIds.has(type.id) && (counts.get(type.id) ?? 0) > 0
  ).length;

  return (
    <div className="bg-background shrink-0 border-b px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="scrollbar-app flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          {types.length ? (
            types.map((type) => {
              const visible = visibleTypeIds.has(type.id);
              const color = type.color[theme];
              return (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={visible}
                  className={[
                    "flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
                    visible
                      ? "bg-background text-foreground border-border shadow-xs"
                      : "text-muted-foreground hover:text-foreground border-transparent bg-neutral-100/65 dark:bg-neutral-800/45",
                  ].join(" ")}
                  title={
                    type.hidden
                      ? `${type.name} · ${t("Codex.timeline.typeHidden")}`
                      : type.name
                  }
                  onClick={() => onToggleType(type.id)}
                >
                  <span
                    className={[
                      "size-2.5 shrink-0 rounded-full border",
                      visible ? "" : "opacity-45 grayscale",
                    ].join(" ")}
                    style={{
                      backgroundColor: visible ? color : "transparent",
                      borderColor: color,
                    }}
                  />
                  <span className={visible ? "" : "opacity-65"}>
                    {type.name}
                  </span>
                  <span className="text-muted-foreground/70 tabular-nums">
                    {counts.get(type.id) ?? 0}
                  </span>
                  {visible ? (
                    <Eye className="size-3 opacity-55" />
                  ) : (
                    <EyeOff className="size-3 opacity-70" />
                  )}
                </button>
              );
            })
          ) : (
            <span className="text-muted-foreground px-1 text-xs">
              {t("Codex.timeline.noTypes")}
            </span>
          )}
        </div>

        {hiddenWithData ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-7 shrink-0 px-2 text-[11px]"
            onClick={onShowHidden}
          >
            {t("Codex.timeline.showHidden").replace(
              "{count}",
              String(hiddenWithData)
            )}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 px-2 text-[11px]"
          onClick={onManageTypes}
          aria-label={t("Codex.timeline.manageTypes")}
          title={t("Codex.timeline.manageTypes")}
        >
          <Settings2 className="size-3" />
          <span className="hidden sm:inline">
            {t("Codex.timeline.manageTypes")}
          </span>
        </Button>
      </div>
    </div>
  );
}
