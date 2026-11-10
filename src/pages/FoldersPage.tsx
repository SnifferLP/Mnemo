import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  Layers,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { FolderNode, StudySetSummary } from "@/lib/types";
import { cn, errorMessage, formatRelative } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { EmptyState, LoadingPanel, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label, Progress } from "@/components/ui/misc";

export function FoldersPage() {
  const navigate = useNavigate();
  const { t, tp } = useI18n();
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "rename">("create");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [folderList, allSets] = await Promise.all([api.folders.list(), api.sets.list({ sort: "title" })]);
      setFolders(folderList);
      setSets(allSets);
    } catch (error) {
      toast.error(t("Could not load folders"), { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const childrenOf = useMemo(
    () => (parent: string | null) =>
      folders
        .filter((node) => node.folder.parentId === parent)
        .sort((a, b) => a.folder.position - b.folder.position),
    [folders],
  );

  const selectedFolder = folders.find((node) => node.folder.id === selected)?.folder ?? null;
  const visibleSets = sets.filter((set) => (selected ? set.folderId === selected : true));

  const totalInFolder = (folderId: string): number => {
    const direct = folders.find((node) => node.folder.id === folderId)?.setCount ?? 0;
    const nested = childrenOf(folderId).reduce((sum, child) => sum + totalInFolder(child.folder.id), 0);
    return direct + nested;
  };

  const openCreate = (parent: string | null) => {
    setDialogMode("create");
    setParentId(parent);
    setName("");
    setDialogOpen(true);
  };

  const openRename = (folder: FolderNode) => {
    setDialogMode("rename");
    setSelected(folder.folder.id);
    setName(folder.folder.name);
    setDialogOpen(true);
  };

  const submitDialog = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (dialogMode === "create") {
        const folder = await api.folders.create(name.trim(), parentId);
        if (parentId) setExpanded((current) => ({ ...current, [parentId]: true }));
        toast.success(t("Folder created"));
        setSelected(folder.id);
      } else if (selected) {
        await api.folders.update(selected, name.trim());
        toast.success(t("Folder renamed"));
      }
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async (folder: FolderNode) => {
    if (
      !window.confirm(
        t(
          'Delete "{name}"? Subfolders are deleted too — study sets are kept and moved out of the folder.',
          { name: folder.folder.name },
        ),
      )
    ) {
      return;
    }
    try {
      await api.folders.delete(folder.folder.id);
      if (selected === folder.folder.id) setSelected(null);
      toast.success(t("Folder deleted"));
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const renderTree = (parent: string | null, depth = 0): React.ReactNode =>
    childrenOf(parent).map((node) => {
      const kids = childrenOf(node.folder.id);
      const open = expanded[node.folder.id] ?? true;
      const active = selected === node.folder.id;
      return (
        <div key={node.folder.id}>
          <div
            className={cn(
              "group flex items-center gap-1 rounded-lg pr-1 transition-colors",
              active ? "bg-primary/10 text-primary" : "hover:bg-accent/50",
            )}
            style={{ paddingLeft: depth * 12 }}
          >
            <button
              className="grid size-6 shrink-0 place-items-center text-muted-foreground"
              onClick={() => setExpanded((current) => ({ ...current, [node.folder.id]: !open }))}
            >
              {kids.length > 0 ? (
                <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
              ) : (
                <span className="size-1 rounded-full bg-muted-foreground/30" />
              )}
            </button>
            <button
              className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left text-[13px]"
              onClick={() => setSelected(node.folder.id)}
            >
              <FolderIcon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate">{node.folder.name}</span>
              <Badge variant="muted" className="ml-auto shrink-0">
                {node.setCount}
              </Badge>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                  <Pencil className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => openRename(node)}>
                  <Pencil /> {t("Rename")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openCreate(node.folder.id)}>
                  <FolderPlus /> {t("New subfolder")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => void deleteFolder(node)}>
                  <Trash2 /> {t("Delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {open && kids.length > 0 && <div>{renderTree(node.folder.id, depth + 1)}</div>}
        </div>
      );
    });

  return (
    <div>
      <PageHeader
        title={t("Folders")}
        description={t("Group study sets into folders and subfolders.")}
        actions={
          <Button onClick={() => openCreate(null)}>
            <FolderPlus /> {t("New folder")}
          </Button>
        }
      />

      {loading ? (
        <LoadingPanel label={t("Loading folders")} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="flex h-fit flex-col p-2.5">
            <button
              onClick={() => setSelected(null)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] transition-colors",
                selected === null ? "bg-primary/10 text-primary" : "hover:bg-accent/50",
              )}
            >
              <Layers className="size-4" />
              <span className="flex-1">{t("All study sets")}</span>
              <Badge variant="muted">{sets.length}</Badge>
            </button>
            <div className="my-2 h-px bg-border" />
            {folders.length === 0 ? (
              <p className="px-2 py-4 text-center text-[12.5px] text-muted-foreground">
                {t("No folders yet.")}
              </p>
            ) : (
              <div className="space-y-0.5">{renderTree(null)}</div>
            )}
          </Card>

          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-semibold">
                  {selectedFolder ? selectedFolder.name : t("All study sets")}
                </h2>
                <p className="text-[12.5px] text-muted-foreground">
                  {selectedFolder
                    ? tp(totalInFolder(selectedFolder.id), "1 set in this tree", "{count} sets in this tree")
                    : tp(sets.length, "1 set across your library", "{count} sets across your library")}
                </p>
              </div>
              {selectedFolder && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openCreate(selectedFolder.id)}>
                    <FolderPlus /> {t("Subfolder")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openRename({ folder: selectedFolder, setCount: 0 })}>
                    <Pencil /> {t("Rename")}
                  </Button>
                </div>
              )}
            </div>

            {visibleSets.length === 0 ? (
              <EmptyState
                icon={FolderIcon}
                title={t("This folder is empty")}
                description={t("Move study sets here from the set card menu, or create a new one.")}
                action={
                  <Button variant="outline" onClick={() => navigate("/sets")}>
                    {t("Browse all sets")}
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {visibleSets.map((set) => (
                  <Card key={set.id} className="flex items-center gap-3 p-3">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => navigate(`/sets/${set.id}`)}
                    >
                      <div className="truncate text-[13.5px] font-medium">{set.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                        <span>{t("{count} cards", { count: set.cardCount })}</span>
                        <span>·</span>
                        <span>{set.lastStudiedAt ? formatRelative(set.lastStudiedAt) : t("not studied")}</span>
                      </div>
                    </button>
                    <Progress
                      value={set.cardCount ? (set.masteredCount / set.cardCount) * 100 : 0}
                      className="hidden w-24 sm:block"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <FolderInput />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>{t("Move to")}</DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={() =>
                            api.sets
                              .move(set.id, null)
                              .then(load)
                              .catch((error) => toast.error(errorMessage(error)))
                          }
                        >
                          {t("No folder")}
                        </DropdownMenuItem>
                        {folders.map((node) => (
                          <DropdownMenuItem
                            key={node.folder.id}
                            onSelect={() =>
                              api.sets
                                .move(set.id, node.folder.id)
                                .then(load)
                                .catch((error) => toast.error(errorMessage(error)))
                            }
                          >
                            {node.folder.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(dialogMode === "create" ? "New folder" : "Rename folder")}</DialogTitle>
            <DialogDescription>
              {t(
                dialogMode === "create" && parentId
                  ? "This folder will be created inside the selected folder."
                  : "Folders keep your library tidy and can be nested.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="folder-name">{t("Name")}</Label>
            <Input
              id="folder-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitDialog();
              }}
              placeholder={t("e.g. Semester 3")}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void submitDialog()} disabled={busy || !name.trim()}>
              {t(dialogMode === "create" ? "Create" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
