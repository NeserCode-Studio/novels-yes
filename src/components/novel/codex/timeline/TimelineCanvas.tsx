import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Plus } from "lucide-react";

import { useI18n } from "@/composables";
import { useThemeContext } from "@/contexts/theme";
import {
  aggregateEmotionPoints,
  type EmotionType,
  type EventTimelineRecord,
  type TimelineAxisMode,
  type TimelineSlot,
} from "@/services/timeline";
import { EventTrack, type EventCluster } from "./EventTrack";
import type {
  TimelineChapter,
  TimelineEmotionPointView,
  TimelineEventView,
} from "./shared";

const EMOTION_TRACK_HEIGHT = 194;
const CURVE_BASELINE = 154;
const CURVE_STEP = 25;

type TimelineBin = {
  index: number;
  startIndex: number;
  endIndex: number;
  slot: TimelineSlot;
  left: number;
  width: number;
};

type EmotionBinGroup = {
  id: string;
  binIndex: number;
  typeId: string;
  value: number;
  count: number;
  pointIds: string[];
};

type UnratedBinGroup = {
  id: string;
  binIndex: number;
  typeId: string;
  count: number;
  pointIds: string[];
};

interface TimelineCanvasProps {
  axisMode: TimelineAxisMode;
  slots: TimelineSlot[];
  chapters: TimelineChapter[];
  events: TimelineEventView[];
  eventRecordsById: Map<string, EventTimelineRecord>;
  points: TimelineEmotionPointView[];
  types: EmotionType[];
  tileWidth: number;
  selectedEventId: string | null;
  participantId: string | null;
  currentChapterId: string | null;
  focusRequest: { chapterId: string; nonce: number } | null;
  onViewportWidthChange: (width: number) => void;
  onSelectEvent: (eventId: string) => void;
  onEditPoint: (pointId: string) => void;
  onOpenEmotionGroup: (pointIds: string[]) => void;
  onAddEmotion: (chapterId: string | null) => void;
}

function emotionY(intensity: number): number {
  return CURVE_BASELINE - (intensity - 1) * CURVE_STEP;
}

function splitIntoBins(
  slots: TimelineSlot[],
  binSize: number,
  tileWidth: number
): TimelineBin[] {
  const bins: TimelineBin[] = [];
  for (let start = 0; start < slots.length; start += binSize) {
    const end = Math.min(start + binSize, slots.length);
    bins.push({
      index: bins.length,
      startIndex: start,
      endIndex: end - 1,
      slot: slots[start],
      left: start * tileWidth,
      width: (end - start) * tileWidth,
    });
  }
  return bins;
}

