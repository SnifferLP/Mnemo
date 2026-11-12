import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Moon,
  Monitor,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type {
  AiProviderInfo,
  AppInfo,
  DisplayFont,
  Language,
  ProviderPreset,
  SaveProviderInput,
} from "@/lib/types";
import { cn, errorMessage, todayIso } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import { useUpdates } from "@/context/UpdateContext";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label, Progress, Separator, Slider } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const DISPLAY_FONTS = [
  {
    value: "modern",
    label: "Modern Sans",
    description: "A sturdier, highly readable sans for maximum clarity.",
    family: "var(--font-modern)",
    weight: 500,
  },
  {
    value: "editorial",
    label: "Editorial Serif",
    description: "The current editorial serif with fine, expressive strokes.",
    family: "var(--font-serif)",
    weight: 400,
  },
] as const;

// Only offered once the hidden unlock has happened; see lib/monocraft.ts.
const MONOCRAFT_FONT = {
  value: "monocraft" as DisplayFont,
  label: "Monocraft",
  description: "The monospaced font for developers who like Minecraft a bit too much.",
  family: "var(--font-monocraft)",
  weight: 400,
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
] as const satisfies readonly { value: Language; label: string }[];

const REPOSITORY_URL = "https://github.com/SnifferLP/Mnemo";

const ACCENTS = [
  { id: "ember", label: "Ember", color: "oklch(0.545 0.155 42)" },
  { id: "violet", label: "Violet", color: "oklch(0.512 0.168 296)" },
  { id: "blue", label: "Blue", color: "oklch(0.492 0.188 266)" },
  { id: "teal", label: "Teal", color: "oklch(0.512 0.088 190)" },
  { id: "rose", label: "Rose", color: "oklch(0.535 0.178 12)" },
  { id: "amber", label: "Amber", color: "oklch(0.548 0.122 72)" },
];

interface ProviderForm {
  id: string | null;
  name: string;
  kind: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  isDefault: boolean;
}

const EMPTY_FORM: ProviderForm = {
  id: null,
  name: "",
  kind: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  apiKey: "",
  temperature: 0.7,
  isDefault: false,
};

