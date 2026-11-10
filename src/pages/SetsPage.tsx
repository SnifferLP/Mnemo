import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { Library, Plus, Search, Star, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { FolderNode, StudySetSummary, Tag } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { EmptyState, LoadingPanel, PageHeader } from "@/components/common";
import { StudySetCard } from "@/components/StudySetCard";
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
import { Label } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SORTS = [
  { value: "recent", label: "Recently updated" },
  { value: "created", label: "Newest" },
  { value: "title", label: "Alphabetical" },
  { value: "studied", label: "Last studied" },
  { value: "cards", label: "Most cards" },
  { value: "progress", label: "Most mastered" },
];

export function SetsPage() {
  const navigate = useNavigate();
  const { t, tp } = useI18n();
  const [sets, setSets] = useState<StudySetSummary[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string>("all");
  const [tagId, setTagId] = useState<string>("all");
  const [sort, setSort] = useState("recent");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [setList, folderList, tagList] = await Promise.all([
        api.sets.list({
          query: search.trim() || null,
          folderId: folderId === "all" ? null : folderId,
          tagId: tagId === "all" ? null : tagId,
          favoritesOnly,
          sort,
        }),
        api.folders.list(),
        api.sets.tags(),
      ]);
      setSets(setList);
      setFolders(folderList);
      setTags(tagList);
    } catch (error) {
      toast.error(t("Could not load study sets"), { description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [search, folderId, tagId, favoritesOnly, sort, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const folderOptions = useMemo(
    () => folders.map((node) => ({ id: node.folder.id, name: node.folder.name })),
    [folders],
  );

  const createSet = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const created = await api.sets.create({ title: newTitle.trim() });
      toast.success(t("Study set created"));
      setCreating(false);
      setNewTitle("");
      navigate(`/sets/${created.set.id}/edit`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const importSet = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: t("Study sets"), extensions: ["csv", "tsv", "txt", "json", "md", "quizlet"] }],
      });
      if (typeof file !== "string") return;
      setImporting(true);
      const created = await api.transfer.importFile(file);
      toast.success(t("Imported {count} cards", { count: created.cards.length }));
      navigate(`/sets/${created.set.id}`);
    } catch (error) {
      toast.error(t("Import failed"), { description: errorMessage(error) });
    } finally {
      setImporting(false);
    }
  };

  const hasFilters = Boolean(search) || folderId !== "all" || tagId !== "all" || favoritesOnly;

  return (
    <div>
      <PageHeader
        title={t("My study sets")}
        description={t("Everything you are learning, organised in one place.")}
        actions={
          <>
            <Button variant="outline" onClick={() => void importSet()} disabled={importing}>
              <Upload /> {importing ? t("Importing…") : t("Import")}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> {t("New set")}
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2.5 border-y border-border py-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search titles, descriptions and cards…")}
            className="pl-9"
          />
        </div>

        <Tabs value={favoritesOnly ? "favorites" : "all"} onValueChange={(value) => setFavoritesOnly(value === "favorites")}>
          <TabsList>
            <TabsTrigger value="all">{t("All")}</TabsTrigger>
            <TabsTrigger value="favorites">
              <Star /> {t("Favorites")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={folderId} onValueChange={setFolderId}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("Folder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All folders")}</SelectItem>
            {folderOptions.map((folder) => (
              <SelectItem key={folder.id} value={folder.id}>
                {folder.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tagId} onValueChange={setTagId}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t("Tag")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All tags")}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                #{tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && sets.length === 0 && <LoadingPanel label={t("Loading study sets")} />}

      {!loading && sets.length === 0 && (
        <EmptyState
          icon={Library}
          title={t(hasFilters ? "No sets match these filters" : "Your library is empty")}
          description={t(
            hasFilters
              ? "Try a different search term, or clear the filters to see everything."
              : "Create a study set manually, import a CSV or Quizlet export, or generate cards from your notes.",
          )}
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFolderId("all");
                  setTagId("all");
                  setFavoritesOnly(false);
                }}
              >
                {t("Clear filters")}
              </Button>
            ) : (
              <Button onClick={() => setCreating(true)}>
                <Plus /> {t("Create your first set")}
              </Button>
            )
          }
        />
      )}

      <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4")}>
        {sets.map((set) => (
          <StudySetCard key={set.id} set={set} folders={folders} onChanged={load} />
        ))}
      </div>

      {sets.length > 0 && (
        <p className="mt-5 text-[12px] text-muted-foreground">
          {tp(sets.length, "1 set", "{count} sets")} ·{" "}
          {t("{count} cards total", {
            count: sets.reduce((sum, set) => sum + set.cardCount, 0),
          })}
        </p>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("New study set")}</DialogTitle>
            <DialogDescription>
              {t("Name the set now — you can add cards in the editor right after.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="set-title">{t("Title")}</Label>
            <Input
              id="set-title"
              autoFocus
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createSet();
              }}
              placeholder={t("e.g. Neuroanatomy — cranial nerves")}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={() => void createSet()} disabled={busy || !newTitle.trim()}>
              {t("Create set")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
