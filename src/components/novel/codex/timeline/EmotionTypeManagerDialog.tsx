import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Save,
  Tags,
  Trash2,
} from "lucide-react";

import { useI18n, useToast } from "@/composables";
import {
  countEmotionTypeUsages,
  deleteEmotionTypePoints,
  reassignEmotionType,
  saveEmotionTypeConfig,
  type EmotionType,
  type EmotionTypeConfig,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorSwatchPicker } from "../ColorSwatchPicker";

const DEFAULT_COLORS = [
  { light: "#7A5C3E", dark: "#C6A07A" },
  { light: "#5D6F3A", dark: "#AFC57D" },
  { light: "#8B4F78", dark: "#D18DB9" },
  { light: "#3D6F8E", dark: "#7FBDD8" },
  { light: "#6E5B8E", dark: "#B3A0D2" },
  { light: "#8A5A4A", dark: "#D79A87" },
];

function cloneTypes(types: EmotionType[]): EmotionType[] {
  return [...types]
    .sort((left, right) => left.order - right.order)
    .map((type) => ({
      ...type,
      color: { ...type.color },
    }));
}

interface EmotionTypeManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  root: string;
  workIds: string[];
  config: EmotionTypeConfig;
  onConfigSaved: (config: EmotionTypeConfig) => void;
}

