import type { Entry, Relation } from "../codex";
import {
  type EmotionPoint,
  type EventChapterLink,
  type EventTimelineRecord,
  type TimelineSlot,
} from "./types";

export type ChapterLike = {
  id: string;
  title: string;
  order: number;
  parentId: string | null;
};

export function referencedFieldIds(entry: Entry, key: string): string[] {
  const value = entry.fields[key];
  if (value?.kind === "ref") return value.value ? [value.value] : [];
  if (value?.kind === "refs") return [...new Set(value.value)];
  return [];
}

export function fieldText(entry: Entry, key: string): string {
  const value = entry.fields[key];
  if (!value || value.kind === "ref" || value.kind === "refs") return "";
  return String(value.value).trim();
}

export function fieldNumber(entry: Entry, key: string): number | null {
  const value = entry.fields[key];
  return value?.kind === "number" && Number.isFinite(value.value)
    ? value.value
    : null;
}

export function eventInWorkScope(entry: Entry, workId: string): boolean {
  return (
    entry.scope.kind === "workspace" || entry.scope.workIds.includes(workId)
  );
}

export function buildEventRecords(
  entries: Entry[],
  links: EventChapterLink[],
  chapterOrder: Map<string, number>
): EventTimelineRecord[] {
  const linksByEvent = new Map<string, string[]>();
  for (const link of links) {
    const list = linksByEvent.get(link.eventId);
    if (list) list.push(link.chapterId);
    else linksByEvent.set(link.eventId, [link.chapterId]);
  }

  return entries
    .filter((entry) => entry.typeId === "event")
    .map((entry) => {
      const chapterIds = [
        ...new Set(
          (linksByEvent.get(entry.id) ?? []).filter((id) =>
            chapterOrder.has(id)
          )
        ),
      ].sort(
        (left, right) =>
          (chapterOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (chapterOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      );
      const anchorChapterId = chapterIds[0] ?? null;
      return {
        entryId: entry.id,
        chapterIds,
        anchorChapterId,
        anchorChapterIndex: anchorChapterId
          ? (chapterOrder.get(anchorChapterId) ?? null)
          : null,
        participantIds: referencedFieldIds(entry, "participants"),
        placeIds: referencedFieldIds(entry, "place"),
        storyOrder: fieldNumber(entry, "order"),
        timeLabel: fieldText(entry, "time"),
      };
    });
}

export function buildReadingSlots(chapters: ChapterLike[]): TimelineSlot[] {
  const denominator = Math.max(chapters.length - 1, 1);
  return chapters.map((chapter, index) => ({
    key: chapter.id,
    label: chapter.title,
    detail: `${index + 1}`,
    chapterId: chapter.id,
    chapterIndex: index,
    startRatio: index / denominator,
  }));
}

export function buildStorySlots(events: EventTimelineRecord[]): TimelineSlot[] {
  const grouped = new Map<number, EventTimelineRecord[]>();
  for (const event of events) {
    if (event.storyOrder === null) continue;
    const list = grouped.get(event.storyOrder);
    if (list) list.push(event);
    else grouped.set(event.storyOrder, [event]);
  }
  const orders = [...grouped.keys()].sort((left, right) => left - right);
  const denominator = Math.max(orders.length - 1, 1);
  return orders.map((order, index) => ({
    key: `story-${order}`,
    label: `${order}`,
    detail: `${grouped.get(order)?.length ?? 0}`,
    storyOrder: order,
    startRatio: index / denominator,
  }));
}

export type AggregatedEmotionPoint = {
  key: string;
  slotKey: string;
  chapterId: string | null;
  storyOrder: number | null;
  typeId: string;
  value: number;
  count: number;
  pointIds: string[];
};

export function aggregateEmotionPoints(
  points: EmotionPoint[],
  slots: TimelineSlot[],
  mode: "reading" | "story",
  eventsById: Map<string, EventTimelineRecord>
): AggregatedEmotionPoint[] {
  const slotKeyByChapter = new Map<string, string>();
  const slotKeyByStoryOrder = new Map<number, string>();
  for (const slot of slots) {
    if (slot.chapterId) slotKeyByChapter.set(slot.chapterId, slot.key);
    if (slot.storyOrder !== undefined) {
      slotKeyByStoryOrder.set(slot.storyOrder, slot.key);
    }
  }
  const slotByKey = new Map(slots.map((slot) => [slot.key, slot]));

  const grouped = new Map<
    string,
    {
      slot: TimelineSlot;
      typeId: string;
      values: number[];
      pointIds: string[];
      chapterId: string | null;
      storyOrder: number | null;
    }
  >();

  for (const point of points) {
    if (point.intensity === undefined) continue;
    let slot: TimelineSlot | undefined;
    if (mode === "reading") {
      const slotKey = slotKeyByChapter.get(point.chapterId);
      slot = slotKey ? slotByKey.get(slotKey) : undefined;
    } else if (point.eventId) {
      const event = eventsById.get(point.eventId);
      const slotKey =
        event?.storyOrder === null || event?.storyOrder === undefined
          ? undefined
          : slotKeyByStoryOrder.get(event.storyOrder);
      slot = slotKey ? slotByKey.get(slotKey) : undefined;
    }
    if (!slot) continue;
    const key = `${slot.key}:${point.typeId}`;
    const current = grouped.get(key);
    if (current) {
      current.values.push(point.intensity);
      current.pointIds.push(point.id);
    } else {
      grouped.set(key, {
        slot,
        typeId: point.typeId,
        values: [point.intensity],
        pointIds: [point.id],
        chapterId: slot.chapterId ?? null,
        storyOrder: slot.storyOrder ?? null,
      });
    }
  }

  return [...grouped.entries()].map(([key, value]) => ({
    key,
    slotKey: value.slot.key,
    chapterId: value.chapterId,
    storyOrder: value.storyOrder,
    typeId: value.typeId,
    value:
      value.values.reduce((total, intensity) => total + intensity, 0) /
      value.values.length,
    count: value.values.length,
    pointIds: value.pointIds,
  }));
}

export function eventMatchesQuery(
  event: Entry,
  query: string,
  entriesById: Map<string, Entry>
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const participantNames = referencedFieldIds(event, "participants")
    .map((id) => entriesById.get(id)?.name ?? "")
    .join(" ");
  const placeNames = referencedFieldIds(event, "place")
    .map((id) => entriesById.get(id)?.name ?? "")
    .join(" ");
  return [
    event.name,
    event.summary,
    event.body,
    fieldText(event, "time"),
    participantNames,
    placeNames,
  ]
    .join("\n")
    .toLocaleLowerCase()
    .includes(needle);
}

export function causalEventIds(
  eventId: string,
  relations: Relation[]
): string[] {
  return [
    ...new Set(
      relations
        .filter(
          (relation) => relation.fromId === eventId || relation.toId === eventId
        )
        .map((relation) =>
          relation.fromId === eventId ? relation.toId : relation.fromId
        )
    ),
  ];
}
