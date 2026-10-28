import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  SmilePlus,
  Users,
} from "lucide-react";

import { useI18n, useToast } from "@/composables";
import { useCodex } from "@/contexts/codex";
import { useOutline } from "@/contexts/outline";
import { useThemeContext } from "@/contexts/theme";
import { orderedChapterNodes } from "@/lib/outline-sequence";
import type { Entry } from "@/services/codex";
import {
  addEventChapterLinks,
  buildEventRecords,
  eventInWorkScope,
  loadEmotionTypeConfig,
  loadWorkTimeline,
  removeEmotionPoint,
  upsertEmotionPoint,
  type EmotionPoint,
  type EmotionTypeConfig,
  type WorkTimeline,
} from "@/services/timeline";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/framework/Tooltip";
import { CodexEntryCreateDialog } from "@/components/novel/codex/CodexEntryCreateDialog";
import { EmotionPointDialog } from "@/components/novel/codex/timeline/EmotionPointDialog";
import type {
  TimelineChapter,
  TimelineEventView,
} from "@/components/novel/codex/timeline/shared";

interface ChapterEmotionSectionProps {
  root: string | null;
  workId: string | null;
  chapterId: string | null;
  refreshVersion?: number;
  onTimelineChange?: () => void;
}

export function ChapterEmotionSection({
  root,
  workId,
  chapterId,
  refreshVersion,
  onTimelineChange,
}: ChapterEmotionSectionProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { theme } = useThemeContext();
  const { entries, typeConfigs } = useCodex();
  const { chapters: outlineChapters, volumes } = useOutline();
  const [timeline, setTimeline] = useState<WorkTimeline | null>(null);
  const [config, setConfig] = useState<EmotionTypeConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [createEventOpen, setCreateEventOpen] = useState(false);

  useEffect(() => {
    if (!root || !workId) {
      setTimeline(null);
      setConfig(null);
      setLoading(false);
      setLoadFailed(false);
      return;
    }

    let cancelled = false;
    setTimeline(null);
    setConfig(null);
    setLoading(true);
    setLoadFailed(false);
    Promise.all([loadWorkTimeline(root, workId), loadEmotionTypeConfig(root)])
      .then(([nextTimeline, nextConfig]) => {
        if (cancelled) return;
        setTimeline(nextTimeline);
        setConfig(nextConfig);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshVersion, reloadVersion, root, workId]);

  useEffect(() => {
    setDialogOpen(false);
    setEditingPointId(null);
    setCreateEventOpen(false);
  }, [chapterId, workId]);

  const chapters = useMemo<TimelineChapter[]>(() => {
    const volumeById = new Map(
      volumes.map((volume) => [volume.id, volume] as const)
    );
    return orderedChapterNodes(outlineChapters, volumes).map(
      (chapter, visualIndex) => ({
        ...chapter,
        visualIndex,
        volumeTitle: chapter.parentId
          ? (volumeById.get(chapter.parentId)?.title ?? null)
          : null,
      })
    );
  }, [outlineChapters, volumes]);

  const eventViews = useMemo<TimelineEventView[]>(() => {
    if (!timeline || !workId) return [];
    const scopedEntries = entries.filter(
      (entry) => entry.typeId === "event" && eventInWorkScope(entry, workId)
    );
    const chapterOrder = new Map(
      chapters.map((chapter, index) => [chapter.id, index] as const)
    );
    const records = buildEventRecords(
      scopedEntries,
      timeline.eventChapterLinks,
      chapterOrder
    );
    const entryById = new Map(scopedEntries.map((entry) => [entry.id, entry]));
    return records.flatMap((record) => {
      const entry = entryById.get(record.entryId);
      return entry ? [{ entry, record }] : [];
    });
  }, [chapters, entries, timeline, workId]);

  const chapterEvents = useMemo(() => {
    if (!chapterId) return [];
    return eventViews
      .filter(({ record }) => record.chapterIds.includes(chapterId))
      .sort((left, right) => {
        const leftOrder = left.record.storyOrder;
        const rightOrder = right.record.storyOrder;
        if (leftOrder !== null && rightOrder !== null) {
          return leftOrder - rightOrder;
        }
        if (leftOrder !== null) return -1;
        if (rightOrder !== null) return 1;
        return left.entry.name.localeCompare(right.entry.name);
      });
  }, [chapterId, eventViews]);

  const entryById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry] as const)),
    [entries]
  );
  const typeById = useMemo(
    () =>
      new Map((config?.types ?? []).map((type) => [type.id, type] as const)),
    [config]
  );
  const points = useMemo(() => {
    if (!timeline || !chapterId) return [];
    return timeline.emotionPoints
      .filter((point) => point.chapterId === chapterId)
      .sort((left, right) => left.createdAt - right.createdAt);
  }, [chapterId, timeline]);
  const editingPoint =
    timeline?.emotionPoints.find((point) => point.id === editingPointId) ??
    null;
  const canEdit = Boolean(
    root && workId && chapterId && timeline && config?.types.length
  );
  const canCreateEvent = Boolean(
    root &&
    workId &&
    chapterId &&
    !loading &&
    typeConfigs.some((type) => type.id === "event")
  );

  async function savePoint(point: EmotionPoint): Promise<boolean> {
    if (!root || !workId) return false;
    try {
      setTimeline(await upsertEmotionPoint(root, workId, point));
      onTimelineChange?.();
      toast.success("Codex.timeline.saved");
      return true;
    } catch {
      toast.error("Codex.timeline.saveFailed");
      return false;
    }
  }

  async function deletePoint(pointId: string): Promise<boolean> {
    if (!root || !workId) return false;
    try {
      setTimeline(await removeEmotionPoint(root, workId, pointId));
      onTimelineChange?.();
      toast.success("Codex.timeline.deleted");
      return true;
    } catch {
      toast.error("Codex.timeline.deleteFailed");
      return false;
    }
  }

  async function linkCreatedEvent(entry: Entry) {
    if (!root || !workId || !chapterId) {
      toast.warning("Codex.timeline.eventCreatedUnplaced");
      return;
    }
    try {
      setTimeline(
        await addEventChapterLinks(root, workId, entry.id, [chapterId])
      );
      toast.success("Codex.timeline.eventCreated");
    } catch {
      toast.warning("Codex.timeline.eventCreatedUnplaced");
    }
  }

  function openNewPoint() {
    setEditingPointId(null);
    setDialogOpen(true);
  }

  function changeDialogOpen(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditingPointId(null);
  }

  return (
    <>
      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="row-label min-w-0 flex-1">
            <CalendarDays className="icon-sm shrink-0" />
            <span className="truncate">{t("Editor.side.events")}</span>
          </h2>
          <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
            {chapterEvents.length}
          </span>
          <Tooltip content={t("Codex.timeline.addEvent")}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-7 shrink-0 p-0"
              aria-label={t("Codex.timeline.addEvent")}
              disabled={!canCreateEvent}
              onClick={() => setCreateEventOpen(true)}
            >
              <Plus className="icon-sm" />
            </Button>
          </Tooltip>
        </div>

        {loading ? (
          <div className="text-muted-foreground flex items-center gap-1.5 px-1 text-[11px]">
            <Loader2 className="size-3 animate-spin" />
            {t("Editor.side.eventsLoading")}
          </div>
        ) : loadFailed ? (
          <div className="flex flex-col items-start gap-1 px-1">
            <p className="text-destructive text-[11px]">
              {t("Editor.side.eventsLoadFailed")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => setReloadVersion((current) => current + 1)}
            >
              <RefreshCw className="size-3" />
              {t("Codex.timeline.retry")}
            </Button>
          </div>
        ) : chapterEvents.length ? (
          <ul className="divide-border/60 border-border/60 divide-y rounded-md border">
            {chapterEvents.map(({ entry, record }) => {
              const participantNames = record.participantIds
                .map((id) => entryById.get(id)?.name)
                .filter((name): name is string => Boolean(name));
              const meta =
                [
                  record.timeLabel,
                  record.storyOrder === null ? "" : `#${record.storyOrder}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || t("Codex.timeline.timeUnknown");

              return (
                <li key={entry.id} className="min-w-0 px-2.5 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <CalendarDays className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start gap-2">
                        <span
                          className="min-w-0 flex-1 text-xs font-medium break-words"
                          title={entry.name}
                        >
                          {entry.name}
                        </span>
                        <span
                          className="text-muted-foreground max-w-[46%] shrink-0 truncate text-[10px] tabular-nums"
                          title={meta}
                        >
                          {meta}
                        </span>
                      </div>
                      {entry.summary ? (
                        <p className="text-muted-foreground mt-1 line-clamp-2 text-[10px] leading-relaxed break-words">
                          {entry.summary}
                        </p>
                      ) : null}
                      {participantNames.length ? (
                        <div
                          className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1 text-[10px]"
                          title={`${t("Codex.timeline.participant")}: ${participantNames.join(
                            "、"
                          )}`}
                        >
                          <Users className="size-3 shrink-0" />
                          <span className="truncate">
                            {participantNames.join("、")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : timeline ? (
          <div className="border-border/60 rounded-md border border-dashed px-2.5 py-3">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {t("Editor.side.noEvents")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7 w-full gap-1 px-2 text-[11px]"
              disabled={!canCreateEvent}
              onClick={() => setCreateEventOpen(true)}
            >
              <Plus className="size-3.5" />
              {t("Codex.timeline.addEvent")}
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="row-label min-w-0 flex-1">
            <SmilePlus className="icon-sm shrink-0" />
            <span className="truncate">{t("Editor.side.emotionPoints")}</span>
          </h2>
          <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
            {points.length}
          </span>
          <Tooltip content={t("Codex.timeline.addEmotion")}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-7 shrink-0 p-0"
              aria-label={t("Codex.timeline.addEmotion")}
              disabled={!canEdit}
              onClick={openNewPoint}
            >
              <Plus className="icon-sm" />
            </Button>
          </Tooltip>
        </div>

        {loading ? (
          <div className="text-muted-foreground flex items-center gap-1.5 px-1 text-[11px]">
            <Loader2 className="size-3 animate-spin" />
            {t("Editor.side.emotionPointsLoading")}
          </div>
        ) : loadFailed ? (
          <div className="flex flex-col items-start gap-1 px-1">
            <p className="text-destructive text-[11px]">
              {t("Editor.side.emotionPointsLoadFailed")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={() => setReloadVersion((current) => current + 1)}
            >
              <RefreshCw className="size-3" />
              {t("Codex.timeline.retry")}
            </Button>
          </div>
        ) : points.length ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            {points.map((point) => {
              const type = typeById.get(point.typeId);
              const eventName = point.eventId
                ? entryById.get(point.eventId)?.name
                : null;
              return (
                <button
                  key={point.id}
                  type="button"
                  className="border-border/60 hover:bg-accent/45 focus-visible:ring-ring min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors outline-none focus-visible:ring-2"
                  aria-label={`${t("Codex.timeline.editPointTitle")}: ${
                    type?.name ?? t("Codex.timeline.unknownType")
                  }`}
                  onClick={() => {
                    setEditingPointId(point.id);
                    setDialogOpen(true);
                  }}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
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

                  {point.eventId ? (
                    <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1 text-[10px]">
                      <Link2 className="size-3 shrink-0" />
                      <span
                        className="truncate"
                        title={
                          eventName ?? t("Editor.side.linkedEventUnavailable")
                        }
                      >
                        {eventName ?? t("Editor.side.linkedEventUnavailable")}
                      </span>
                    </div>
                  ) : null}

                  {point.note ? (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-[10px] leading-relaxed break-words">
                      {point.note}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : timeline ? (
          <div className="border-border/60 rounded-md border border-dashed px-2.5 py-3">
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {t("Editor.side.noEmotionPoints")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-7 w-full gap-1 px-2 text-[11px]"
              disabled={!canEdit}
              onClick={openNewPoint}
            >
              <SmilePlus className="size-3.5" />
              {t("Codex.timeline.addEmotion")}
            </Button>
          </div>
        ) : null}
      </section>

      <EmotionPointDialog
        open={dialogOpen}
        onOpenChange={changeDialogOpen}
        chapters={chapters}
        events={eventViews}
        types={config?.types ?? []}
        initialPoint={editingPoint}
        initialChapterId={chapterId}
        onSave={savePoint}
        onDelete={deletePoint}
      />

      <CodexEntryCreateDialog
        open={createEventOpen}
        onOpenChange={setCreateEventOpen}
        initialTypeId="event"
        fixedTypeId="event"
        title={t("Codex.timeline.addEvent")}
        description={t("Editor.side.createEventHint")}
        onCreated={(entry) => {
          void linkCreatedEvent(entry);
        }}
      />
    </>
  );
}
