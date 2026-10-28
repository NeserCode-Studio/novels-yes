import { z } from "zod";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must use #RRGGBB format.");

const intensitySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const emotionTypeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(60),
  color: z.object({
    light: hexColorSchema,
    dark: hexColorSchema,
  }),
  icon: z.string().trim().max(80).optional(),
  order: z.number().int(),
  hidden: z.boolean().default(false),
  preset: z.boolean().default(false),
});

export type EmotionType = z.infer<typeof emotionTypeSchema>;

export const emotionTypeConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    seeded: z.boolean().default(true),
    types: z.array(emotionTypeSchema).min(1).max(80),
  })
  .superRefine((config, context) => {
    const typeIds = new Set<string>();
    config.types.forEach((type, index) => {
      if (typeIds.has(type.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["types", index, "id"],
          message: "Duplicate emotion type ID.",
        });
      }
      typeIds.add(type.id);
    });
  });

export type EmotionTypeConfig = z.infer<typeof emotionTypeConfigSchema>;

export const eventChapterLinkSchema = z.object({
  eventId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export type EventChapterLink = z.infer<typeof eventChapterLinkSchema>;

export const emotionPointSchema = z.object({
  id: z.string().uuid(),
  chapterId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  typeId: z.string().trim().min(1),
  intensity: intensitySchema.optional(),
  note: z.string().trim().max(2000).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type EmotionPoint = z.infer<typeof emotionPointSchema>;
export type EmotionIntensity = NonNullable<EmotionPoint["intensity"]>;

export const workTimelineSchema = z
  .object({
    version: z.literal(1).default(1),
    eventChapterLinks: z.array(eventChapterLinkSchema).default([]),
    emotionPoints: z.array(emotionPointSchema).default([]),
  })
  .superRefine((timeline, context) => {
    const linkKeys = new Set<string>();
    timeline.eventChapterLinks.forEach((link, index) => {
      const key = `${link.eventId}:${link.chapterId}`;
      if (linkKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["eventChapterLinks", index],
          message: "Duplicate event chapter link.",
        });
      }
      linkKeys.add(key);
    });

    const pointIds = new Set<string>();
    timeline.emotionPoints.forEach((point, index) => {
      if (pointIds.has(point.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["emotionPoints", index, "id"],
          message: "Duplicate emotion point ID.",
        });
      }
      pointIds.add(point.id);
    });
  });

export type WorkTimeline = z.infer<typeof workTimelineSchema>;

export function emptyWorkTimeline(): WorkTimeline {
  return {
    version: 1,
    eventChapterLinks: [],
    emotionPoints: [],
  };
}

export type TimelineAxisMode = "reading" | "story";

export type TimelineSlot = {
  key: string;
  label: string;
  detail: string;
  chapterId?: string;
  chapterIndex?: number;
  storyOrder?: number;
  startRatio: number;
};

export type EventTimelineRecord = {
  entryId: string;
  chapterIds: string[];
  anchorChapterId: string | null;
  anchorChapterIndex: number | null;
  participantIds: string[];
  placeIds: string[];
  storyOrder: number | null;
  timeLabel: string;
};
