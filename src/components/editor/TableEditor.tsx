import { useState } from "react";
import { ClipboardPaste, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { CardInput, Flashcard } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/misc";

interface Row {
  key: string;
  front: string;
  back: string;
}

const newRow = (front = "", back = ""): Row => ({
  key: Math.random().toString(36).slice(2),
  front,
  back,
});

export function TableEditor({
  setId,
  onCreated,
}: {
  setId: string;
  onCreated: (cards: Flashcard[]) => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [paste, setPaste] = useState("");
  const [saving, setSaving] = useState(false);

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const parsePaste = () => {
    const lines = paste
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error(t("Paste some lines first"));
      return;
    }
    const parsed: Row[] = lines.map((line) => {
      const tab = line.indexOf("\t");
      const comma = line.indexOf(",");
      const splitAt = tab >= 0 ? tab : comma;
      if (splitAt < 0) return newRow(line, "");
      return newRow(line.slice(0, splitAt).trim(), line.slice(splitAt + 1).trim());
    });
    setRows((current) => [...current.filter((row) => row.front || row.back), ...parsed]);
    setPaste("");
    toast.success(t("Parsed {count} lines", { count: parsed.length }));
  };

  const save = async () => {
    const inputs: CardInput[] = rows
      .filter((row) => row.front.trim() && row.back.trim())
      .map((row) => ({ front: row.front.trim(), back: row.back.trim() }));
    if (inputs.length === 0) {
      toast.error(t("Add at least one complete row"));
      return;
    }
    setSaving(true);
    try {
      const created = await api.cards.bulkCreate(setId, inputs);
      onCreated(created);
      setRows([newRow(), newRow(), newRow()]);
      toast.success(t("{count} cards added", { count: created.length }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_40px] gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>{t("Front")}</span>
          <span>{t("Back")}</span>
          <span />
        </div>
        <div className="max-h-[520px] divide-y divide-border/50 overflow-y-auto">
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[1fr_1fr_40px] items-start gap-2 px-3 py-1.5">
              <Input
                value={row.front}
                onChange={(event) => updateRow(row.key, { front: event.target.value })}
                placeholder={t("Term")}
                className="h-9 border-transparent bg-transparent text-[13px] shadow-none hover:border-input focus-visible:border-ring/60"
              />
              <Input
                value={row.back}
                onChange={(event) => updateRow(row.key, { back: event.target.value })}
                placeholder={t("Definition")}
                className="h-9 border-transparent bg-transparent text-[13px] shadow-none hover:border-input focus-visible:border-ring/60"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setRows((current) => [...current, newRow()])}>
            <Plus /> {t("Row")}
          </Button>
          <Button size="sm" className="ml-auto" onClick={() => void save()} disabled={saving}>
            <Save /> {saving ? t("Saving…") : t("Save rows")}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <Label>{t("Paste tab-separated terms")}</Label>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          {t("One pair per line — tab or comma separated. Quizlet exports work as-is.")}
        </p>
        <Textarea
          value={paste}
          onChange={(event) => setPaste(event.target.value)}
          placeholder={"Haus\tHouse\nBaum\tTree"}
          className="min-h-[180px] font-mono text-[12px]"
        />
        <Button variant="outline" onClick={parsePaste}>
          <ClipboardPaste /> {t("Parse into rows")}
        </Button>
      </Card>
    </div>
  );
}