export function TimelineCanvas({
  axisMode,
  slots,
  chapters,
  events,
  eventRecordsById,
  points,
  types,
  tileWidth,
  selectedEventId,
  participantId,
  currentChapterId,
  focusRequest,
  onViewportWidthChange,
  onSelectEvent,
  onEditPoint,
  onOpenEmotionGroup,
  onAddEmotion,
}: TimelineCanvasProps) {
  const { t } = useI18n();
  const { theme } = useThemeContext();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousTileWidthRef = useRef(tileWidth);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const binSize = tileWidth >= 9 ? 1 : Math.max(2, Math.ceil(12 / tileWidth));
  const bins = useMemo(
    () => splitIntoBins(slots, binSize, tileWidth),
    [binSize, slots, tileWidth]
  );
  const totalWidth = Math.max(viewportWidth, slots.length * tileWidth);
  const slotIndexByKey = useMemo(
    () => new Map(slots.map((slot, index) => [slot.key, index])),
    [slots]
  );
  const slotIndexByChapter = useMemo(
    () =>
      new Map(
        slots
          .map((slot, index) => [slot.chapterId, index] as const)
          .filter((entry): entry is readonly [string, number] =>
            Boolean(entry[0])
          )
      ),
    [slots]
  );
  const slotIndexByStoryOrder = useMemo(
    () =>
      new Map(
        slots
          .map((slot, index) => [slot.storyOrder, index] as const)
          .filter(
            (entry): entry is readonly [number, number] =>
              entry[0] !== undefined
          )
      ),
    [slots]
  );
  const chapterById = useMemo(
    () => new Map(chapters.map((chapter) => [chapter.id, chapter])),
    [chapters]
  );

  const eventBinById = useMemo(() => {
    const result = new Map<string, number>();
    for (const event of events) {
      const slotIndex =
        axisMode === "reading"
          ? event.record.anchorChapterId
            ? slotIndexByChapter.get(event.record.anchorChapterId)
            : undefined
          : event.record.storyOrder !== null
            ? slotIndexByStoryOrder.get(event.record.storyOrder)
            : undefined;
      if (slotIndex === undefined) continue;
      result.set(event.entry.id, Math.floor(slotIndex / binSize));
    }
    return result;
  }, [axisMode, binSize, events, slotIndexByChapter, slotIndexByStoryOrder]);

  const firstVisibleBin = Math.max(
    0,
    Math.floor(scrollLeft / Math.max(tileWidth * binSize, 1)) - 2
  );
  const lastVisibleBin = Math.min(
    bins.length - 1,
    Math.ceil((scrollLeft + viewportWidth) / Math.max(tileWidth * binSize, 1)) +
      2
  );
  const visibleBins = bins.slice(
    firstVisibleBin,
    Math.max(firstVisibleBin, lastVisibleBin + 1)
  );

  const eventClusters = useMemo<EventCluster[]>(() => {
    const groups = new Map<number, TimelineEventView[]>();
    for (const event of events) {
      const binIndex = eventBinById.get(event.entry.id);
      if (binIndex === undefined) continue;
      if (binIndex < firstVisibleBin || binIndex > lastVisibleBin) continue;
      const list = groups.get(binIndex);
      if (list) list.push(event);
      else groups.set(binIndex, [event]);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left - right)
      .map(([binIndex, clusterEvents]) => {
        const bin = bins[binIndex];
        return {
          binIndex,
          left: bin?.left ?? binIndex * binSize * tileWidth,
          width: bin?.width ?? binSize * tileWidth,
          events: clusterEvents,
        };
      });
  }, [
    bins,
    binSize,
    eventBinById,
    events,
    firstVisibleBin,
    lastVisibleBin,
    tileWidth,
  ]);

  const aggregateGroups = useMemo(() => {
    const aggregates = aggregateEmotionPoints(
      points.map((view) => view.point),
      slots,
      axisMode,
      eventRecordsById
    );
    const groups = new Map<
      string,
      {
        binIndex: number;
        typeId: string;
        weightedValue: number;
        count: number;
        pointIds: string[];
      }
    >();
    for (const aggregate of aggregates) {
      const slotIndex = slotIndexByKey.get(aggregate.slotKey);
      if (slotIndex === undefined) continue;
      const binIndex = Math.floor(slotIndex / binSize);
      if (binIndex < firstVisibleBin - 1 || binIndex > lastVisibleBin + 1) {
        continue;
      }
      const key = `${binIndex}:${aggregate.typeId}`;
      const current = groups.get(key);
      if (current) {
        current.weightedValue += aggregate.value * aggregate.count;
        current.count += aggregate.count;
        current.pointIds.push(...aggregate.pointIds);
      } else {
        groups.set(key, {
          binIndex,
          typeId: aggregate.typeId,
          weightedValue: aggregate.value * aggregate.count,
          count: aggregate.count,
          pointIds: [...aggregate.pointIds],
        });
      }
    }
    return [...groups.entries()]
      .map<EmotionBinGroup>(([id, group]) => ({
        id,
        binIndex: group.binIndex,
        typeId: group.typeId,
        value: group.weightedValue / group.count,
        count: group.count,
        pointIds: group.pointIds,
      }))
      .sort(
        (left, right) =>
          left.binIndex - right.binIndex ||
          left.typeId.localeCompare(right.typeId)
      );
  }, [
    axisMode,
    binSize,
    eventRecordsById,
    firstVisibleBin,
    lastVisibleBin,
    points,
    slotIndexByKey,
    slots,
  ]);

  const unratedGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        binIndex: number;
        typeId: string;
        pointIds: string[];
      }
    >();
    for (const view of points) {
      if (view.point.intensity !== undefined) continue;
      const slotIndex =
        axisMode === "reading"
          ? slotIndexByChapter.get(view.point.chapterId)
          : view.point.eventId
            ? slotIndexByStoryOrder.get(
                eventRecordsById.get(view.point.eventId)?.storyOrder ?? NaN
              )
            : undefined;
      if (slotIndex === undefined) continue;
      const binIndex = Math.floor(slotIndex / binSize);
      if (binIndex < firstVisibleBin - 1 || binIndex > lastVisibleBin + 1) {
        continue;
      }
      const key = `${binIndex}:${view.point.typeId}`;
      const current = groups.get(key);
      if (current) current.pointIds.push(view.point.id);
      else {
        groups.set(key, {
          binIndex,
          typeId: view.point.typeId,
          pointIds: [view.point.id],
        });
      }
    }
    return [...groups.entries()].map<UnratedBinGroup>(([id, group]) => ({
      id,
      ...group,
      count: group.pointIds.length,
    }));
  }, [
    axisMode,
    binSize,
    eventRecordsById,
    firstVisibleBin,
    lastVisibleBin,
    points,
    slotIndexByChapter,
    slotIndexByStoryOrder,
  ]);

  const typeById = useMemo(
    () => new Map(types.map((type) => [type.id, type])),
    [types]
  );

  const currentMarker = useMemo(() => {
    if (axisMode !== "reading" || !currentChapterId) return null;
    const slotIndex = slotIndexByChapter.get(currentChapterId);
    if (slotIndex === undefined) return null;
    const binIndex = Math.floor(slotIndex / binSize);
    return {
      left:
        (binIndex * binSize +
          Math.min(binSize, slots.length - binIndex * binSize) / 2) *
        tileWidth,
    };
  }, [
    axisMode,
    binSize,
    currentChapterId,
    slotIndexByChapter,
    slots.length,
    tileWidth,
  ]);

  const volumeBands = useMemo(() => {
    if (axisMode !== "reading") return [];
    const groups: Array<{
      title: string;
      startIndex: number;
      endIndex: number;
    }> = [];
    for (const chapter of chapters) {
      const title = chapter.volumeTitle ?? t("Codex.timeline.noVolume");
      const previous = groups[groups.length - 1];
      if (previous?.title === title) previous.endIndex = chapter.visualIndex;
      else {
        groups.push({
          title,
          startIndex: chapter.visualIndex,
          endIndex: chapter.visualIndex,
        });
      }
    }
    return groups
      .filter(
        (group) =>
          group.endIndex >= firstVisibleBin * binSize &&
          group.startIndex <= (lastVisibleBin + 1) * binSize
      )
      .map((group) => ({
        ...group,
        left: Math.max(group.startIndex, firstVisibleBin * binSize) * tileWidth,
        width:
          (Math.min(group.endIndex, (lastVisibleBin + 1) * binSize - 1) -
            Math.max(group.startIndex, firstVisibleBin * binSize) +
            1) *
          tileWidth,
      }));
  }, [
    axisMode,
    binSize,
    chapters,
    firstVisibleBin,
    lastVisibleBin,
    t,
    tileWidth,
  ]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      setViewportWidth(width);
      onViewportWidthChange(width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onViewportWidthChange]);

  useEffect(() => {
    const element = scrollRef.current;
    const previousWidth = previousTileWidthRef.current;
    if (!element || !viewportWidth || previousWidth === tileWidth) return;
    const centerSlot =
      (element.scrollLeft + viewportWidth / 2) / Math.max(previousWidth, 0.1);
    element.scrollLeft = Math.max(
      0,
      centerSlot * tileWidth - viewportWidth / 2
    );
    setScrollLeft(element.scrollLeft);
    previousTileWidthRef.current = tileWidth;
  }, [tileWidth, viewportWidth]);

  useEffect(() => {
    if (!focusRequest || axisMode !== "reading") return;
    const element = scrollRef.current;
    const slotIndex = slotIndexByChapter.get(focusRequest.chapterId);
    if (!element || slotIndex === undefined) return;
    element.scrollTo({
      left: Math.max(0, slotIndex * tileWidth - element.clientWidth * 0.35),
      behavior: "smooth",
    });
  }, [axisMode, focusRequest, slotIndexByChapter, tileWidth]);

  function xForBin(index: number): number {
    const bin = bins[index];
    if (!bin) return index * binSize * tileWidth;
    return bin.left + bin.width / 2;
  }

  function openPointGroup(pointIds: string[]) {
    if (pointIds.length === 1) onEditPoint(pointIds[0]);
    else onOpenEmotionGroup(pointIds);
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="scrollbar-app h-full min-h-[470px] overflow-x-auto overflow-y-hidden"
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div className="relative" style={{ width: Math.max(totalWidth, 480) }}>
          <div className="relative h-7 border-b bg-neutral-100/50 dark:bg-neutral-800/30">
            {volumeBands.map((band) => (
              <div
                key={`${band.title}:${band.startIndex}`}
                className="border-border/60 text-muted-foreground absolute top-1 h-5 overflow-hidden border-r border-l px-2 text-[10px] font-medium"
                style={{
                  left: band.left,
                  width: Math.max(band.width, 1),
                }}
                title={band.title}
              >
                <span className="block truncate">{band.title}</span>
              </div>
            ))}
          </div>

          <div className="relative h-12 border-b bg-neutral-50/50 dark:bg-neutral-900/20">
            {visibleBins.map((bin) => {
              const chapter = bin.slot.chapterId
                ? chapterById.get(bin.slot.chapterId)
                : null;
              const detailText =
                axisMode === "reading"
                  ? chapter
                    ? chapter.title
                    : bin.slot.label
                  : bin.slot.label;
              return (
                <div
                  key={`scale:${bin.index}`}
                  className="border-border/45 absolute inset-y-0 border-r"
                  style={{ left: bin.left, width: Math.max(bin.width, 1) }}
                >
                  <span className="text-muted-foreground absolute top-1 left-1 block max-w-[calc(100%-0.5rem)] truncate text-[10px] tabular-nums">
                    {binSize > 1
                      ? `${bin.startIndex + 1}–${bin.endIndex + 1}`
                      : detailText}
                  </span>
                  {axisMode === "reading" && tileWidth >= 28 ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:bg-accent hover:text-foreground absolute right-1 bottom-1 flex size-5 items-center justify-center rounded"
                      title={t("Codex.timeline.addPointAtChapter")}
                      aria-label={t("Codex.timeline.addPointAtChapter")}
                      onClick={() => onAddEmotion(bin.slot.chapterId ?? null)}
                    >
                      <Plus className="size-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {currentMarker ? (
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-px bg-rose-500/60"
                style={{ left: currentMarker.left }}
              >
                <span className="absolute top-1 left-1 rounded bg-rose-500 px-1 text-[9px] whitespace-nowrap text-white">
                  {t("Codex.timeline.currentChapter")}
                </span>
              </div>
            ) : null}
          </div>

          <div
            className="relative border-b"
            style={{ height: EMOTION_TRACK_HEIGHT }}
          >
            <div className="text-muted-foreground absolute top-1.5 left-2 z-20 text-[10px] font-medium">
              {t("Codex.timeline.emotionTrack")}
            </div>
            <div className="text-muted-foreground absolute top-2 right-2 z-20 text-[9px]">
              {t("Codex.timeline.intensityScale")}
            </div>
            <svg
              className="pointer-events-none absolute inset-0"
              width={Math.max(totalWidth, 480)}
              height={EMOTION_TRACK_HEIGHT}
              aria-hidden
            >
              {[1, 2, 3, 4, 5].map((intensity) => (
                <line
                  key={intensity}
                  x1={0}
                  x2={Math.max(totalWidth, 480)}
                  y1={emotionY(intensity)}
                  y2={emotionY(intensity)}
                  className="stroke-border/45"
                  strokeWidth={1}
                  strokeDasharray={intensity === 3 ? "3 4" : undefined}
                />
              ))}
              {types.map((type) => {
                const groups = aggregateGroups.filter(
                  (group) => group.typeId === type.id
                );
                if (groups.length < 2) return null;
                const path = groups
                  .map(
                    (group, index) =>
                      `${index === 0 ? "M" : "L"} ${xForBin(group.binIndex)} ${emotionY(group.value)}`
                  )
                  .join(" ");
                return (
                  <path
                    key={type.id}
                    d={path}
                    fill="none"
                    stroke={type.color[theme]}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={0.75}
                  />
                );
              })}
            </svg>

            {aggregateGroups.map((group) => {
              const type = typeById.get(group.typeId);
              if (!type) return null;
              const left = xForBin(group.binIndex);
              return (
                <button
                  key={group.id}
                  type="button"
                  className="absolute z-10 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white shadow-sm ring-1 ring-black/10 transition-transform hover:scale-125 dark:border-neutral-900"
                  style={{
                    left,
                    top: emotionY(group.value),
                    backgroundColor: type.color[theme],
                  }}
                  title={`${type.name} · ${group.value.toFixed(1)} · ${t(
                    "Codex.timeline.pointCount"
                  ).replace("{count}", String(group.count))}`}
                  aria-label={`${type.name} ${group.value.toFixed(1)}`}
                  onClick={() => openPointGroup(group.pointIds)}
                >
                  {group.count > 1 ? (
                    <span className="bg-foreground text-background absolute -top-2 -right-2 rounded-full px-1 text-[8px] leading-3 tabular-nums">
                      {group.count}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {unratedGroups.map((group) => {
              const type = typeById.get(group.typeId);
              if (!type) return null;
              return (
                <button
                  key={group.id}
                  type="button"
                  className="bg-background absolute z-10 size-3 -translate-x-1/2 rounded-full border-2 transition-transform hover:scale-125"
                  style={{
                    left: xForBin(group.binIndex),
                    top: EMOTION_TRACK_HEIGHT - 18,
                    borderColor: type.color[theme],
                  }}
                  title={`${type.name} · ${t("Codex.timeline.unrated")}`}
                  aria-label={`${type.name} ${t("Codex.timeline.unrated")}`}
                  onClick={() => openPointGroup(group.pointIds)}
                />
              );
            })}
          </div>

          <div className="relative">
            <EventTrack
              clusters={eventClusters}
              tileWidth={tileWidth}
              selectedEventId={selectedEventId}
              participantId={participantId}
              onSelectEvent={onSelectEvent}
            />
          </div>

          {currentMarker ? (
            <div
              className="pointer-events-none absolute top-7 bottom-0 z-0 w-px bg-rose-500/35"
              style={{ left: currentMarker.left }}
            />
          ) : null}
        </div>
      </div>

      {!slots.length ? (
        <div className="bg-background/80 absolute inset-0 flex items-center justify-center px-6 text-center">
          <div>
            <CalendarClock className="text-muted-foreground mx-auto size-5" />
            <p className="mt-2 text-sm font-medium">
              {t("Codex.timeline.emptyAxis")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