function ProviderDialog({
  open: isOpen,
  onOpenChange,
  presets,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  presets: ProviderPreset[];
  editing: AiProviderInfo | null;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setModels([]);
    if (editing) {
      setForm({
        id: editing.id,
        name: editing.name,
        kind: editing.kind,
        baseUrl: editing.baseUrl,
        model: editing.model,
        apiKey: "",
        temperature: editing.temperature,
        isDefault: editing.isDefault,
      });
    } else {
      const preset = presets[0];
      setForm(
        preset
          ? {
              ...EMPTY_FORM,
              kind: preset.kind,
              name: preset.label,
              baseUrl: preset.baseUrl,
              model: preset.model,
            }
          : EMPTY_FORM,
      );
    }
  }, [isOpen, editing, presets]);

  const preset = presets.find((item) => item.kind === form.kind);

  const applyKind = (kind: string) => {
    const next = presets.find((item) => item.kind === kind);
    setModels([]);
    setForm((current) => ({
      ...current,
      kind,
      baseUrl: next?.baseUrl ?? current.baseUrl,
      model: next?.model ?? current.model,
      name: current.id ? current.name : (next?.label ?? current.name),
    }));
  };

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      // A newly typed key takes precedence over the stored one.
      const list = await api.ai.models(
        form.apiKey.trim() ? null : form.id,
        form.kind,
        form.baseUrl,
        form.apiKey.trim() || null,
      );
      setModels(list);
      if (list.length > 0 && !list.includes(form.model)) {
        setForm((current) => ({ ...current, model: list[0] }));
      }
      toast.success(
        list.length === 0
          ? t("The provider returned no chat models")
          : t("Loaded {count} models", { count: list.length }),
      );
    } catch (error) {
      toast.error(t("Could not load models"), { description: errorMessage(error) });
    } finally {
      setLoadingModels(false);
    }
  };

  const submit = async () => {
    if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim()) {
      toast.error(t("Name, API URL and model are required"));
      return;
    }
    setSaving(true);
    try {
      const input: SaveProviderInput = {
        id: form.id,
        name: form.name.trim(),
        kind: form.kind,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim(),
        apiKey: form.apiKey.trim() ? form.apiKey.trim() : null,
        temperature: form.temperature,
        isDefault: form.isDefault,
      };
      await api.ai.saveProvider(input);
      toast.success(t(form.id ? "Provider updated" : "Provider connected"));
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(t("Could not save the provider"), { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(form.id ? "Edit provider" : "Connect an AI provider")}</DialogTitle>
          <DialogDescription>
            {t(
              "Use Google Gemini or any OpenAI-compatible endpoint. Keys are encrypted at rest and only decrypted in the Rust backend when a request is sent.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label>{t("Provider type")}</Label>
            <Select value={form.kind} onValueChange={applyKind}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((item) => (
                  <SelectItem key={item.kind} value={item.kind}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset?.note && <p className="text-[11px] text-muted-foreground">{preset.note}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="provider-name">{t("Display name")}</Label>
              <Input
                id="provider-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="provider-model">{t("Model")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-1.5 text-[11px]"
                  onClick={() => void loadModels()}
                  disabled={loadingModels || !form.baseUrl.trim()}
                >
                  {loadingModels ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {t("Load models")}
                </Button>
              </div>
              {models.length > 0 ? (
                <Select
                  value={form.model}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, model: value }))
                  }
                >
                  <SelectTrigger id="provider-model">
                    <SelectValue placeholder={t("Choose a model")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {models.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="provider-model"
                  value={form.model}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, model: event.target.value }))
                  }
                  placeholder={form.kind === "gemini" ? "gemini-3.8-flash" : "gpt-4o-mini"}
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                {t("Fetch the provider's model list, or type a model name manually.")}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-url">{t("API base URL")}</Label>
            <Input
              id="provider-url"
              value={form.baseUrl}
              onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-[12.5px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="provider-key">
              {t("API key")}{" "}
              {editing?.hasApiKey && <span className="text-success">· {t("already stored")}</span>}
            </Label>
            <Input
              id="provider-key"
              type="password"
              value={form.apiKey}
              onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              placeholder={
                t(
                  editing?.hasApiKey
                    ? "Leave blank to keep the saved key"
                    : preset?.needsKey
                      ? "Paste your API key"
                      : "Not required for local models",
                )
              }
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Stored encrypted with AES-256-GCM in your local app data. It never reaches the frontend or the logs.",
              )}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>{t("Temperature")}</Label>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {form.temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[form.temperature]}
              min={0}
              max={2}
              step={0.1}
              onValueChange={([value]) => setForm((current) => ({ ...current, temperature: value }))}
            />
          </div>

          <label className="flex items-center justify-between rounded-xl bg-secondary/50 p-4">
            <div>
              <div className="text-[13px] font-medium">{t("Use as default")}</div>
              <div className="text-[11.5px] text-muted-foreground">
                {t("New chats and generators use this provider")}
              </div>
            </div>
            <Switch
              checked={form.isDefault}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, isDefault: checked }))}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {t(form.id ? "Save changes" : "Connect provider")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsPage() {
  const { settings, loading, update } = useSettings();
  const updates = useUpdates();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const section = params.get("section");
  const [tab, setTab] = useState(
    section === "ai" ? "ai" : section === "updates" ? "updates" : "general",
  );

  const [profile, setProfile] = useState({
    displayName: "",
    dailyGoal: 30,
    dailyGoalMinutes: 20,
    newCardsPerSession: 20,
  });
  const [profileReady, setProfileReady] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AiProviderInfo | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [info, setInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || profileReady) return;
    setProfile({
      displayName: settings.displayName,
      dailyGoal: settings.dailyGoal,
      dailyGoalMinutes: settings.dailyGoalMinutes,
      newCardsPerSession: settings.newCardsPerSession,
    });
    setProfileReady(true);
  }, [loading, profileReady, settings]);

  const loadProviders = useCallback(async () => {
    try {
      const [list, presetList] = await Promise.all([api.ai.providers(), api.ai.presets()]);
      setProviders(list);
      setPresets(presetList);
    } catch (error) {
      toast.error(t("Could not load AI providers"), { description: errorMessage(error) });
    }
  }, [t]);

  useEffect(() => {
    void loadProviders();
    api.appInfo().then(setInfo).catch(() => undefined);
  }, [loadProviders]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await update({
        displayName: profile.displayName.trim(),
        dailyGoal: Math.max(1, Number(profile.dailyGoal) || 1),
        dailyGoalMinutes: Math.max(1, Number(profile.dailyGoalMinutes) || 1),
        newCardsPerSession: Math.max(0, Number(profile.newCardsPerSession) || 0),
      });
      toast.success(t("Preferences saved"));
    } finally {
      setSavingProfile(false);
    }
  };

  const testProvider = async (provider: AiProviderInfo) => {
    setTestingId(provider.id);
    try {
      const reply = await api.ai.testProvider(provider.id);
      toast.success(t("Provider responded"), {
        description: reply.slice(0, 140) || t("Connection established."),
      });
    } catch (error) {
      toast.error(t("Provider test failed"), { description: errorMessage(error) });
    } finally {
      setTestingId(null);
    }
  };

  const deleteProvider = async (provider: AiProviderInfo) => {
    if (
      !window.confirm(
        t('Remove the provider "{name}"? The stored API key is deleted.', {
          name: provider.name,
        }),
      )
    ) {
      return;
    }
    try {
      await api.ai.deleteProvider(provider.id);
      toast.success(t("Provider removed"));
      await loadProviders();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const makeDefault = async (provider: AiProviderInfo) => {
    try {
      await api.ai.setDefault(provider.id);
      await loadProviders();
      toast.success(t("{name} is now the default", { name: provider.name }));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const backup = async () => {
    try {
      const target = await save({
        defaultPath: `mnemo-backup-${todayIso()}.db`,
        filters: [{ name: "Mnemo database", extensions: ["db", "sqlite"] }],
      });
      if (!target) return;
      setBusy(true);
      const path = await api.transfer.backup(target);
      toast.success(t("Backup written"), { description: path });
    } catch (error) {
      toast.error(t("Backup failed"), { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    try {
      const source = await open({
        multiple: false,
        filters: [{ name: "Mnemo database", extensions: ["db", "sqlite"] }],
      });
      if (typeof source !== "string") return;
      if (
        !window.confirm(
          t("Restoring replaces your current library with the selected backup. Continue?"),
        )
      ) {
        return;
      }
      setBusy(true);
      await api.transfer.restore(source);
      toast.success(t("Backup restored — reloading"));
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      toast.error(t("Restore failed"), { description: errorMessage(error) });
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t("Settings")}
        title={t("Make Mnemo yours")}
        description={t(
          "Appearance, learning behaviour, AI providers and local data — all stored on this machine.",
        )}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general">
            <Palette /> {t("General")}
          </TabsTrigger>
          <TabsTrigger value="learning">
            <Zap /> {t("Learning")}
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles /> {t("AI providers")}
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database /> {t("Data")}
          </TabsTrigger>
          <TabsTrigger value="updates">
            <RefreshCw /> {t("Updates")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("Appearance")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>{t("Display font")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(settings.monocraftUnlocked
                      ? [...DISPLAY_FONTS, MONOCRAFT_FONT]
                      : DISPLAY_FONTS
                    ).map((font) => {
                      const active = settings.displayFont === font.value;
                      return (
                        <button
                          key={font.value}
                          onClick={() => void update({ displayFont: font.value })}
                          className={cn(
                            "flex flex-col items-start gap-1.5 rounded-xl p-3.5 text-left transition-colors",
                            active
                              ? "bg-primary-soft text-primary"
                              : "bg-secondary/50 hover:bg-secondary/80",
                          )}
                        >
                          <span
                            className={cn(
                              "display text-[26px] leading-none",
                              active ? "text-primary" : "text-foreground",
                            )}
                            style={{ fontFamily: font.family, fontWeight: font.weight }}
                          >
                            Aa
                          </span>
                          <span className="mt-1 text-[12px] font-medium">{t(font.label)}</span>
                          <span className="text-[10.5px] leading-snug text-muted-foreground">
                            {t(font.description)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t(
                      "Used for page headings, empty states and study set titles. The UI and code fonts stay unchanged.",
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">{t("Language")}</Label>
                  <Select
                    value={settings.language}
                    onValueChange={(value) => void update({ language: value as Language })}
                  >
                    <SelectTrigger id="language" aria-label={t("Language")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((language) => (
                        <SelectItem key={language.value} value={language.value}>
                          {t(language.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t(
                      "Changes the interface immediately and is kept across restarts. Study content and AI responses are never translated; strings without a translation fall back to English.",
                    )}
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>{t("Theme")}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {THEMES.map((theme) => {
                      const Icon = theme.icon;
                      const active = settings.theme === theme.value;
                      return (
                        <button
                          key={theme.value}
                          onClick={() => void update({ theme: theme.value })}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-xl p-3.5 text-[12px] transition-colors",
                            active
                              ? "bg-primary-soft text-primary"
                              : "bg-secondary/50 text-muted-foreground hover:bg-secondary/80",
                          )}
                        >
                          <Icon className="size-4" />
                          {t(theme.label)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("Accent colour")}</Label>
                  <div className="flex items-center gap-2">
                    {ACCENTS.map((accent) => (
                      <button
                        key={accent.id}
                        onClick={() => void update({ accent: accent.id })}
                        className={cn(
                          "grid size-8 place-items-center rounded-full transition-transform hover:scale-110",
                          settings.accent === accent.id ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : "",
                        )}
                        title={t(accent.label)}
                        aria-label={t(accent.label)}
                      >
                        <span className="size-5 rounded-full" style={{ background: accent.color }} />
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium">{t("Animations")}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {t("Card flips, transitions and motion")}
                    </div>
                  </div>
                  <Switch
                    checked={settings.animations}
                    onCheckedChange={(checked) => void update({ animations: checked })}
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium">{t("Collapsed sidebar")}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {t("Show icons only for more room")}
                    </div>
                  </div>
                  <Switch
                    checked={settings.sidebarCollapsed}
                    onCheckedChange={(checked) => void update({ sidebarCollapsed: checked })}
                  />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Profile & goals")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="display-name">{t("Display name")}</Label>
                  <Input
                    id="display-name"
                    value={profile.displayName}
                    onChange={(event) =>
                      setProfile((current) => ({ ...current, displayName: event.target.value }))
                    }
                    placeholder={t("What should the dashboard call you?")}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="goal-cards">{t("Daily review goal")}</Label>
                    <Input
                      id="goal-cards"
                      type="number"
                      min={1}
                      max={500}
                      value={profile.dailyGoal}
                      onChange={(event) =>
                        setProfile((current) => ({ ...current, dailyGoal: Number(event.target.value) }))
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">{t("cards per day")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="goal-minutes">{t("Daily study minutes")}</Label>
                    <Input
                      id="goal-minutes"
                      type="number"
                      min={1}
                      max={600}
                      value={profile.dailyGoalMinutes}
                      onChange={(event) =>
                        setProfile((current) => ({
                          ...current,
                          dailyGoalMinutes: Number(event.target.value),
                        }))
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">{t("target time")}</p>
                  </div>
                </div>

                <Button onClick={() => void saveProfile()} disabled={savingProfile || loading}>
                  {savingProfile ? <Loader2 className="animate-spin" /> : <Save />} {t("Save preferences")}
                </Button>

                <div className="rounded-xl bg-secondary/60 p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  {t(
                    "No account, no sign-in and no telemetry. Your name is only used for the greeting on the dashboard.",
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="learning">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("Answer checking")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>{t("Spelling tolerance")}</Label>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {t("{count} {unit}", {
                        count: settings.answerTolerance,
                        unit: t(settings.answerTolerance === 1 ? "edit" : "edits"),
                      })}
                    </span>
                  </div>
                  <Slider
                    value={[settings.answerTolerance]}
                    min={0}
                    max={3}
                    step={1}
                    onValueChange={([value]) => void update({ answerTolerance: value })}
                    className="mt-1"
                  />
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    {t("Levenshtein distance allowed for typed answers in writing and tests.")}
                  </p>
                </div>

                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium">{t("Case-sensitive answers")}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {t("Off means “House” and “house” both count")}
                    </div>
                  </div>
                  <Switch
                    checked={settings.answerCaseSensitive}
                    onCheckedChange={(checked) => void update({ answerCaseSensitive: checked })}
                  />
                </label>

                <Separator />

                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium">{t("AI semantic grading")}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {t("Ask the provider whether a typed answer means the same thing")}
                    </div>
                  </div>
                  <Switch
                    checked={settings.aiGradingEnabled}
                    onCheckedChange={(checked) => void update({ aiGradingEnabled: checked })}
                  />
                </label>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {t(
                    "AI grading sends the card and your answer to the selected provider. It is only used in writing mode and never automatically.",
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Session behaviour")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="new-cards">{t("New cards per session")}</Label>
                  <Input
                    id="new-cards"
                    type="number"
                    min={0}
                    max={200}
                    value={profile.newCardsPerSession}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        newCardsPerSession: Number(event.target.value),
                      }))
                    }
                  />
                  <p className="text-[11.5px] text-muted-foreground">
                    {t("Used when the adaptive queue is limited. 0 means no limit.")}
                  </p>
                </div>

                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium">{t("Shuffle flashcard sessions")}</div>
                    <div className="text-[11.5px] text-muted-foreground">
                      {t("Randomise order instead of following the editor")}
                    </div>
                  </div>
                  <Switch
                    checked={settings.shuffleCards}
                    onCheckedChange={(checked) => void update({ shuffleCards: checked })}
                  />
                </label>

                <Separator />

                <div className="space-y-2 text-[12px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {t("Spaced repetition uses SM-2 with a 21-day mastery threshold.")}
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {t("Every mode records a study session for your statistics.")}
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-success" />
                    {t("Progress is written to SQLite immediately.")}
                  </div>
                </div>

                <Button onClick={() => void saveProfile()} disabled={savingProfile}>
                  <Save /> {t("Save session preferences")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>{t("Providers")}</CardTitle>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {t("One default provider is used unless you pick another.")}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus /> {t("Add provider")}
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {providers.length === 0 && (
                  <div className="rounded-xl bg-secondary/50 p-6 text-center">
                    <Server className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-2 text-[13px] font-medium">{t("No provider configured")}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      {t("Add OpenAI, OpenRouter, Mistral, a custom endpoint or local Ollama.")}
                    </p>
                  </div>
                )}

                {providers.map((provider) => (
                  <div
                    key={provider.id}
                    className={cn(
                      "rounded-xl p-4 transition-colors",
                      provider.isDefault ? "bg-primary-soft" : "bg-secondary/50",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                        <Server className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{provider.name}</span>
                          {provider.isDefault && (
                            <Badge variant="success">{t("Default")}</Badge>
                          )}
                          <Badge variant="outline">{provider.kind}</Badge>
                          {provider.hasApiKey ? (
                            <Badge variant="muted">{t("key stored")}</Badge>
                          ) : (
                            <Badge variant="warning">{t("no key")}</Badge>
                          )}
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {provider.baseUrl} · {provider.model}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => void testProvider(provider)}
                            disabled={testingId === provider.id}
                          >
                            {testingId === provider.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Zap />
                            )}
                            {t("Test")}
                          </Button>
                          {!provider.isDefault && (
                            <Button variant="ghost" size="xs" onClick={() => void makeDefault(provider)}>
                              {t("Make default")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setEditing(provider);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil /> {t("Edit")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void deleteProvider(provider)}
                          >
                            <Trash2 /> {t("Remove")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("AI context & limits")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    key: "aiShareSet" as const,
                    label: t("Share the selected study set"),
                    hint: t("Cards from the chosen set are sent as context"),
                    value: settings.aiShareSet,
                  },
                  {
                    key: "aiShareGaps" as const,
                    label: t("Share weak spots"),
                    hint: t("Include cards you get wrong most often"),
                    value: settings.aiShareGaps,
                  },
                  {
                    key: "aiShareHistory" as const,
                    label: t("Share chat history"),
                    hint: t("Let the tutor follow the conversation"),
                    value: settings.aiShareHistory,
                  },
                ].map((row) => (
                  <label key={row.key} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[13px] font-medium">{row.label}</div>
                      <div className="text-[11.5px] text-muted-foreground">{row.hint}</div>
                    </div>
                    <Switch
                      checked={row.value}
                      onCheckedChange={(checked) => void update({ [row.key]: checked })}
                    />
                  </label>
                ))}

                <Separator />

                <div>
                  <div className="flex items-center justify-between">
                    <Label>{t("Cards per AI batch")}</Label>
                    <span className="text-[12px] tabular-nums text-muted-foreground">
                      {settings.aiCardBatch}
                    </span>
                  </div>
                  <Slider
                    value={[settings.aiCardBatch]}
                    min={5}
                    max={40}
                    step={1}
                    onValueChange={([value]) => void update({ aiCardBatch: value })}
                    className="mt-1"
                  />
                </div>

                <div className="rounded-xl bg-secondary/60 p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mb-1 size-3.5 text-success" />
                  {t(
                    "API keys are encrypted with AES-256-GCM and decrypted only inside Rust when a request you started is sent. They are never exposed to the UI or logs.",
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="data">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("Local storage")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {info ? (
                  <div className="space-y-2.5 text-[12.5px]">
                    {[
                      { label: t("Version"), value: info.version },
                      { label: t("Database"), value: info.dbPath },
                      { label: t("Media"), value: info.mediaDir },
                      { label: t("App data"), value: info.dataDir },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {row.label}
                        </div>
                        <div className="break-all font-mono text-[11.5px]">{row.value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12.5px] text-muted-foreground">{t("Reading app information…")}</p>
                )}
                <div className="rounded-xl bg-secondary/60 p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  <Info className="mb-1 size-3.5" />
                  {t(
                    "Mnemo stores everything in a single SQLite database (WAL mode) plus a media folder. Nothing is synced or uploaded.",
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Backup & restore")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {t(
                    "A backup is a complete copy of the database: sets, cards, media references, progress, sessions and tests.",
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void backup()} disabled={busy}>
                    <Download /> {t("Create backup")}
                  </Button>
                  <Button variant="outline" onClick={() => void restore()} disabled={busy}>
                    <Upload /> {t("Restore backup")}
                  </Button>
                </div>
                <Separator />
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {t(
                    "Individual sets can be exported as CSV, TSV, JSON, Markdown or PDF from the set page. Import CSV, TSV, JSON and Quizlet text from My Study Sets.",
                  )}
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("Privacy")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    title: t("Offline first"),
                    text: t("Every study mode works without a connection. Only AI calls need the network."),
                  },
                  {
                    title: t("No telemetry"),
                    text: t("No analytics, crash reports or usage pings. Ever."),
                  },
                  {
                    title: t("Explicit actions"),
                    text: t("AI requests are only sent when you press a generate or send button."),
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl bg-secondary/50 p-3.5">
                    <div className="text-[12.5px] font-medium">{item.title}</div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                      {item.text}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="updates">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>{t("Updates")}</CardTitle>
                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {t(
                    "Choose how Mnemo looks for new versions. Nothing is installed without your confirmation.",
                  )}
                </p>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>{t("Update channel")}</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        value: "stable" as const,
                        label: t("Stable Releases"),
                        description: t("Only finished, non-pre-release versions."),
                      },
                      {
                        value: "prerelease" as const,
                        label: t("Pre-Releases"),
                        description: t("Includes beta and test releases as well as stable versions."),
                      },
                    ].map((channel) => {
                      const active = settings.updateChannel === channel.value;
                      return (
                        <button
                          key={channel.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => void update({ updateChannel: channel.value })}
                          className={cn(
                            "rounded-xl p-3.5 text-left transition-colors",
                            active
                              ? "bg-primary-soft text-primary"
                              : "bg-secondary/50 hover:bg-secondary/80",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-medium">{channel.label}</span>
                            {active && <Badge variant="success">{t("Selected")}</Badge>}
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            {channel.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {t(
                      "Changing the channel only affects future checks. Mnemo never switches channels for you.",
                    )}
                  </p>
                </div>

                <Separator />

                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-medium">
                      {t("Check for updates automatically")}
                    </div>
                    <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                      {t(
                        "Looks for new versions at startup and in the background. Manual checks stay available either way.",
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={settings.autoUpdateCheck}
                    onCheckedChange={(checked) => void update({ autoUpdateCheck: checked })}
                  />
                </label>

                <Separator />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {t("Installed version")}
                    </div>
                    <div className="mt-1 font-mono text-[12.5px]">
                      Mnemo {updates.support?.currentVersion ?? info?.version ?? "…"}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => void updates.check(true)}
                    disabled={
                      updates.checking ||
                      updates.installing ||
                      !updates.support?.supported
                    }
                  >
                    {updates.checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    {updates.checking ? t("Checking…") : t("Check for updates")}
                  </Button>
                </div>

                {!updates.support?.supported && updates.support?.message && (
                  <div className="rounded-xl bg-secondary/60 p-3.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    <Info className="mb-1 size-3.5" />
                    {updates.support.message}
                  </div>
                )}

                {updates.error && (
                  <div className="rounded-xl bg-destructive/[0.08] p-3.5 text-[11.5px] leading-relaxed text-destructive">
                    {updates.error}
                  </div>
                )}

                {updates.lastCheck === "up-to-date" && (
                  <div className="flex items-center gap-2 rounded-xl bg-success/[0.08] p-3.5 text-[12px] text-success">
                    <CheckCircle2 className="size-3.5" />
                    {t("You're up to date")}
                  </div>
                )}

                {updates.update && (
                  <div className="space-y-2 rounded-xl bg-primary-soft/70 p-3.5">
                    <div className="flex items-center gap-2 text-[12.5px] font-medium">
                      <Download className="size-3.5 text-primary" />
                      {t("Mnemo {version} is available.", { version: updates.update.version })}
                    </div>
                    {updates.update.notes && (
                      <p className="line-clamp-4 text-[11.5px] leading-relaxed text-muted-foreground">
                        {updates.update.notes}
                      </p>
                    )}
                    <Button size="sm" onClick={() => void updates.install()} disabled={updates.installing}>
                      {updates.installing ? <Loader2 className="animate-spin" /> : <Download />}
                      {updates.installing ? t("Installing…") : t("Download and install")}
                    </Button>
                  </div>
                )}

                {updates.installing && (
                  <div className="space-y-1.5">
                    <Progress value={updates.progress ?? 0} />
                    <p className="text-[11px] text-muted-foreground">
                      {updates.stage === "installing" || updates.stage === "finished"
                        ? t("Installing update…")
                        : t("Downloading update…")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="self-start">
              <CardHeader>
                <CardTitle>{t("Supported automatic updates")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-[12px] leading-relaxed text-muted-foreground">
                <p>
                  {t(
                    "Windows x64 installers and Linux x86_64 AppImages can update themselves. Debian packages and Arch packages are updated by their package manager.",
                  )}
                </p>
                <Separator />
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-foreground">
                    <ShieldCheck className="size-3.5 text-success" />
                    {t("Signed updates")}
                  </div>
                  <p>
                    {t(
                      "Every update is verified with Tauri's update signature before installation. Unsigned or tampered downloads are rejected.",
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3.5 text-[11.5px]">
                  {t(
                    "Update checks contact GitHub only. They never block startup, and a failed check leaves the current installation untouched.",
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-muted-foreground/70">
        <span>{t("Application")} · Mnemo {info?.version ?? "…"}</span>
        <button
          type="button"
          onClick={() =>
            void openUrl(REPOSITORY_URL).catch((error) =>
              toast.error(t("Could not open the repository"), {
                description: errorMessage(error),
              }),
            )
          }
          className="inline-flex items-center gap-1.5 normal-case tracking-normal transition-colors hover:text-foreground"
        >
          {t("View repository on GitHub")}
          <ExternalLink className="size-3" />
        </button>
      </div>

      <ProviderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        presets={presets}
        editing={editing}
        onSaved={() => void loadProviders()}
      />
    </div>
  );
}
