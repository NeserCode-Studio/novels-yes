import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BookOpen,
  CalendarClock,
  ExternalLink,
  GitBranch,
  MapPin,
  Plus,
  Search,
  SmilePlus,
  Unlink,
  Users,
  X,
} from "lucide-react";

import { useI18n } from "@/composables";
import { useThemeContext } from "@/contexts/theme";
import type { Entry, Relation } from "@/services/codex";
import {
  causalEventIds,
  fieldNumber,
  fieldText,
  referencedFieldIds,
} from "@/services/timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  TimelineChapter,
  TimelineEmotionPointView,
  TimelineEventView,
} from "./shared";

interface EventInspectorProps {
  event: TimelineEventView;
  entriesById: Map<string, Entry>;
  relations: Relation[];
  chapters: TimelineChapter[];
  points: TimelineEmotionPointView[];
  onClose: () => void;
  onOpenEntry: (entryId: string) => void;
  onLinkChapters: (chapterIds: string[]) => Promise<boolean>;
  onRemoveChapter: (chapterId: string) => Promise<boolean>;
  onAddEmotion: (target: { chapterId: string | null; eventId: string }) => void;
  onEditPoint: (pointId: string) => void;
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof CalendarClock;
  children: ReactNode;
}) {
  return (
    <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold">
      <Icon className="size-3.5" />
      {children}
    </h3>
  );
}

