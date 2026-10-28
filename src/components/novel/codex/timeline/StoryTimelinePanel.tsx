import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  RefreshCw,
  SmilePlus,
} from "lucide-react";

import { useI18n, useToast } from "@/composables";
import { useCodex } from "@/contexts/codex";
import { useLibrary } from "@/contexts/library";
import { useOutline } from "@/contexts/outline";
import { useThemeContext } from "@/contexts/theme";
import { useWorkspace } from "@/contexts/workspace";
import { orderedChapterNodes } from "@/lib/outline-sequence";
import { loadOutline } from "@/services/outline";
import type { Outline, OutlineNode } from "@/shared/schema";
import {
  addEventChapterLinks,
  buildEventRecords,
  buildReadingSlots,
  buildStorySlots,
  eventInWorkScope,
  eventMatchesQuery,
  loadEmotionTypeConfig,
  loadWorkTimeline,
  referencedFieldIds,
  removeEmotionPoint,
  removeEventChapterLink,
  upsertEmotionPoint,
  type EmotionPoint,
  type EmotionType,
  type EmotionTypeConfig,
  type TimelineAxisMode,
  type TimelineSlot,
  type WorkTimeline,
} from "@/services/timeline";
import { CodexEntryCreateDialog } from "@/components/novel/codex/CodexEntryCreateDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmotionPointDialog } from "./EmotionPointDialog";
import { EmotionPointQueue } from "./EmotionPointQueue";
import { EmotionTypeManagerDialog } from "./EmotionTypeManagerDialog";
import { EventInspector } from "./EventInspector";
import { EventQueue } from "./EventTrack";
import { TimelineCanvas } from "./TimelineCanvas";
import { TimelineLegend } from "./TimelineLegend";
import { TimelineToolbar, type TimelineWorkOption } from "./TimelineToolbar";
import type {
  TimelineChapter,
  TimelineEmotionPointView,
  TimelineEventView,
} from "./shared";

const ZOOM_STEPS = [2, 4, 8, 16, 32, 56, 80];

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

type TimelineData = {
  outline: Outline;
  timeline: WorkTimeline;
  config: EmotionTypeConfig;
};

interface StoryTimelinePanelProps {
  onOpenEntry: (entryId: string) => void;
}

function unknownEmotionType(typeId: string, name: string): EmotionType {
  return {
    id: typeId,
    name,
    color: {
      light: "#6B7280",
      dark: "#A7AFBA",
    },
    order: Number.MAX_SAFE_INTEGER,
    hidden: false,
    preset: false,
  };
}

