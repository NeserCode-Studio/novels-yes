import { z } from "zod";

import { AppError } from "./errors";
import { requireRoot, requireWorkId } from "./helpers";
import { defineAppCommand } from "./types";
import { loadEntry, type Entry } from "@/services/codex";
import { loadOutline } from "@/services/outline";
import {
  loadEmotionTypeConfig,
  loadWorkTimeline,
  updateWorkTimeline,
  upsertEmotionPoint,
  type EmotionIntensity,
} from "@/services/timeline";

const workInput = z
  .object({
    work_id: z.string().uuid().optional(),
  })
  .strict();

const intensityInput = z
  .union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.null(),
  ])
  .optional();

function eventAppliesToWork(entry: Entry, workId: string): boolean {
  return (
    entry.scope.kind === "workspace" || entry.scope.workIds.includes(workId)
  );
}

async function validateEvent(
  root: string,
  workId: string,
  eventId: string
): Promise<Entry> {
  const entry = await loadEntry(root, eventId);
  if (!entry || entry.typeId !== "event") {
    throw new AppError(
      "invalid_argument",
      "event_id must reference an existing event entry."
    );
  }
  if (!eventAppliesToWork(entry, workId)) {
    throw new AppError(
      "invalid_argument",
      "The event does not apply to the requested work."
    );
  }
  return entry;
}

async function chapterIdsForWork(
  root: string,
  workId: string
): Promise<Set<string>> {
  const outline = await loadOutline(root, workId);
  return new Set(
    outline.nodes
      .filter((node) => node.type === "chapter")
      .map((node) => node.id)
  );
}

const timelineGet = defineAppCommand({
  id: "novels_timeline_get",
  title: "Get work timeline",
  description:
    "Return one work's event chapter links, emotion points, and emotion type configuration.",
  input: workInput,
  permission: "read",
  risk: "R0",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async execute(input, context) {
    const root = requireRoot(context);
    const workId = requireWorkId(context, input.work_id);
    const [timeline, emotionTypes] = await Promise.all([
      loadWorkTimeline(root, workId),
      loadEmotionTypeConfig(root),
    ]);
    return {
      work_id: workId,
      timeline,
      emotion_types: emotionTypes.types,
    };
  },
});

const timelineBatchUpsert = defineAppCommand({
  id: "novels_timeline_batch_upsert",
  title: "Batch upsert work timeline",
  description:
    "Replace chapter links for multiple events and upsert multiple emotion points in one atomic timeline write.",
  input: z
    .object({
      work_id: z.string().uuid().optional(),
      event_chapters: z
        .array(
          z
            .object({
              event_id: z.string().uuid(),
              chapter_ids: z.array(z.string().uuid()).max(500),
            })
            .strict()
        )
        .max(2_000)
        .default([]),
      emotion_points: z
        .array(
          z
            .object({
              point_id: z.string().uuid(),
              chapter_id: z.string().uuid(),
              event_id: z.string().uuid().nullable().optional(),
              type_id: z.string().trim().min(1).max(120),
              intensity: intensityInput,
              note: z.string().trim().max(2000).nullable().optional(),
            })
            .strict()
        )
        .max(5_000)
        .default([]),
    })
    .strict()
    .superRefine((input, context) => {
      if (!input.event_chapters.length && !input.emotion_points.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one timeline update is required.",
        });
      }

      const eventIds = new Set<string>();
      input.event_chapters.forEach((item, index) => {
        if (eventIds.has(item.event_id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["event_chapters", index, "event_id"],
            message: "Duplicate event in event_chapters.",
          });
        }
        eventIds.add(item.event_id);
      });

      const pointIds = new Set<string>();
      input.emotion_points.forEach((item, index) => {
        if (pointIds.has(item.point_id)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["emotion_points", index, "point_id"],
            message: "Duplicate point_id in emotion_points.",
          });
        }
        pointIds.add(item.point_id);
      });
    }),
  permission: "write",
  risk: "R1",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async execute(input, context) {
    const root = requireRoot(context);
    const workId = requireWorkId(context, input.work_id);
    const [chapters, emotionTypes] = await Promise.all([
      chapterIdsForWork(root, workId),
      loadEmotionTypeConfig(root),
    ]);

    const missingChapters = [
      ...new Set([
        ...input.event_chapters.flatMap((item) => item.chapter_ids),
        ...input.emotion_points.map((item) => item.chapter_id),
      ]),
    ].filter((chapterId) => !chapters.has(chapterId));
    if (missingChapters.length) {
      throw new AppError(
        "invalid_argument",
        "One or more chapter_ids do not belong to the requested work.",
        { chapter_ids: missingChapters }
      );
    }

    const missingTypes = [
      ...new Set(input.emotion_points.map((item) => item.type_id)),
    ].filter(
      (typeId) => !emotionTypes.types.some((type) => type.id === typeId)
    );
    if (missingTypes.length) {
      throw new AppError(
        "invalid_argument",
        "One or more type_ids do not reference an existing emotion type.",
        { type_ids: missingTypes }
      );
    }

    const eventIds = [
      ...new Set([
        ...input.event_chapters.map((item) => item.event_id),
        ...input.emotion_points.flatMap((item) =>
          item.event_id ? [item.event_id] : []
        ),
      ]),
    ];
    await Promise.all(
      eventIds.map((eventId) => validateEvent(root, workId, eventId))
    );

    const replacedEventIds = new Set(
      input.event_chapters.map((item) => item.event_id)
    );
    const emotionPointIds = new Set(
      input.emotion_points.map((item) => item.point_id)
    );
    const timeline = await updateWorkTimeline(root, workId, (current) => {
      const now = Date.now();
      const replacementLinks = input.event_chapters.flatMap((item) =>
        [...new Set(item.chapter_ids)].map((chapterId) => ({
          eventId: item.event_id,
          chapterId,
        }))
      );
      const replacementPoints = input.emotion_points.map((item) => {
        const existing = current.emotionPoints.find(
          (point) => point.id === item.point_id
        );
        return {
          id: item.point_id,
          chapterId: item.chapter_id,
          ...(item.event_id ? { eventId: item.event_id } : {}),
          typeId: item.type_id,
          ...(item.intensity != null
            ? { intensity: item.intensity as EmotionIntensity }
            : {}),
          ...(item.note ? { note: item.note } : {}),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
      });

      return {
        ...current,
        eventChapterLinks: [
          ...current.eventChapterLinks.filter(
            (link) => !replacedEventIds.has(link.eventId)
          ),
          ...replacementLinks,
        ],
        emotionPoints: [
          ...current.emotionPoints.filter(
            (point) => !emotionPointIds.has(point.id)
          ),
          ...replacementPoints,
        ],
      };
    });

    return {
      work_id: workId,
      event_count: input.event_chapters.length,
      emotion_point_count: input.emotion_points.length,
      timeline,
    };
  },
});

