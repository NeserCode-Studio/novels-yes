import { CalendarClock } from "lucide-react";

import { useI18n } from "@/composables";
import { useThemeContext } from "@/contexts/theme";
import type { TimelineChapter, TimelineEmotionPointView } from "./shared";

interface EmotionPointQueueProps {
  title: string;
  hint: string;
  points: TimelineEmotionPointView[];
  chaptersById: Map<string, TimelineChapter>;
  onEditPoint: (pointId: string) => void;
}

export function EmotionPointQueue({
  title,
  hint,
  points,
  chaptersById,
  onEditPoint,
}: EmotionPointQueueProps) {
  const { t } = useI18n();
  const { theme } = useThemeContext();

  if (!points.length) return null;

  return (
    <section className="border-t px-3 py-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {points.length}
        </span>
        <p className="text-muted-foreground ml-auto hidden text-[11px] sm:block">
          {hint}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
        {points.map(({ point, type }) => (
          <button
            key={point.id}
            type="button"
            className="border-border/60 hover:bg-accent/30 min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors"
            onClick={() => onEditPoint(point.id)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    type?.color[theme] ?? "var(--muted-foreground)",
                }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {type?.name ?? t("Codex.timeline.unknownType")}
              </span>
              <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                {point.intensity
                  ? `${point.intensity}/5`
                  : t("Codex.timeline.unrated")}
              </span>
            </div>
            <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1 text-[10px]">
              <CalendarClock className="size-3 shrink-0" />
              <span className="truncate">
                {chaptersById.get(point.chapterId)?.title ??
                  t("Codex.timeline.missingChapter")}
              </span>
            </div>
            {point.note ? (
              <p className="text-muted-foreground mt-1 line-clamp-1 text-[10px] leading-relaxed">
                {point.note}
              </p>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
