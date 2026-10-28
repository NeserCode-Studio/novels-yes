import { createLogger } from "@/lib/logger";

import { createFs } from "../fs";
import {
  codexEmotionTypesFile,
  codexRootDir,
  workTimelineFile,
} from "../paths";
import { defaultEmotionTypeConfig } from "./defaults";
import {
  emotionPointSchema,
  emotionTypeConfigSchema,
  emptyWorkTimeline,
  eventChapterLinkSchema,
  workTimelineSchema,
  type EmotionPoint,
  type EmotionTypeConfig,
  type WorkTimeline,
} from "./types";

const log = createLogger("TimelineStore");
const writeQueues = new Map<string, Promise<unknown>>();

export class TimelineDataError extends Error {
  readonly kind: "parse" | "validation" | "write";
  readonly cause?: unknown;

  constructor(
    kind: TimelineDataError["kind"],
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = "TimelineDataError";
    this.kind = kind;
    this.cause = cause;
  }
}

function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const tracked = previous.catch(() => undefined).then(operation);
  writeQueues.set(key, tracked);
  void tracked
    .finally(() => {
      if (writeQueues.get(key) === tracked) writeQueues.delete(key);
    })
    .catch(() => undefined);
  return tracked;
}

async function parseJson(rel: string, raw: string): Promise<unknown> {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new TimelineDataError(
      "parse",
      `Timeline JSON could not be parsed: ${rel}`,
      error
    );
  }
}

export async function loadEmotionTypeConfig(
  root: string
): Promise<EmotionTypeConfig> {
  const fs = createFs(root);
  const file = codexEmotionTypesFile();
  if (!(await fs.exists(file))) return defaultEmotionTypeConfig();

  const parsed = emotionTypeConfigSchema.safeParse(
    await parseJson(file, await fs.readText(file))
  );
  if (!parsed.success) {
    throw new TimelineDataError(
      "validation",
      `Invalid emotion type config: ${file}`,
      parsed.error
    );
  }
  return parsed.data;
}

export async function saveEmotionTypeConfig(
  root: string,
  config: EmotionTypeConfig
): Promise<EmotionTypeConfig> {
  const parsed = emotionTypeConfigSchema.parse(config);
  return enqueue(`types:${root}`, async () => {
    try {
      const fs = createFs(root);
      await fs.createDir(codexRootDir());
      await fs.writeText(
        codexEmotionTypesFile(),
        JSON.stringify(parsed, null, 2)
      );
      return parsed;
    } catch (error) {
      throw new TimelineDataError(
        "write",
        "Failed to save emotion type config.",
        error
      );
    }
  });
}

export async function loadWorkTimeline(
  root: string,
  workId: string
): Promise<WorkTimeline> {
  const fs = createFs(root);
  const file = workTimelineFile(workId);
  if (!(await fs.exists(file))) return emptyWorkTimeline();

  const parsed = workTimelineSchema.safeParse(
    await parseJson(file, await fs.readText(file))
  );
  if (!parsed.success) {
    throw new TimelineDataError(
      "validation",
      `Invalid work timeline: ${file}`,
      parsed.error
    );
  }
  return parsed.data;
}

async function writeWorkTimeline(
  root: string,
  workId: string,
  timeline: WorkTimeline
): Promise<WorkTimeline> {
  const parsed = workTimelineSchema.parse(timeline);
  try {
    const fs = createFs(root);
    await fs.writeText(
      workTimelineFile(workId),
      JSON.stringify(parsed, null, 2)
    );
    return parsed;
  } catch (error) {
    throw new TimelineDataError(
      "write",
      `Failed to save work timeline: ${workId}`,
      error
    );
  }
}

export async function updateWorkTimeline(
  root: string,
  workId: string,
  update: (current: WorkTimeline) => WorkTimeline
): Promise<WorkTimeline> {
  return enqueue(`timeline:${root}:${workId}`, async () => {
    const current = await loadWorkTimeline(root, workId);
    const next = update(current);
    return writeWorkTimeline(root, workId, next);
  });
}

