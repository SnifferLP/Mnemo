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

import { useSettings } from "@/context/SettingsContext";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import type { UpdateCandidate, UpdateChannel, UpdateSupport } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

type UpdateCheckState = "idle" | "checking" | "up-to-date" | "available" | "error";

interface UpdateContextValue {
  support: UpdateSupport | null;
  checking: boolean;
  installing: boolean;
  progress: number | null;
  stage: string | null;
  update: UpdateCandidate | null;
  error: string | null;
  lastCheck: UpdateCheckState;
  noticeOpen: boolean;
  check: (manual?: boolean) => Promise<UpdateCandidate | null>;
  install: () => Promise<void>;
  dismiss: () => void;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const { settings, loading } = useSettings();
  const { t } = useI18n();

  const [support, setSupport] = useState<UpdateSupport | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateCandidate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<UpdateCheckState>("idle");
  const [noticeOpen, setNoticeOpen] = useState(false);

  const mounted = useRef(true);
  const initialized = useRef(false);
  const lastChannel = useRef(settings.updateChannel);
  const channelRef = useRef(settings.updateChannel);
  // Automatic checks are opt-out. A ref keeps the start-up flow on the value
  // that is current when the asynchronous support probe resolves.
  const autoCheckRef = useRef(settings.autoUpdateCheck);
  const inFlight = useRef<Promise<UpdateCandidate | null> | null>(null);
  const notified = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runCheck = useCallback(
    async (channel: UpdateChannel, manual = false): Promise<UpdateCandidate | null> => {
      // Never start a second request while one is in flight. If the user
      // switched channels meanwhile, discard the stale result and check again.
      if (inFlight.current) {
        await inFlight.current;
        if (channelRef.current !== channel) return runCheck(channel, manual);
        return update;
      }

      const task = (async () => {
        setChecking(true);
        setError(null);
        setLastCheck("checking");
        try {
          const candidate = await api.updates.check(channel);
          if (channelRef.current !== channel) return null;

          setUpdate(candidate);
          setLastCheck(candidate ? "available" : "up-to-date");

          if (candidate) {
            const key = candidate.version;
            if (!notified.current.has(key)) {
              notified.current.add(key);
              setNoticeOpen(true);
            }
            if (manual) {
              toast.success(t("Update available"), {
                description: t("Mnemo {version} is available.", { version: candidate.version }),
              });
            }
          } else {
            setNoticeOpen(false);
            if (manual) {
              toast.success(t("You're up to date"), {
                description: t("Mnemo {version} is the latest release on this channel.", {
                  version: support?.currentVersion ?? "",
                }),
              });
            }
          }
          return candidate;
        } catch (err) {
          const message = errorMessage(err);
          if (channelRef.current !== channel) return null;
          setError(message);
          setLastCheck("error");
          if (manual) {
            toast.error(t("Could not check for updates"), { description: message });
          }
          return null;
        } finally {
          if (mounted.current) setChecking(false);
          inFlight.current = null;
        }
      })();

      inFlight.current = task;
      return task;
    },
    [support?.currentVersion, t, update],
  );

  useEffect(() => {
    if (loading || initialized.current) return;
    initialized.current = true;
    channelRef.current = settings.updateChannel;
    lastChannel.current = settings.updateChannel;
    autoCheckRef.current = settings.autoUpdateCheck;

    api.updates
      .support()
      .then(async (info) => {
        setSupport(info);
        if (info.supported && autoCheckRef.current) {
          // Read the current channel, not the value captured when startup
          // began: the user may have switched it while the support call ran.
          await runCheck(channelRef.current, false);
        }
      })
      .catch(() => {
        // Startup must never be blocked or interrupted by update discovery.
      });
  }, [loading, runCheck, settings.autoUpdateCheck, settings.updateChannel]);

  useEffect(() => {
    if (loading || !initialized.current) return;
    if (lastChannel.current === settings.updateChannel) return;

    lastChannel.current = settings.updateChannel;
    channelRef.current = settings.updateChannel;
    setUpdate(null);
    setNoticeOpen(false);
    setError(null);
    setLastCheck("idle");

    // Switching channels is a background check as well, so it stays silent
    // while automatic checks are disabled. The manual button always works.
    if (support?.supported && settings.autoUpdateCheck) {
      void runCheck(settings.updateChannel, false);
    }
  }, [loading, runCheck, settings.autoUpdateCheck, settings.updateChannel, support?.supported]);

  const check = useCallback(
    (manual = true) => runCheck(settings.updateChannel, manual),
    [runCheck, settings.updateChannel],
  );

  const dismiss = useCallback(() => setNoticeOpen(false), []);

  const install = useCallback(async () => {
    if (!update || installing) return;
    setInstalling(true);
    setProgress(0);
    setStage("started");
    setError(null);

    try {
      const result = await api.updates.install(update.channel, update.version, (event) => {
        setStage(event.stage);
        if (event.contentLength && event.contentLength > 0) {
          setProgress(
            Math.max(0, Math.min(100, Math.round((event.downloaded / event.contentLength) * 100))),
          );
        } else if (event.stage === "installing" || event.stage === "finished") {
          setProgress(100);
        }
      });

      setNoticeOpen(false);
      setUpdate(null);
      setLastCheck("up-to-date");
      toast.success(t("Update installed"), {
        description: result.restartRequired
          ? t("Mnemo {version} will restart now.", { version: result.version })
          : t("Mnemo {version} has been installed.", { version: result.version }),
      });

      if (result.restartRequired) {
        window.setTimeout(() => {
          void api.updates.restart().catch(() => undefined);
        }, 900);
      }
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      setLastCheck("error");
      toast.error(t("Update failed"), {
        description: t("Your current installation is unchanged. {message}", { message }),
      });
    } finally {
      if (mounted.current) setInstalling(false);
    }
  }, [installing, t, update]);

  const value = useMemo(
    () => ({
      support,
      checking,
      installing,
      progress,
      stage,
      update,
      error,
      lastCheck,
      noticeOpen,
      check,
      install,
      dismiss,
    }),
    [
      support,
      checking,
      installing,
      progress,
      stage,
      update,
      error,
      lastCheck,
      noticeOpen,
      check,
      install,
      dismiss,
    ],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdates() {
  const context = useContext(UpdateContext);
  if (!context) throw new Error("useUpdates must be used inside UpdateProvider");
  return context;
}
