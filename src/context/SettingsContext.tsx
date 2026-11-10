import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  resolveTheme,
} from "@/lib/settings";
import type { AppSettings } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { translate } from "@/i18n/core";

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyTheme(theme: AppSettings["theme"]) {
  const root = document.documentElement;
  const dark = resolveTheme(theme) === "dark";
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  // Always merge patches into the latest known settings, even when React has
  // not re-rendered yet. This is what keeps accent changes from resetting the
  // theme (and vice versa) in the saved request.
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);

  const applyLoaded = useCallback((loaded: AppSettings) => {
    settingsRef.current = loaded;
    setSettings(loaded);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const loaded = await api.settings.get();
      applyLoaded(loaded);
    } catch (error) {
      toast.error(translate(settingsRef.current.language, "Could not load settings"), {
        description: errorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [applyLoaded]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.documentElement.dataset.accent = settings.accent;
  }, [settings.accent]);

  useEffect(() => {
    document.documentElement.dataset.displayFont = settings.displayFont;
  }, [settings.displayFont]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.dataset.language = settings.language;
  }, [settings.language]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", !settings.animations);
  }, [settings.animations]);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [settings.theme]);

  const update = useCallback(
    async (patch: Partial<AppSettings>) => {
      const next = mergeSettings(settingsRef.current, patch);
      settingsRef.current = next;
      setSettings(next);
      try {
        const saved = await api.settings.save(next);
        applyLoaded(saved);
      } catch (error) {
        toast.error(translate(settingsRef.current.language, "Settings were not saved"), {
          description: errorMessage(error),
        });
        void refresh();
      }
    },
    [applyLoaded, refresh],
  );

  const value = useMemo(
    () => ({ settings, loading, update, refresh }),
    [settings, loading, update, refresh],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