export function StoryTimelinePanel({ onOpenEntry }: StoryTimelinePanelProps) {
  const { t } = useI18n();
  const toast = useToast();
  const { theme } = useThemeContext();
  const { root } = useWorkspace();
  const { works, workspace, currentWorkId } = useLibrary();
  const { currentChapterId } = useOutline();
  const { entries, relations } = useCodex();
  const compactInspector = useMediaQuery("(max-width: 1279px)");

  const workOptions = useMemo<TimelineWorkOption[]>(() => {
    const ids = workspace
      ? [...workspace.order, ...workspace.archived]
      : Object.keys(works);
    const seen = new Set<string>();
    return ids
      .filter((id) => {
        if (seen.has(id) || !works[id]) return false;
        seen.add(id);
        return true;
      })
      .map((id) => ({
        id,
        title: works[id].title.trim() || t("Codex.timeline.untitledWork"),
        archived: works[id].archived,
      }));
  }, [t, works, workspace]);
  const workIds = useMemo(
    () => workOptions.map((work) => work.id),
    [workOptions]
  );
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(() =>
    currentWorkId && works[currentWorkId] ? currentWorkId : null
  );
  const [axisMode, setAxisMode] = useState<TimelineAxisMode>("reading");
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [visibleTypeIds, setVisibleTypeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [pointDialogOpen, setPointDialogOpen] = useState(false);
  const [pointInitialChapterId, setPointInitialChapterId] = useState<
    string | null
  >(null);
  const [pointInitialEventId, setPointInitialEventId] = useState<string | null>(
    null
  );
  const [pointGroupIds, setPointGroupIds] = useState<string[] | null>(null);
  const [typeManagerOpen, setTypeManagerOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [eventInitialChapterId, setEventInitialChapterId] = useState<
    string | null
  >(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [canvasViewportWidth, setCanvasViewportWidth] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{
    chapterId: string;
    nonce: number;
  } | null>(null);

  useEffect(() => {
    if (selectedWorkId && works[selectedWorkId]) return;
    const fallback =
      currentWorkId && works[currentWorkId]
        ? currentWorkId
        : workOptions[0]?.id;
    if (fallback) setSelectedWorkId(fallback);
    else if (selectedWorkId) setSelectedWorkId(null);
  }, [currentWorkId, selectedWorkId, workOptions, works]);

  useEffect(() => {
    if (!root || !selectedWorkId) {
      setData(null);
      setLoading(false);
      setLoadFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setData(null);
    setSelectedEventId(null);
    Promise.all([
      loadOutline(root, selectedWorkId),
      loadWorkTimeline(root, selectedWorkId),
      loadEmotionTypeConfig(root),
    ])
      .then(([outline, timeline, config]) => {
        if (cancelled) return;
        setData({ outline, timeline, config });
        setVisibleTypeIds(
          new Set(
            config.types.filter((type) => !type.hidden).map((type) => type.id)
          )
        );
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
  }, [reloadVersion, root, selectedWorkId]);

  const chapters = useMemo<TimelineChapter[]>(() => {
    if (!data) return [];
    const outlineChapters = data.outline.nodes.filter(
      (node) => node.type === "chapter"
    );
    const outlineVolumes = data.outline.nodes.filter(
      (node) => node.type === "volume"
    );
    const volumeById = new Map<string, OutlineNode>(
      outlineVolumes.map((volume) => [volume.id, volume])
    );
    return orderedChapterNodes(outlineChapters, outlineVolumes).map(
      (chapter, visualIndex) => ({
        ...chapter,
        visualIndex,
        volumeTitle: chapter.parentId
          ? (volumeById.get(chapter.parentId)?.title ?? null)
          : null,
      })
    );
  }, [data]);

  const chapterOrder = useMemo(
    () => new Map(chapters.map((chapter, index) => [chapter.id, index])),
    [chapters]
  );
  const chapterById = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter])),
    [chapters]
  );
  const entriesById = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries]
  );

  const eventViews = useMemo<TimelineEventView[]>(() => {
    if (!data || !selectedWorkId) return [];
    const scopedEntries = entries.filter(
      (entry) =>
        entry.typeId === "event" && eventInWorkScope(entry, selectedWorkId)
    );
    const records = buildEventRecords(
      scopedEntries,
      data.timeline.eventChapterLinks,
      chapterOrder
    );
    const entryById = new Map(scopedEntries.map((entry) => [entry.id, entry]));
    return records.flatMap((record) => {
      const entry = entryById.get(record.entryId);
      return entry ? [{ entry, record }] : [];
    });
  }, [chapterOrder, data, entries, selectedWorkId]);

  const eventRecordsById = useMemo(
    () => new Map(eventViews.map((event) => [event.entry.id, event.record])),
    [eventViews]
  );

  const searchedEvents = useMemo(
    () =>
      eventViews.filter(
        (event) =>
          !query.trim() || eventMatchesQuery(event.entry, query, entriesById)
      ),
    [entriesById, eventViews, query]
  );

  const participants = useMemo(() => {
    const ids = new Set<string>();
    for (const event of eventViews) {
      for (const id of referencedFieldIds(event.entry, "participants")) {
        ids.add(id);
      }
    }
    return [...ids]
      .map((id) => entriesById.get(id))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  }, [entriesById, eventViews]);

  useEffect(() => {
    if (
      participantId &&
      !participants.some((participant) => participant?.id === participantId)
    ) {
      setParticipantId(null);
    }
  }, [participantId, participants]);

  const readingSlots = useMemo(() => buildReadingSlots(chapters), [chapters]);
  const storySlots = useMemo<TimelineSlot[]>(() => {
    const ordered = searchedEvents.filter(
      (event) => event.record.storyOrder !== null
    );
    const eventByOrder = new Map(
      ordered.map((event) => [event.record.storyOrder, event] as const)
    );
    return buildStorySlots(ordered.map((event) => event.record)).map((slot) => {
      const event =
        slot.storyOrder === undefined
          ? undefined
          : eventByOrder.get(slot.storyOrder);
      return {
        ...slot,
        label: event?.record.timeLabel || slot.label,
      };
    });
  }, [searchedEvents]);
  const slots = axisMode === "reading" ? readingSlots : storySlots;

  const pointViews = useMemo<TimelineEmotionPointView[]>(() => {
    if (!data) return [];
    const typeById = new Map(data.config.types.map((type) => [type.id, type]));
    return data.timeline.emotionPoints.map((point) => ({
      point,
      type: typeById.get(point.typeId) ?? null,
    }));
  }, [data]);

  const displayTypes = useMemo(() => {
    if (!data) return [];
    const known = [...data.config.types].sort(
      (left, right) => left.order - right.order
    );
    const knownIds = new Set(known.map((type) => type.id));
    const missingIds = [
      ...new Set(
        data.timeline.emotionPoints
          .map((point) => point.typeId)
          .filter((typeId) => !knownIds.has(typeId))
      ),
    ];
    return [
      ...known,
      ...missingIds.map((typeId) =>
        unknownEmotionType(typeId, t("Codex.timeline.unknownType"))
      ),
    ];
  }, [data, t]);

  const emotionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of pointViews) {
      counts.set(view.point.typeId, (counts.get(view.point.typeId) ?? 0) + 1);
    }
    return counts;
  }, [pointViews]);

  const visiblePointViews = useMemo(
    () => pointViews.filter((view) => visibleTypeIds.has(view.point.typeId)),
    [pointViews, visibleTypeIds]
  );
  const timeUnknownPointViews = useMemo(() => {
    if (axisMode !== "story") return [];
    return visiblePointViews.filter((view) => {
      if (!view.point.eventId) return true;
      const event = eventRecordsById.get(view.point.eventId);
      return event?.storyOrder === null || event?.storyOrder === undefined;
    });
  }, [axisMode, eventRecordsById, visiblePointViews]);

  const unplacedEvents = useMemo(
    () =>
      searchedEvents.filter((event) => event.record.anchorChapterId === null),
    [searchedEvents]
  );
  const timeUnknownEvents = useMemo(
    () =>
      axisMode === "story"
        ? searchedEvents.filter((event) => event.record.storyOrder === null)
        : [],
    [axisMode, searchedEvents]
  );

  const referenceIssueCount = useMemo(() => {
    if (!data) return 0;
    const chapterIds = new Set(chapters.map((chapter) => chapter.id));
    const eventIds = new Set(eventViews.map((event) => event.entry.id));
    const brokenLinks = data.timeline.eventChapterLinks.filter(
      (link) => !chapterIds.has(link.chapterId) || !eventIds.has(link.eventId)
    ).length;
    const brokenPoints = data.timeline.emotionPoints.filter(
      (point) =>
        !chapterIds.has(point.chapterId) ||
        (point.eventId !== undefined && !eventIds.has(point.eventId))
    ).length;
    return brokenLinks + brokenPoints;
  }, [chapters, data, eventViews]);

  const selectedEvent =
    searchedEvents.find((event) => event.entry.id === selectedEventId) ??
    eventViews.find((event) => event.entry.id === selectedEventId) ??
    null;
  const selectedEventPoints = selectedEvent
    ? pointViews.filter((view) => view.point.eventId === selectedEvent.entry.id)
    : [];
  const editingPoint =
    data?.timeline.emotionPoints.find((point) => point.id === editingPointId) ??
    null;
  const groupedPoints = pointGroupIds
    ? pointViews.filter((view) => pointGroupIds.includes(view.point.id))
    : [];

  const fitTileWidth =
    slots.length > 0 && canvasViewportWidth > 0
      ? Math.max(0.7, Math.min(22, canvasViewportWidth / slots.length))
      : 8;
  const tileWidth = zoom === "fit" ? fitTileWidth : zoom;

  function setAxis(nextAxis: TimelineAxisMode) {
    setAxisMode(nextAxis);
    setZoom("fit");
  }

  function zoomIn() {
    const current = zoom === "fit" ? fitTileWidth : zoom;
    setZoom(
      ZOOM_STEPS.find((step) => step > current + 0.1) ??
        ZOOM_STEPS[ZOOM_STEPS.length - 1]
    );
  }

  function zoomOut() {
    const current = zoom === "fit" ? fitTileWidth : zoom;
    setZoom(
      [...ZOOM_STEPS].reverse().find((step) => step < current - 0.1) ??
        ZOOM_STEPS[0]
    );
  }

  function focusCurrentChapter() {
    const target =
      selectedWorkId === currentWorkId
        ? currentChapterId
        : (chapters[0]?.id ?? null);
    if (!target) return;
    if (axisMode !== "reading") setAxisMode("reading");
    setFocusRequest((current) => ({
      chapterId: target,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }

  function openNewPoint(
    chapterId: string | null = null,
    eventId: string | null = null
  ) {
    setEditingPointId(null);
    setPointInitialChapterId(chapterId);
    setPointInitialEventId(eventId);
    setPointDialogOpen(true);
  }

  function editPoint(pointId: string) {
    setEditingPointId(pointId);
    setPointInitialChapterId(null);
    setPointInitialEventId(null);
    setPointGroupIds(null);
    setPointDialogOpen(true);
  }

  async function savePoint(point: EmotionPoint): Promise<boolean> {
    if (!root || !selectedWorkId) return false;
    try {
      const timeline = await upsertEmotionPoint(root, selectedWorkId, point);
      setData((current) => (current ? { ...current, timeline } : current));
      toast.success("Codex.timeline.saved");
      return true;
    } catch {
      toast.error("Codex.timeline.saveFailed");
      return false;
    }
  }

  async function deletePoint(pointId: string): Promise<boolean> {
    if (!root || !selectedWorkId) return false;
    try {
      const timeline = await removeEmotionPoint(root, selectedWorkId, pointId);
      setData((current) => (current ? { ...current, timeline } : current));
      toast.success("Codex.timeline.deleted");
      return true;
    } catch {
      toast.error("Codex.timeline.deleteFailed");
      return false;
    }
  }

  async function linkEventChapters(
    eventId: string,
    chapterIds: string[],
    notify = true
  ): Promise<boolean> {
    if (!root || !selectedWorkId) return false;
    try {
      const timeline = await addEventChapterLinks(
        root,
        selectedWorkId,
        eventId,
        chapterIds
      );
      setData((current) => (current ? { ...current, timeline } : current));
      if (notify) toast.success("Codex.timeline.chapterLinked");
      return true;
    } catch {
      if (notify) toast.error("Codex.timeline.linkFailed");
      return false;
    }
  }

  async function unlinkEventChapter(
    eventId: string,
    chapterId: string
  ): Promise<boolean> {
    if (!root || !selectedWorkId) return false;
    try {
      const timeline = await removeEventChapterLink(
        root,
        selectedWorkId,
        eventId,
        chapterId
      );
      setData((current) => (current ? { ...current, timeline } : current));
      toast.success("Codex.timeline.chapterUnlinked");
      return true;
    } catch {
      toast.error("Codex.timeline.unlinkFailed");
      return false;
    }
  }

  function openCreateEvent(chapterId: string | null = null) {
    setEventInitialChapterId(chapterId);
    setCreateEventOpen(true);
  }

  async function eventCreated(entryId: string) {
    setCreateEventOpen(false);
    if (eventInitialChapterId) {
      const ok = await linkEventChapters(
        entryId,
        [eventInitialChapterId],
        false
      );
      if (!ok) {
        toast.warning("Codex.timeline.eventCreatedUnplaced");
      }
    }
    setSelectedEventId(entryId);
    toast.success("Codex.timeline.eventCreated");
  }

  function handleConfigSaved(config: EmotionTypeConfig) {
    setData((current) => (current ? { ...current, config } : current));
    setVisibleTypeIds(
      new Set(
        config.types.filter((type) => !type.hidden).map((type) => type.id)
      )
    );
    if (!root || !selectedWorkId) return;
    void loadWorkTimeline(root, selectedWorkId)
      .then((timeline) => {
        setData((current) =>
          current ? { ...current, config, timeline } : current
        );
      })
      .catch(() => {
        setLoadFailed(true);
        toast.error("Codex.timeline.loadFailed");
      });
  }

  const toolbar = (
    <TimelineToolbar
      works={workOptions}
      selectedWorkId={selectedWorkId}
      onWorkChange={(workId) => {
        setSelectedWorkId(workId);
        setQuery("");
        setParticipantId(null);
        setZoom("fit");
      }}
      axisMode={axisMode}
      onAxisModeChange={setAxis}
      query={query}
      onQueryChange={setQuery}
      participants={participants}
      participantId={participantId}
      onParticipantChange={setParticipantId}
      onZoomIn={zoomIn}
      onZoomOut={zoomOut}
      onFit={() => setZoom("fit")}
      onFocusCurrent={focusCurrentChapter}
      onAddEmotion={() => openNewPoint()}
      onAddEvent={() => openCreateEvent()}
      onManageTypes={() => setTypeManagerOpen(true)}
      disabled={!data || loading}
    />
  );

  if (!workOptions.length) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {toolbar}
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div>
            <CalendarClock className="text-muted-foreground mx-auto size-6" />
            <p className="mt-2 text-sm font-medium">
              {t("Codex.timeline.noWork")}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("Codex.timeline.noWorkHint")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      {toolbar}

      {data ? (
        <TimelineLegend
          types={displayTypes}
          counts={emotionCounts}
          visibleTypeIds={visibleTypeIds}
          onToggleType={(typeId) =>
            setVisibleTypeIds((current) => {
              const next = new Set(current);
              if (next.has(typeId)) next.delete(typeId);
              else next.add(typeId);
              return next;
            })
          }
          onShowHidden={() =>
            setVisibleTypeIds(new Set(displayTypes.map((type) => type.id)))
          }
          onManageTypes={() => setTypeManagerOpen(true)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="scrollbar-app min-w-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full min-h-80 items-center justify-center gap-2">
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
              <span className="text-muted-foreground text-xs">
                {t("Codex.timeline.loading")}
              </span>
            </div>
          ) : loadFailed ? (
            <div className="flex h-full min-h-80 items-center justify-center px-6 text-center">
              <div>
                <AlertTriangle className="mx-auto size-6 text-amber-600 dark:text-amber-400" />
                <p className="mt-2 text-sm font-medium">
                  {t("Codex.timeline.loadFailed")}
                </p>
                <p className="text-muted-foreground mt-1 max-w-md text-xs leading-relaxed">
                  {t("Codex.timeline.loadFailedHint")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setReloadVersion((version) => version + 1)}
                >
                  <RefreshCw className="size-3.5" />
                  {t("Codex.timeline.retry")}
                </Button>
              </div>
            </div>
          ) : !chapters.length ? (
            <div className="flex h-full min-h-80 items-center justify-center px-6 text-center">
              <div>
                <CalendarClock className="text-muted-foreground mx-auto size-6" />
                <p className="mt-2 text-sm font-medium">
                  {t("Codex.timeline.noChapters")}
                </p>
                <p className="text-muted-foreground mt-1 max-w-md text-xs leading-relaxed">
                  {t("Codex.timeline.noChaptersHint")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => openCreateEvent()}
                >
                  <SmilePlus className="size-3.5" />
                  {t("Codex.timeline.addEvent")}
                </Button>
              </div>
            </div>
          ) : data ? (
            <>
              <TimelineCanvas
                axisMode={axisMode}
                slots={slots}
                chapters={chapters}
                events={searchedEvents}
                eventRecordsById={eventRecordsById}
                points={visiblePointViews}
                types={displayTypes.filter((type) =>
                  visibleTypeIds.has(type.id)
                )}
                tileWidth={tileWidth}
                selectedEventId={selectedEventId}
                participantId={participantId}
                currentChapterId={
                  selectedWorkId === currentWorkId ? currentChapterId : null
                }
                focusRequest={focusRequest}
                onViewportWidthChange={setCanvasViewportWidth}
                onSelectEvent={setSelectedEventId}
                onEditPoint={editPoint}
                onOpenEmotionGroup={setPointGroupIds}
                onAddEmotion={(chapterId) => openNewPoint(chapterId)}
              />
              <EventQueue
                title={t("Codex.timeline.unplaced")}
                hint={t("Codex.timeline.unplacedHint")}
                events={unplacedEvents}
                entriesById={entriesById}
                selectedEventId={selectedEventId}
                participantId={participantId}
                onSelectEvent={setSelectedEventId}
              />
              <EventQueue
                title={t("Codex.timeline.timeUnknown")}
                hint={t("Codex.timeline.timeUnknownHint")}
                events={timeUnknownEvents}
                entriesById={entriesById}
                selectedEventId={selectedEventId}
                participantId={participantId}
                onSelectEvent={setSelectedEventId}
              />
              <EmotionPointQueue
                title={t("Codex.timeline.emotionTimeUnknown")}
                hint={t("Codex.timeline.emotionTimeUnknownHint")}
                points={timeUnknownPointViews}
                chaptersById={chapterById}
                onEditPoint={editPoint}
              />
              {referenceIssueCount ? (
                <div className="text-muted-foreground flex items-start gap-2 border-t px-3 py-2 text-[11px] leading-relaxed">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  {t("Codex.timeline.referencesWarning").replace(
                    "{count}",
                    String(referenceIssueCount)
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {selectedEvent && !compactInspector ? (
          <aside className="bg-background w-[20rem] shrink-0 border-l xl:w-[22rem]">
            <EventInspector
              event={selectedEvent}
              entriesById={entriesById}
              relations={relations}
              chapters={chapters}
              points={selectedEventPoints}
              onClose={() => setSelectedEventId(null)}
              onOpenEntry={onOpenEntry}
              onLinkChapters={(chapterIds) =>
                linkEventChapters(selectedEvent.entry.id, chapterIds)
              }
              onRemoveChapter={(chapterId) =>
                unlinkEventChapter(selectedEvent.entry.id, chapterId)
              }
              onAddEmotion={({ chapterId, eventId }) =>
                openNewPoint(chapterId, eventId)
              }
              onEditPoint={editPoint}
            />
          </aside>
        ) : null}
      </div>

      <Dialog
        open={compactInspector && Boolean(selectedEvent)}
        onOpenChange={(open) => {
          if (!open) setSelectedEventId(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(86vh,760px)] w-[min(36rem,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">
            {selectedEvent?.entry.name ?? t("Codex.type.event")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("Codex.timeline.inspectorDescription")}
          </DialogDescription>
          {selectedEvent ? (
            <EventInspector
              event={selectedEvent}
              entriesById={entriesById}
              relations={relations}
              chapters={chapters}
              points={selectedEventPoints}
              onClose={() => setSelectedEventId(null)}
              onOpenEntry={onOpenEntry}
              onLinkChapters={(chapterIds) =>
                linkEventChapters(selectedEvent.entry.id, chapterIds)
              }
              onRemoveChapter={(chapterId) =>
                unlinkEventChapter(selectedEvent.entry.id, chapterId)
              }
              onAddEmotion={({ chapterId, eventId }) =>
                openNewPoint(chapterId, eventId)
              }
              onEditPoint={editPoint}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <EmotionPointDialog
        open={pointDialogOpen}
        onOpenChange={setPointDialogOpen}
        chapters={chapters}
        events={eventViews}
        types={data?.config.types ?? []}
        initialPoint={editingPoint}
        initialChapterId={pointInitialChapterId}
        initialEventId={pointInitialEventId}
        onSave={savePoint}
        onDelete={deletePoint}
        onManageTypes={() => setTypeManagerOpen(true)}
      />

      {data && root ? (
        <EmotionTypeManagerDialog
          open={typeManagerOpen}
          onOpenChange={setTypeManagerOpen}
          root={root}
          workIds={workIds}
          config={data.config}
          onConfigSaved={handleConfigSaved}
        />
      ) : null}

      <CodexEntryCreateDialog
        open={createEventOpen}
        onOpenChange={setCreateEventOpen}
        initialTypeId="event"
        fixedTypeId="event"
        onCreated={(entry) => {
          void eventCreated(entry.id);
        }}
      />

      <Dialog
        open={Boolean(pointGroupIds)}
        onOpenChange={(open) => {
          if (!open) setPointGroupIds(null);
        }}
      >
        <DialogContent className="max-h-[min(82vh,640px)] overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle className="text-base">
              {t("Codex.timeline.groupTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t("Codex.timeline.groupDesc").replace(
                "{count}",
                String(groupedPoints.length)
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="scrollbar-app max-h-[min(60vh,460px)] overflow-y-auto p-2">
            {groupedPoints.map(({ point, type }) => (
              <button
                key={point.id}
                type="button"
                className="hover:bg-accent/45 flex w-full items-start gap-2 rounded px-2 py-2 text-left"
                onClick={() => editPoint(point.id)}
              >
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      type?.color[theme] ?? "var(--muted-foreground)",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-xs">
                    <span className="font-medium">
                      {type?.name ?? t("Codex.timeline.unknownType")}
                    </span>
                    <span className="text-muted-foreground">
                      {point.intensity ?? t("Codex.timeline.unrated")}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-[11px]">
                    {chapterById.get(point.chapterId)?.title ??
                      t("Codex.timeline.missingChapter")}
                  </span>
                  {point.note ? (
                    <span className="text-muted-foreground mt-1 line-clamp-2 block text-[11px] leading-relaxed">
                      {point.note}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