export function EmotionTypeManagerDialog({
  open,
  onOpenChange,
  root,
  workIds,
  config,
  onConfigSaved,
}: EmotionTypeManagerDialogProps) {
  const { t } = useI18n();
  const toast = useToast();
  const toastRef = useRef(toast);
  const [types, setTypes] = useState<EmotionType[]>(() =>
    cloneTypes(config.types)
  );
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageLoadFailed, setUsageLoadFailed] = useState(false);
  const [usageReloadVersion, setUsageReloadVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"invalid" | "save" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmotionType | null>(null);
  const [deleteStep, setDeleteStep] = useState<"choose" | "force">("choose");
  const [reassignTargetId, setReassignTargetId] = useState("");

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    setTypes(cloneTypes(config.types));
    setError(null);
    setDeleteTarget(null);
    setDeleteStep("choose");
  }, [config, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingUsage(true);
    setUsageLoadFailed(false);
    setUsageCounts({});
    void countEmotionTypeUsages(root, workIds)
      .then((counts) => {
        if (!cancelled) setUsageCounts(counts);
      })
      .catch(() => {
        if (!cancelled) {
          setUsageLoadFailed(true);
          toastRef.current.error("Codex.timeline.typeManager.usageFailed");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingUsage(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, root, usageReloadVersion, workIds]);

  const reassignTargets = useMemo(
    () => types.filter((type) => type.id !== deleteTarget?.id),
    [deleteTarget?.id, types]
  );

  function updateType(typeId: string, patch: Partial<EmotionType>) {
    setTypes((current) =>
      current.map((type) => (type.id === typeId ? { ...type, ...patch } : type))
    );
  }

  function reorder(typeId: string, direction: -1 | 1) {
    setTypes((current) => {
      const index = current.findIndex((type) => type.id === typeId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addType() {
    setTypes((current) => {
      if (current.length >= 80) return current;
      const index = current.length;
      const preset = DEFAULT_COLORS[index % DEFAULT_COLORS.length];
      return [
        ...current,
        {
          id: `emotion-${crypto.randomUUID()}`,
          name: t("Codex.timeline.typeManager.defaultName").replace(
            "{count}",
            String(index + 1)
          ),
          color: { ...preset },
          order: index,
          hidden: false,
          preset: false,
        },
      ];
    });
  }

  async function persist(nextTypes: EmotionType[]): Promise<boolean> {
    if (nextTypes.some((type) => !type.name.trim())) {
      setError("invalid");
      return false;
    }
    const normalized: EmotionTypeConfig = {
      ...config,
      types: nextTypes.map((type, index) => ({
        ...type,
        name: type.name.trim(),
        order: index,
      })),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await saveEmotionTypeConfig(root, normalized);
      setTypes(cloneTypes(saved.types));
      onConfigSaved(saved);
      toast.success("Codex.timeline.typeManager.saved");
      return true;
    } catch {
      setError("save");
      toast.error("Codex.timeline.typeManager.saveFailed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    await persist(types);
  }

  async function deleteWithoutReferences() {
    if (!deleteTarget) return;
    const next = types.filter((type) => type.id !== deleteTarget.id);
    const ok = await persist(next);
    if (ok) setDeleteTarget(null);
  }

  async function reassignAndDelete() {
    if (!deleteTarget || !reassignTargetId) return;
    setSaving(true);
    setError(null);
    try {
      await reassignEmotionType(
        root,
        workIds,
        deleteTarget.id,
        reassignTargetId
      );
      const next = types.filter((type) => type.id !== deleteTarget.id);
      const ok = await persist(next);
      if (ok) {
        setUsageCounts((current) => {
          const nextCounts = { ...current };
          nextCounts[reassignTargetId] =
            (nextCounts[reassignTargetId] ?? 0) +
            (nextCounts[deleteTarget.id] ?? 0);
          delete nextCounts[deleteTarget.id];
          return nextCounts;
        });
        setDeleteTarget(null);
      }
    } catch {
      toast.error("Codex.timeline.typeManager.reassignFailed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteReferencesAndType() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await deleteEmotionTypePoints(root, workIds, deleteTarget.id);
      const next = types.filter((type) => type.id !== deleteTarget.id);
      const ok = await persist(next);
      if (ok) {
        setUsageCounts((current) => {
          const nextCounts = { ...current };
          delete nextCounts[deleteTarget.id];
          return nextCounts;
        });
        setDeleteTarget(null);
      }
    } catch {
      toast.error("Codex.timeline.typeManager.deleteFailed");
    } finally {
      setSaving(false);
    }
  }

  const deleteUsage = deleteTarget ? (usageCounts[deleteTarget.id] ?? 0) : 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!saving) onOpenChange(nextOpen);
        }}
      >
        <DialogContent className="flex h-[min(88vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Tags className="size-4" />
              {t("Codex.timeline.typeManager.title")}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {t("Codex.timeline.typeManager.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="scrollbar-app min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-muted-foreground flex-1 text-[11px] leading-relaxed">
                {t("Codex.timeline.typeManager.workspaceHint")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={types.length >= 80 || saving}
                onClick={addType}
              >
                <Plus className="size-3.5" />
                {t("Codex.timeline.typeManager.add")}
              </Button>
            </div>

            {usageLoadFailed ? (
              <div className="border-destructive/25 bg-destructive/5 text-destructive mb-3 flex items-center gap-2 rounded-md border px-2.5 py-2 text-[11px]">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  {t("Codex.timeline.typeManager.usageFailed")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive h-7 shrink-0 px-2"
                  onClick={() =>
                    setUsageReloadVersion((version) => version + 1)
                  }
                >
                  <RefreshCw className="size-3" />
                  {t("Codex.timeline.retry")}
                </Button>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-md border">
              {types.map((type, index) => {
                const usage = usageCounts[type.id] ?? 0;
                return (
                  <div
                    key={type.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-2.5 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ColorSwatchPicker
                        label={t("Codex.timeline.typeManager.lightColor")}
                        value={type.color.light}
                        onChange={(color) =>
                          updateType(type.id, {
                            color: { ...type.color, light: color },
                          })
                        }
                      />
                      <ColorSwatchPicker
                        label={t("Codex.timeline.typeManager.darkColor")}
                        value={type.color.dark}
                        onChange={(color) =>
                          updateType(type.id, {
                            color: { ...type.color, dark: color },
                          })
                        }
                      />
                      <Input
                        value={type.name}
                        maxLength={60}
                        className="h-8 min-w-0 text-sm"
                        aria-label={t("Codex.timeline.typeManager.name")}
                        onChange={(event) =>
                          updateType(type.id, { name: event.target.value })
                        }
                      />
                    </div>
                    <div className="hidden items-center gap-1 text-[10px] sm:flex">
                      <span className="text-muted-foreground">
                        {loadingUsage
                          ? t("Codex.timeline.typeManager.counting")
                          : usageLoadFailed
                            ? "—"
                            : t("Codex.timeline.typeManager.usage").replace(
                                "{count}",
                                String(usage)
                              )}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === 0 || saving}
                        onClick={() => reorder(type.id, -1)}
                        aria-label={t("Codex.type.moveUp")}
                        title={t("Codex.type.moveUp")}
                      >
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={index === types.length - 1 || saving}
                        onClick={() => reorder(type.id, 1)}
                        aria-label={t("Codex.type.moveDown")}
                        title={t("Codex.type.moveDown")}
                      >
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={saving}
                        onClick={() =>
                          updateType(type.id, { hidden: !type.hidden })
                        }
                        aria-label={
                          type.hidden
                            ? t("Codex.timeline.typeManager.show")
                            : t("Codex.timeline.typeManager.hide")
                        }
                        title={
                          type.hidden
                            ? t("Codex.timeline.typeManager.show")
                            : t("Codex.timeline.typeManager.hide")
                        }
                      >
                        {type.hidden ? (
                          <EyeOff className="size-3" />
                        ) : (
                          <Eye className="size-3" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-7"
                        disabled={
                          types.length <= 1 ||
                          saving ||
                          loadingUsage ||
                          usageLoadFailed
                        }
                        onClick={() => {
                          setDeleteTarget(type);
                          setDeleteStep("choose");
                          setReassignTargetId(
                            types.find((item) => item.id !== type.id)?.id ?? ""
                          );
                        }}
                        aria-label={t("Codex.timeline.typeManager.delete")}
                        title={
                          types.length <= 1
                            ? t("Codex.timeline.typeManager.lastType")
                            : usageLoadFailed
                              ? t("Codex.timeline.typeManager.usageFailed")
                              : t("Codex.timeline.typeManager.delete")
                        }
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {error ? (
              <p className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-xs">
                {t(
                  error === "invalid"
                    ? "Codex.timeline.typeManager.invalid"
                    : "Codex.timeline.typeManager.saveFailed"
                )}
              </p>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t px-5 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t("Editor.chapter.cancelRename")}
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void saveDraft()}
            >
              <Save className="size-3.5" />
              {saving ? t("Codex.save.saving") : t("Codex.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !saving) {
            setDeleteTarget(null);
            setDeleteStep("choose");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteUsage > 0
                ? t("Codex.timeline.typeManager.usedDeleteTitle")
                : t("Codex.timeline.typeManager.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUsage > 0
                ? t("Codex.timeline.typeManager.usedDeleteDesc").replace(
                    "{count}",
                    String(deleteUsage)
                  )
                : t("Codex.timeline.typeManager.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteUsage > 0 && deleteStep === "choose" ? (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium">
                {t("Codex.timeline.typeManager.reassignTarget")}
              </label>
              <Select
                value={reassignTargetId}
                onValueChange={setReassignTargetId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t(
                      "Codex.timeline.typeManager.chooseReassignTarget"
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {reassignTargets.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="mt-1 justify-start"
                disabled={!reassignTargetId || saving}
                onClick={() => void reassignAndDelete()}
              >
                {t("Codex.timeline.typeManager.reassignAndDelete")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive justify-start"
                disabled={saving}
                onClick={() => setDeleteStep("force")}
              >
                {t("Codex.timeline.typeManager.deletePoints")}
              </Button>
            </div>
          ) : null}

          {deleteUsage > 0 && deleteStep === "force" ? (
            <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-xs leading-relaxed">
              {t("Codex.timeline.typeManager.forceDeleteWarning").replace(
                "{count}",
                String(deleteUsage)
              )}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>
              {t("Editor.chapter.cancelRename")}
            </AlertDialogCancel>
            {deleteUsage === 0 ? (
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-white"
                disabled={saving}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteWithoutReferences();
                }}
              >
                {t("Codex.timeline.typeManager.delete")}
              </AlertDialogAction>
            ) : deleteStep === "force" ? (
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-white"
                disabled={saving}
                onClick={(event) => {
                  event.preventDefault();
                  void deleteReferencesAndType();
                }}
              >
                {t("Codex.timeline.typeManager.confirmDeletePoints")}
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
