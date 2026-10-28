import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Search,
  Settings2,
  SmilePlus,
  Trash2,
} from "lucide-react";

import { useI18n } from "@/composables";
import { useThemeContext } from "@/contexts/theme";
import type {
  EmotionIntensity,
  EmotionPoint,
  EmotionType,
} from "@/services/timeline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TimelineChapter, TimelineEventView } from "./shared";

type Choice = {
  value: string;
  label: string;
  detail?: string;
};

function SearchableChoice({
  choices,
  value,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  onChange,
}: {
  choices: Choice[];
  value: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = choices.find((choice) => choice.value === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return choices;
    return choices.filter((choice) =>
      [choice.label, choice.detail]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle)
    );
  }, [choices, query]);
  const visible = filtered.slice(0, 120);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="border-input bg-background focus-visible:ring-ring flex h-9 w-full min-w-0 items-center gap-2 rounded-md border px-3 text-left text-sm outline-none focus-visible:ring-2"
        >
          <span
            className={[
              "min-w-0 flex-1 truncate",
              selected ? "" : "text-muted-foreground",
            ].join(" ")}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(24rem,calc(100vw-3rem))] p-0"
      >
        <div className="relative border-b p-2">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2" />
          <Input
            autoFocus
            value={query}
            className="h-8 pl-8 text-xs"
            placeholder={searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1" role="listbox">
          {visible.length ? (
            visible.map((choice) => (
              <button
                key={choice.value || "__empty"}
                type="button"
                role="option"
                aria-selected={choice.value === value}
                className={[
                  "hover:bg-accent focus:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs outline-none",
                  choice.value === value ? "bg-accent/55" : "",
                ].join(" ")}
                onClick={() => {
                  onChange(choice.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{choice.label}</span>
                  {choice.detail ? (
                    <span className="text-muted-foreground mt-0.5 block truncate text-[10px]">
                      {choice.detail}
                    </span>
                  ) : null}
                </span>
                {choice.value === value ? (
                  <Check className="size-3.5 shrink-0" />
                ) : null}
              </button>
            ))
          ) : (
            <p className="text-muted-foreground px-2 py-4 text-center text-xs">
              {emptyLabel}
            </p>
          )}
          {filtered.length > visible.length ? (
            <p className="text-muted-foreground px-2 py-1 text-center text-[10px]">
              {t("Codex.timeline.refineSearch")}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface EmotionPointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: TimelineChapter[];
  events: TimelineEventView[];
  types: EmotionType[];
  initialPoint: EmotionPoint | null;
  initialChapterId?: string | null;
  initialEventId?: string | null;
  onSave: (point: EmotionPoint) => Promise<boolean>;
  onDelete: (pointId: string) => Promise<boolean>;
  onManageTypes: () => void;
}

export function EmotionPointDialog({
  open,
  onOpenChange,
  chapters,
  events,
  types,
  initialPoint,
  initialChapterId,
  initialEventId,
  onSave,
  onDelete,
  onManageTypes,
}: EmotionPointDialogProps) {
  const { t } = useI18n();
  const { theme } = useThemeContext();
  const [chapterId, setChapterId] = useState("");
  const [eventId, setEventId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [intensity, setIntensity] = useState<EmotionIntensity | undefined>();
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initialEvent = initialPoint?.eventId
      ? events.find((event) => event.entry.id === initialPoint.eventId)
      : initialEventId
        ? events.find((event) => event.entry.id === initialEventId)
        : null;
    const nextChapterId =
      initialPoint?.chapterId ??
      initialChapterId ??
      initialEvent?.record.anchorChapterId ??
      chapters[0]?.id ??
      "";
    const fallbackType =
      types.find((type) => type.id === initialPoint?.typeId) ?? types[0];
    setChapterId(nextChapterId);
    setEventId(initialPoint?.eventId ?? initialEventId ?? "");
    setTypeId(fallbackType?.id ?? "");
    setIntensity(initialPoint?.intensity);
    setNote(initialPoint?.note ?? "");
    setAttempted(false);
    setFailed(false);
    setDeleteOpen(false);
  }, [
    chapters,
    events,
    initialChapterId,
    initialEventId,
    initialPoint,
    open,
    types,
  ]);

  const chapterChoices = useMemo<Choice[]>(
    () =>
      chapters.map((chapter) => ({
        value: chapter.id,
        label: chapter.title,
        detail: `${t("Codex.timeline.chapter")} ${chapter.visualIndex + 1}${
          chapter.volumeTitle ? ` · ${chapter.volumeTitle}` : ""
        }`,
      })),
    [chapters, t]
  );
  const eventChoices = useMemo<Choice[]>(
    () => [
      {
        value: "",
        label: t("Codex.timeline.eventNone"),
        detail: t("Codex.timeline.eventNoneHint"),
      },
      ...events.map((event) => ({
        value: event.entry.id,
        label: event.entry.name,
        detail:
          event.record.timeLabel ||
          (event.record.storyOrder === null
            ? t("Codex.timeline.timeUnknown")
            : `${t("Codex.timeline.order")} ${event.record.storyOrder}`),
      })),
    ],
    [events, t]
  );
  const selectedType = types.find((type) => type.id === typeId);

  async function submit() {
    setAttempted(true);
    if (!chapterId || !typeId || submitting) return;
    setSubmitting(true);
    setFailed(false);
    const now = Date.now();
    const point: EmotionPoint = {
      id: initialPoint?.id ?? crypto.randomUUID(),
      chapterId,
      eventId: eventId || undefined,
      typeId,
      intensity,
      note: note.trim() || undefined,
      createdAt: initialPoint?.createdAt ?? now,
      updatedAt: now,
    };
    const ok = await onSave(point);
    setSubmitting(false);
    if (ok) {
      onOpenChange(false);
    } else {
      setFailed(true);
    }
  }

  async function confirmDelete() {
    if (!initialPoint || deleting) return;
    setDeleting(true);
    const ok = await onDelete(initialPoint.id);
    setDeleting(false);
    if (ok) {
      setDeleteOpen(false);
      onOpenChange(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!submitting) onOpenChange(nextOpen);
        }}
      >
        <DialogContent className="flex max-h-[min(88vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
              <DialogTitle className="flex items-center gap-2 text-base">
                <SmilePlus className="size-4" />
                {initialPoint
                  ? t("Codex.timeline.editPointTitle")
                  : t("Codex.timeline.newPointTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">
                {initialPoint
                  ? t("Codex.timeline.editPointDesc")
                  : t("Codex.timeline.newPointDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="scrollbar-app min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-3">
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs font-medium">
                    {t("Codex.timeline.chapter")}
                    <span className="text-destructive ml-1">*</span>
                  </span>
                  <SearchableChoice
                    choices={chapterChoices}
                    value={chapterId}
                    placeholder={t("Codex.timeline.chooseChapter")}
                    searchPlaceholder={t("Codex.timeline.searchChapter")}
                    emptyLabel={t("Codex.timeline.noChapterMatch")}
                    onChange={setChapterId}
                  />
                  {attempted && !chapterId ? (
                    <span className="text-destructive text-[11px]">
                      {t("Codex.timeline.chapterRequired")}
                    </span>
                  ) : null}
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-xs font-medium">
                      {t("Codex.timeline.type")}
                      <span className="text-destructive ml-1">*</span>
                    </span>
                    <Select value={typeId} onValueChange={setTypeId}>
                      <SelectTrigger aria-label={t("Codex.timeline.type")}>
                        <SelectValue
                          placeholder={t("Codex.timeline.chooseType")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {types.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{
                                  backgroundColor: type.color[theme],
                                }}
                              />
                              {type.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-xs font-medium">
                      {t("Codex.timeline.intensity")}
                    </span>
                    <div className="flex h-9 items-center gap-1 rounded-md border p-0.5">
                      {([1, 2, 3, 4, 5] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          aria-pressed={intensity === level}
                          className={[
                            "h-7 flex-1 rounded text-xs tabular-nums transition-colors",
                            intensity === level
                              ? "bg-foreground text-background"
                              : "hover:bg-accent text-muted-foreground",
                          ].join(" ")}
                          onClick={() => setIntensity(level)}
                        >
                          {level}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={[
                          "h-7 shrink-0 rounded px-1.5 text-[10px]",
                          intensity === undefined
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        ].join(" ")}
                        aria-pressed={intensity === undefined}
                        onClick={() => setIntensity(undefined)}
                      >
                        {t("Codex.timeline.unrated")}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs font-medium">
                    {t("Codex.timeline.event")}
                  </span>
                  <SearchableChoice
                    choices={eventChoices}
                    value={eventId}
                    placeholder={t("Codex.timeline.chooseEvent")}
                    searchPlaceholder={t("Codex.timeline.searchEvent")}
                    emptyLabel={t("Codex.timeline.noEventMatch")}
                    onChange={setEventId}
                  />
                </label>

                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-xs font-medium">
                    {t("Codex.timeline.note")}
                  </span>
                  <Textarea
                    value={note}
                    rows={4}
                    maxLength={2000}
                    className="min-h-24 resize-y text-sm leading-relaxed"
                    placeholder={t("Codex.timeline.notePlaceholder")}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>

                <div className="flex items-center gap-2 text-[11px]">
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        selectedType?.color[theme] ?? "var(--muted-foreground)",
                    }}
                  />
                  <span className="text-muted-foreground">
                    {selectedType?.name ?? t("Codex.timeline.noTypes")}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1"
                    onClick={() => {
                      onOpenChange(false);
                      onManageTypes();
                    }}
                  >
                    <Settings2 className="size-3" />
                    {t("Codex.timeline.manageTypes")}
                  </button>
                </div>

                {failed ? (
                  <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs">
                    {t("Codex.timeline.saveFailed")}
                  </p>
                ) : null}
              </div>
            </div>

            <DialogFooter className="flex-row items-center border-t px-5 py-3">
              {initialPoint ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive mr-auto px-2"
                  disabled={submitting || deleting}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  {t("Codex.timeline.delete")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                {t("Editor.chapter.cancelRename")}
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting || Boolean(attempted && (!chapterId || !typeId))
                }
              >
                {submitting ? t("Codex.save.saving") : t("Codex.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Codex.timeline.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("Codex.timeline.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("Editor.chapter.cancelRename")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? t("Codex.save.saving") : t("Codex.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
