import type { Entry } from "@/services/codex";
import type {
  EmotionPoint,
  EmotionType,
  EventTimelineRecord,
} from "@/services/timeline";
import type { OutlineNode } from "@/shared/schema";

export type TimelineChapter = OutlineNode & {
  visualIndex: number;
  volumeTitle: string | null;
};

export type TimelineEventView = {
  entry: Entry;
  record: EventTimelineRecord;
};

export type TimelineEmotionPointView = {
  point: EmotionPoint;
  type: EmotionType | null;
};
