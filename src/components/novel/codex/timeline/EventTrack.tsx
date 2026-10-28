import { CalendarClock, ChevronRight, MapPin, Users } from "lucide-react";

import { useI18n } from "@/composables";
import { referencedFieldIds } from "@/services/timeline";
import type { Entry } from "@/services/codex";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TimelineEventView } from "./shared";

export type EventCluster = {
  binIndex: number;
  left: number;
  width: number;
  events: TimelineEventView[];
};

interface EventTrackProps {
  clusters: EventCluster[];
  tileWidth: number;
  selectedEventId: string | null;
  participantId: string | null;
  onSelectEvent: (eventId: string) => void;
}

function EventMarker({
  event,
  compact,
  selected,
  dimmed,
  onSelect,
}: {
  event: TimelineEventView;
  compact: boolean;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const label = event.entry.name || t("Codex.timeline.untitledEvent");

  if (compact) {
    return (
      <button
        type="button"
        className={[
          "bg-background size-2.5 rounded-full border-2 transition-opacity",
          selected ? "ring-foreground/35 ring-2 ring-offset-2" : "",
          dimmed ? "opacity-25" : "opacity-100",
        ].join(" ")}
        style={{
          borderColor: "var(--muted-foreground)",
        }}
        title={label}
        aria-label={label}
        onClick={onSelect}
      />
    );
  }

  return (
    <button
      type="button"
      className={[
        "bg-background/95 flex max-w-44 min-w-0 items-center gap-1.5 rounded border px-1.5 py-1 text-left text-[11px] shadow-xs transition-all",
        selected
          ? "border-primary/45 bg-accent text-accent-foreground"
          : "border-border/70 hover:border-foreground/20 hover:bg-accent/35",
        dimmed ? "opacity-35" : "opacity-100",
      ].join(" ")}
      title={label}
      onClick={onSelect}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: "var(--muted-foreground)" }}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function EventTrack({
  clusters,
  tileWidth,
  selectedEventId,
  participantId,
  onSelectEvent,
}: EventTrackProps) {
  const { t } = useI18n();
  const compact = tileWidth < 72;

  return (
    <div className="relative h-[122px]">
      <div className="text-muted-foreground absolute top-0 left-2 z-10 text-[10px] font-medium">
        {t("Codex.timeline.eventTrack")}
      </div>
      <div className="absolute inset-x-0 top-6 bottom-0 rounded-sm bg-neutral-100/35 dark:bg-neutral-800/20" />
      {clusters.map((cluster) => {
        const dimmed = Boolean(
          participantId &&
          !cluster.events.some((event) =>
            referencedFieldIds(event.entry, "participants").includes(
              participantId
            )
          )
        );
        const selected = cluster.events.some(
          (event) => event.entry.id === selectedEventId
        );
        const left = cluster.left + Math.max(2, cluster.width / 2);
        const style = {
          left,
          top:
            cluster.binIndex % 3 === 0
              ? 32
              : cluster.binIndex % 3 === 1
                ? 55
                : 78,
        };

        if (cluster.events.length === 1) {
          return (
            <div
              key={`${cluster.binIndex}:${cluster.events[0].entry.id}`}
              className="absolute -translate-x-1/2"
              style={style}
            >
              <EventMarker
                event={cluster.events[0]}
                compact={compact}
                selected={selected}
                dimmed={dimmed}
                onSelect={() => onSelectEvent(cluster.events[0].entry.id)}
              />
            </div>
          );
        }

        return (
          <div
            key={`cluster:${cluster.binIndex}`}
            className="absolute -translate-x-1/2"
            style={style}
          >
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={[
                    "bg-background/95 flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-medium shadow-xs",
                    selected
                      ? "border-primary/45 bg-accent"
                      : "border-border/70",
                    dimmed ? "opacity-35" : "",
                  ].join(" ")}
                  aria-label={t("Codex.timeline.eventCluster").replace(
                    "{count}",
                    String(cluster.events.length)
                  )}
                >
                  <CalendarClock className="size-3" />
                  {cluster.events.length}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="center"
                className="w-64 p-1.5"
                sideOffset={6}
              >
                <p className="text-muted-foreground px-2 py-1 text-[11px] font-medium">
                  {t("Codex.timeline.eventCluster").replace(
                    "{count}",
                    String(cluster.events.length)
                  )}
                </p>
                <div className="max-h-56 overflow-y-auto">
                  {cluster.events.map((event) => (
                    <button
                      key={event.entry.id}
                      type="button"
                      className="hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                      onClick={() => onSelectEvent(event.entry.id)}
                    >
                      <span className="bg-foreground/55 size-1.5 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1 truncate">
                        {event.entry.name}
                      </span>
                      <ChevronRight className="text-muted-foreground size-3" />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })}
    </div>
  );
}

interface EventQueueProps {
  title: string;
  hint: string;
  events: TimelineEventView[];
  entriesById: Map<string, Entry>;
  selectedEventId: string | null;
  participantId: string | null;
  onSelectEvent: (eventId: string) => void;
}

export function EventQueue({
  title,
  hint,
  events,
  entriesById,
  selectedEventId,
  participantId,
  onSelectEvent,
}: EventQueueProps) {
  const { t } = useI18n();
  if (!events.length) return null;

  return (
    <section className="border-t px-3 py-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {events.length}
        </span>
        <p className="text-muted-foreground ml-auto hidden text-[11px] sm:block">
          {hint}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
        {events.map((event) => {
          const participantNames = referencedFieldIds(
            event.entry,
            "participants"
          )
            .map((id) => entriesById.get(id)?.name)
            .filter((name): name is string => Boolean(name));
          const placeNames = referencedFieldIds(event.entry, "place")
            .map((id) => entriesById.get(id)?.name)
            .filter((name): name is string => Boolean(name));
          const dimmed = Boolean(
            participantId &&
            !referencedFieldIds(event.entry, "participants").includes(
              participantId
            )
          );
          return (
            <button
              key={event.entry.id}
              type="button"
              className={[
                "min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors",
                selectedEventId === event.entry.id
                  ? "border-primary/35 bg-accent/45"
                  : "hover:bg-accent/30 border-border/60",
                dimmed ? "opacity-40" : "",
              ].join(" ")}
              onClick={() => onSelectEvent(event.entry.id)}
            >
              <p className="truncate text-xs font-medium">{event.entry.name}</p>
              <div className="text-muted-foreground mt-1 flex min-w-0 items-center gap-2 text-[10px]">
                <span className="flex min-w-0 items-center gap-1">
                  <CalendarClock className="size-3 shrink-0" />
                  <span className="truncate">
                    {event.record.timeLabel ||
                      (event.record.storyOrder === null
                        ? t("Codex.timeline.timeUnknown")
                        : String(event.record.storyOrder))}
                  </span>
                </span>
                {participantNames.length ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <Users className="size-3 shrink-0" />
                    <span className="truncate">
                      {participantNames.slice(0, 2).join(" / ")}
                    </span>
                  </span>
                ) : null}
                {placeNames.length ? (
                  <span className="flex min-w-0 items-center gap-1">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{placeNames[0]}</span>
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