export function EventInspector({
  event,
  entriesById,
  relations,
  chapters,
  points,
  onClose,
  onOpenEntry,
  onLinkChapters,
  onRemoveChapter,
  onAddEmotion,
  onEditPoint,
}: EventInspectorProps) {
  const { t } = useI18n();
  const { theme } = useThemeContext();
  const [chapterQuery, setChapterQuery] = useState("");
  const [busyChapterId, setBusyChapterId] = useState<string | null>(null);
  const entry = event.entry;
  const participantIds = referencedFieldIds(entry, "participants");
  const placeIds = referencedFieldIds(entry, "place");
  const participants = participantIds
    .map((id) => entriesById.get(id))
    .filter((item): item is Entry => Boolean(item));
  const places = placeIds
    .map((id) => entriesById.get(id))
    .filter((item): item is Entry => Boolean(item));
  const linkedChapters = event.record.chapterIds
    .map((id) => chapters.find((chapter) => chapter.id === id))
    .filter((chapter): chapter is TimelineChapter => Boolean(chapter));
  const linkedSet = useMemo(
    () => new Set(event.record.chapterIds),
    [event.record.chapterIds]
  );
  const chapterResults = useMemo(() => {
    const needle = chapterQuery.trim().toLocaleLowerCase();
    return chapters
      .filter((chapter) => !linkedSet.has(chapter.id))
      .filter(
        (chapter) =>
          !needle ||
          chapter.title.toLocaleLowerCase().includes(needle) ||
          String(chapter.visualIndex + 1).includes(needle)
      )
      .slice(0, 24);
  }, [chapterQuery, chapters, linkedSet]);
  const causalEntries = causalEventIds(entry.id, relations)
    .map((id) => entriesById.get(id))
    .filter((item): item is Entry => Boolean(item) && item?.typeId === "event");
  const time = fieldText(entry, "time");
  const order = fieldNumber(entry, "order");
  const cause = fieldText(entry, "cause");
  const result = fieldText(entry, "result");
  const impact = fieldText(entry, "impact");

  useEffect(() => {
    setChapterQuery("");
    setBusyChapterId(null);
  }, [entry.id]);

  async function linkChapter(chapterId: string) {
    if (busyChapterId) return;
    setBusyChapterId(chapterId);
    const ok = await onLinkChapters([chapterId]);
    setBusyChapterId(null);
    if (ok) setChapterQuery("");
  }

  async function removeChapter(chapterId: string) {
    if (busyChapterId) return;
    setBusyChapterId(chapterId);
    await onRemoveChapter(chapterId);
    setBusyChapterId(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[10px] font-semibold">
            {t("Codex.type.event")}
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold">
            {entry.name}
          </h2>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onClose}
          aria-label={t("Codex.timeline.closeInspector")}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="scrollbar-app min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-[10px]">
            {time || t("Codex.timeline.timeUnknown")}
          </span>
          <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-[10px] tabular-nums">
            {t("Codex.timeline.order")}: {order ?? "—"}
          </span>
          {event.record.chapterIds.length > 1 ? (
            <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-[10px]">
              {t("Codex.timeline.eventSpan").replace(
                "{count}",
                String(event.record.chapterIds.length)
              )}
            </span>
          ) : null}
        </div>

        <p className="text-muted-foreground mt-3 text-xs leading-relaxed whitespace-pre-wrap">
          {entry.summary || entry.body || t("Codex.summaryEmpty")}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => onOpenEntry(entry.id)}
          >
            <ExternalLink className="size-3" />
            {t("Codex.timeline.openMaterial")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() =>
              onAddEmotion({
                chapterId: event.record.anchorChapterId,
                eventId: entry.id,
              })
            }
          >
            <SmilePlus className="size-3" />
            {t("Codex.timeline.addEmotion")}
          </Button>
        </div>

        <section className="mt-5 border-t pt-4">
          <SectionTitle icon={BookOpen}>
            {t("Codex.timeline.chapters")}
          </SectionTitle>
          {linkedChapters.length ? (
            <div className="mt-2 flex flex-col gap-1">
              {linkedChapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className="hover:bg-accent/25 flex items-center gap-2 rounded px-1.5 py-1 text-xs"
                >
                  <span className="text-muted-foreground w-6 shrink-0 text-right text-[10px] tabular-nums">
                    {chapter.visualIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {chapter.title}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-6"
                    disabled={busyChapterId === chapter.id}
                    onClick={() => void removeChapter(chapter.id)}
                    aria-label={t("Codex.timeline.removeChapterLink")}
                  >
                    <Unlink className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground mt-1.5 text-[11px]">
              {t("Codex.timeline.noChapterLinks")}
            </p>
          )}

          <div className="relative mt-2">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2" />
            <Input
              value={chapterQuery}
              className="h-8 pl-7 text-xs"
              placeholder={t("Codex.timeline.searchChapter")}
              onChange={(changeEvent) =>
                setChapterQuery(changeEvent.target.value)
              }
            />
          </div>
          {chapterQuery.trim() ? (
            <div className="mt-1 max-h-48 overflow-y-auto rounded-md border p-1">
              {chapterResults.length ? (
                chapterResults.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                    disabled={Boolean(busyChapterId)}
                    onClick={() => void linkChapter(chapter.id)}
                  >
                    <span className="text-muted-foreground w-6 text-right text-[10px] tabular-nums">
                      {chapter.visualIndex + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {chapter.title}
                    </span>
                    <Plus className="size-3" />
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground px-2 py-3 text-center text-[11px]">
                  {t("Codex.timeline.noChapterMatch")}
                </p>
              )}
            </div>
          ) : null}
        </section>

        {participants.length || places.length ? (
          <section className="mt-5 border-t pt-4">
            <SectionTitle icon={Users}>
              {t("Codex.timeline.index")}
            </SectionTitle>
            <div className="mt-2 flex flex-wrap gap-1">
              {participants.map((participant) => (
                <span
                  key={`participant:${participant.id}`}
                  className="bg-muted flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                >
                  <Users className="size-2.5 shrink-0" />
                  <span className="truncate">{participant.name}</span>
                </span>
              ))}
              {places.map((place) => (
                <span
                  key={`place:${place.id}`}
                  className="bg-muted flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
                >
                  <MapPin className="size-2.5 shrink-0" />
                  <span className="truncate">{place.name}</span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {cause || result || impact || causalEntries.length ? (
          <section className="mt-5 border-t pt-4">
            <SectionTitle icon={GitBranch}>
              {t("Codex.timeline.causal")}
            </SectionTitle>
            {cause ? (
              <div className="mt-2">
                <p className="text-muted-foreground text-[10px]">
                  {t("Codex.timeline.cause")}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{cause}</p>
              </div>
            ) : null}
            {result ? (
              <div className="mt-2">
                <p className="text-muted-foreground text-[10px]">
                  {t("Codex.timeline.result")}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{result}</p>
              </div>
            ) : null}
            {impact ? (
              <div className="mt-2">
                <p className="text-muted-foreground text-[10px]">
                  {t("Codex.timeline.impact")}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{impact}</p>
              </div>
            ) : null}
            {causalEntries.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {causalEntries.map((causal) => (
                  <button
                    key={causal.id}
                    type="button"
                    className="bg-muted hover:bg-accent max-w-full truncate rounded px-1.5 py-0.5 text-[10px]"
                    onClick={() => onOpenEntry(causal.id)}
                  >
                    {causal.name}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-5 border-t pt-4">
          <SectionTitle icon={SmilePlus}>
            {t("Codex.timeline.linkedEmotion")}
          </SectionTitle>
          {points.length ? (
            <div className="mt-2 flex flex-col gap-1">
              {points.map(({ point, type }) => {
                const color = type?.color[theme] ?? "var(--muted-foreground)";
                return (
                  <button
                    key={point.id}
                    type="button"
                    className="hover:bg-accent/35 flex items-center gap-2 rounded px-1.5 py-1 text-left text-[11px]"
                    onClick={() => onEditPoint(point.id)}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {type?.name ?? t("Codex.timeline.unknownType")}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {point.intensity ?? "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground mt-1.5 text-[11px]">
              {t("Codex.timeline.noLinkedEmotion")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