const eventChaptersSet = defineAppCommand({
  id: "novels_timeline_event_chapters_set",
  title: "Set event chapters",
  description:
    "Replace one event's chapter links in a work timeline after validating that every chapter belongs to the work.",
  input: z
    .object({
      work_id: z.string().uuid().optional(),
      event_id: z.string().uuid(),
      chapter_ids: z.array(z.string().uuid()).max(500),
    })
    .strict(),
  permission: "write",
  risk: "R1",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async execute(input, context) {
    const root = requireRoot(context);
    const workId = requireWorkId(context, input.work_id);
    const [event, chapters] = await Promise.all([
      validateEvent(root, workId, input.event_id),
      chapterIdsForWork(root, workId),
    ]);
    const chapterIds = [...new Set(input.chapter_ids)];
    const missing = chapterIds.filter((chapterId) => !chapters.has(chapterId));
    if (missing.length) {
      throw new AppError(
        "invalid_argument",
        "One or more chapter_ids do not belong to the requested work.",
        { chapter_ids: missing }
      );
    }

    const timeline = await updateWorkTimeline(root, workId, (current) => ({
      ...current,
      eventChapterLinks: [
        ...current.eventChapterLinks.filter(
          (link) => link.eventId !== input.event_id
        ),
        ...chapterIds.map((chapterId) => ({
          eventId: input.event_id,
          chapterId,
        })),
      ],
    }));

    return {
      work_id: workId,
      event: { id: event.id, name: event.name },
      chapter_ids: chapterIds,
      timeline,
    };
  },
});

const emotionPointUpsert = defineAppCommand({
  id: "novels_timeline_emotion_point_upsert",
  title: "Upsert emotion point",
  description:
    "Create or update one emotion point with an optional event link, intensity, and note.",
  input: z
    .object({
      work_id: z.string().uuid().optional(),
      point_id: z.string().uuid().optional(),
      chapter_id: z.string().uuid(),
      event_id: z.string().uuid().nullable().optional(),
      type_id: z.string().trim().min(1).max(120),
      intensity: intensityInput,
      note: z.string().trim().max(2000).nullable().optional(),
    })
    .strict(),
  permission: "write",
  risk: "R1",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async execute(input, context) {
    const root = requireRoot(context);
    const workId = requireWorkId(context, input.work_id);
    const [chapters, emotionTypes, current] = await Promise.all([
      chapterIdsForWork(root, workId),
      loadEmotionTypeConfig(root),
      loadWorkTimeline(root, workId),
    ]);
    if (!chapters.has(input.chapter_id)) {
      throw new AppError(
        "invalid_argument",
        "chapter_id does not belong to the requested work."
      );
    }
    if (!emotionTypes.types.some((type) => type.id === input.type_id)) {
      throw new AppError(
        "invalid_argument",
        "type_id must reference an existing emotion type."
      );
    }
    if (input.event_id) {
      await validateEvent(root, workId, input.event_id);
    }

    const pointId = input.point_id ?? crypto.randomUUID();
    const existing = current.emotionPoints.find(
      (point) => point.id === pointId
    );
    const now = Date.now();
    const point = {
      id: pointId,
      chapterId: input.chapter_id,
      ...(input.event_id ? { eventId: input.event_id } : {}),
      typeId: input.type_id,
      ...(input.intensity != null
        ? { intensity: input.intensity as EmotionIntensity }
        : {}),
      ...(input.note ? { note: input.note } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const timeline = await upsertEmotionPoint(root, workId, point);
    return {
      work_id: workId,
      point,
      timeline,
    };
  },
});

export const TIMELINE_COMMANDS = [
  timelineGet,
  timelineBatchUpsert,
  eventChaptersSet,
  emotionPointUpsert,
] as const;