export async function upsertEmotionPoint(
  root: string,
  workId: string,
  point: EmotionPoint
): Promise<WorkTimeline> {
  const parsed = emotionPointSchema.parse(point);
  return updateWorkTimeline(root, workId, (current) => ({
    ...current,
    emotionPoints: [
      ...current.emotionPoints.filter((item) => item.id !== parsed.id),
      parsed,
    ],
  }));
}

export async function removeEmotionPoint(
  root: string,
  workId: string,
  pointId: string
): Promise<WorkTimeline> {
  return updateWorkTimeline(root, workId, (current) => ({
    ...current,
    emotionPoints: current.emotionPoints.filter(
      (point) => point.id !== pointId
    ),
  }));
}

export async function addEventChapterLinks(
  root: string,
  workId: string,
  eventId: string,
  chapterIds: string[]
): Promise<WorkTimeline> {
  const links = [
    ...new Set(
      chapterIds.filter(Boolean).map((chapterId) => `${eventId}:${chapterId}`)
    ),
  ].map((key) => {
    const [nextEventId, chapterId] = key.split(":");
    return eventChapterLinkSchema.parse({ eventId: nextEventId, chapterId });
  });

  return updateWorkTimeline(root, workId, (current) => {
    const existing = new Set(
      current.eventChapterLinks.map(
        (link) => `${link.eventId}:${link.chapterId}`
      )
    );
    return {
      ...current,
      eventChapterLinks: [
        ...current.eventChapterLinks,
        ...links.filter(
          (link) => !existing.has(`${link.eventId}:${link.chapterId}`)
        ),
      ],
    };
  });
}

export async function removeEventChapterLink(
  root: string,
  workId: string,
  eventId: string,
  chapterId: string
): Promise<WorkTimeline> {
  return updateWorkTimeline(root, workId, (current) => ({
    ...current,
    eventChapterLinks: current.eventChapterLinks.filter(
      (link) => link.eventId !== eventId || link.chapterId !== chapterId
    ),
  }));
}

export async function countEmotionTypeUsage(
  root: string,
  typeId: string,
  workIds: string[]
): Promise<number> {
  const timelines = await Promise.all(
    [...new Set(workIds)].map((workId) => loadWorkTimeline(root, workId))
  );
  return timelines.reduce(
    (count, timeline) =>
      count +
      timeline.emotionPoints.filter((point) => point.typeId === typeId).length,
    0
  );
}

export async function countEmotionTypeUsages(
  root: string,
  workIds: string[]
): Promise<Record<string, number>> {
  const timelines = await Promise.all(
    [...new Set(workIds)].map((workId) => loadWorkTimeline(root, workId))
  );
  const counts: Record<string, number> = {};
  for (const timeline of timelines) {
    for (const point of timeline.emotionPoints) {
      counts[point.typeId] = (counts[point.typeId] ?? 0) + 1;
    }
  }
  return counts;
}

export async function reassignEmotionType(
  root: string,
  workIds: string[],
  fromTypeId: string,
  toTypeId: string
): Promise<void> {
  for (const workId of [...new Set(workIds)]) {
    const timeline = await loadWorkTimeline(root, workId);
    if (!timeline.emotionPoints.some((point) => point.typeId === fromTypeId)) {
      continue;
    }
    await updateWorkTimeline(root, workId, (current) => ({
      ...current,
      emotionPoints: current.emotionPoints.map((point) =>
        point.typeId === fromTypeId
          ? { ...point, typeId: toTypeId, updatedAt: Date.now() }
          : point
      ),
    }));
  }
}

export async function deleteEmotionTypePoints(
  root: string,
  workIds: string[],
  typeId: string
): Promise<void> {
  for (const workId of [...new Set(workIds)]) {
    const timeline = await loadWorkTimeline(root, workId);
    if (!timeline.emotionPoints.some((point) => point.typeId === typeId)) {
      continue;
    }
    await updateWorkTimeline(root, workId, (current) => ({
      ...current,
      emotionPoints: current.emotionPoints.filter(
        (point) => point.typeId !== typeId
      ),
    }));
  }
  log.info("emotion type points deleted", { typeId });
}
