import {
  BookOpenText,
  CalendarPlus,
  ChevronDown,
  History,
  LocateFixed,
  Maximize2,
  Plus,
  Search,
  SmilePlus,
  Tags,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useI18n } from "@/composables";
import type { Entry } from "@/services/codex";
import type { TimelineAxisMode } from "@/services/timeline";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TimelineWorkOption = {
  id: string;
  title: string;
  archived: boolean;
};

interface TimelineToolbarProps {
  works: TimelineWorkOption[];
  selectedWorkId: string | null;
  onWorkChange: (workId: string) => void;
  axisMode: TimelineAxisMode;
  onAxisModeChange: (mode: TimelineAxisMode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  participants: Entry[];
  participantId: string | null;
  onParticipantChange: (participantId: string | null) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onFocusCurrent: () => void;
  onAddEmotion: () => void;
  onAddEvent: () => void;
  onManageTypes: () => void;
  disabled?: boolean;
}

export function TimelineToolbar({
  works,
  selectedWorkId,
  onWorkChange,
  axisMode,
  onAxisModeChange,
  query,
  onQueryChange,
  participants,
  participantId,
  onParticipantChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onFocusCurrent,
  onAddEmotion,
  onAddEvent,
  onManageTypes,
  disabled = false,
}: TimelineToolbarProps) {
  const { t } = useI18n();

  return (
    <div className="bg-background/95 shrink-0 border-b px-3 py-2 backdrop-blur">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Select
          value={selectedWorkId ?? ""}
          onValueChange={onWorkChange}
          disabled={disabled || works.length === 0}
        >
          <SelectTrigger
            className="h-9 w-[min(13rem,calc(100vw-5rem))] min-w-40 bg-neutral-100/70 text-sm dark:bg-neutral-800/35"
            aria-label={t("Codex.timeline.work")}
            title={t("Codex.timeline.work")}
          >
            <BookOpenText className="size-3.5 shrink-0" />
            <SelectValue placeholder={t("Codex.timeline.noWork")} />
          </SelectTrigger>
          <SelectContent>
            {works.map((work) => (
              <SelectItem key={work.id} value={work.id}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{work.title}</span>
                  {work.archived ? (
                    <span className="text-muted-foreground text-[10px]">
                      {t("Library.card.archivedBadge")}
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          className="flex h-9 shrink-0 items-center rounded-md border bg-neutral-100/60 p-0.5 dark:bg-neutral-800/35"
          role="group"
          aria-label={t("Codex.timeline.axis")}
        >
          <button
            type="button"
            className={[
              "flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition-colors",
              axisMode === "reading"
                ? "bg-background text-foreground border-primary/25 border shadow-sm"
                : "text-muted-foreground hover:text-foreground border border-transparent",
            ].join(" ")}
            aria-pressed={axisMode === "reading"}
            onClick={() => onAxisModeChange("reading")}
          >
            <BookOpenText className="size-3.5" />
            {t("Codex.timeline.axis.reading")}
          </button>
          <button
            type="button"
            className={[
              "flex h-8 items-center gap-1.5 rounded px-2.5 text-xs transition-colors",
              axisMode === "story"
                ? "bg-background text-foreground border-primary/25 border shadow-sm"
                : "text-muted-foreground hover:text-foreground border border-transparent",
            ].join(" ")}
            aria-pressed={axisMode === "story"}
            onClick={() => onAxisModeChange("story")}
          >
            <History className="size-3.5" />
            {t("Codex.timeline.axis.story")}
          </button>
        </div>

        <div className="relative min-w-40 flex-1 sm:max-w-72">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            className="h-9 bg-neutral-100/70 pr-8 pl-8 text-sm dark:bg-neutral-800/35"
            placeholder={t("Codex.timeline.search")}
            aria-label={t("Codex.timeline.search")}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 text-xs"
              onClick={() => onQueryChange("")}
              aria-label={t("Codex.clearSearch")}
            >
              ×
            </button>
          ) : null}
        </div>

        <Select
          value={participantId ?? "__all"}
          onValueChange={(value) =>
            onParticipantChange(value === "__all" ? null : value)
          }
          disabled={disabled}
        >
          <SelectTrigger
            className="h-9 w-40 bg-neutral-100/70 text-xs dark:bg-neutral-800/35"
            aria-label={t("Codex.timeline.participant")}
            title={t("Codex.timeline.participant")}
          >
            <Users className="size-3.5 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">
              {t("Codex.timeline.participantAll")}
            </SelectItem>
            {participants.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="bg-border h-5 w-px shrink-0" />

        <div className="flex shrink-0 items-center rounded-md border bg-neutral-100/60 p-0.5 dark:bg-neutral-800/35">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded"
            disabled={disabled}
            onClick={onZoomOut}
            aria-label={t("Codex.timeline.zoomOut")}
            title={t("Codex.timeline.zoomOut")}
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded"
            disabled={disabled}
            onClick={onFit}
            aria-label={t("Codex.timeline.fit")}
            title={t("Codex.timeline.fit")}
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded"
            disabled={disabled}
            onClick={onZoomIn}
            aria-label={t("Codex.timeline.zoomIn")}
            title={t("Codex.timeline.zoomIn")}
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded"
            disabled={disabled}
            onClick={onFocusCurrent}
            aria-label={t("Codex.timeline.focusCurrent")}
            title={t("Codex.timeline.focusCurrent")}
          >
            <LocateFixed className="size-3.5" />
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              className="ml-auto h-9 px-3"
              disabled={disabled}
            >
              <Plus className="size-3.5" />
              {t("Codex.timeline.add")}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onAddEmotion}>
              <SmilePlus className="size-4" />
              {t("Codex.timeline.addEmotion")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onAddEvent}>
              <CalendarPlus className="size-4" />
              {t("Codex.timeline.addEvent")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onManageTypes}>
              <Tags className="size-4" />
              {t("Codex.timeline.manageTypes")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
