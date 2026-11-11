import { ArrowUpCircle, Download, Loader2, X } from "lucide-react";

import { useUpdates } from "@/context/UpdateContext";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";

export function UpdateNotice() {
  const { update, noticeOpen, installing, progress, stage, install, dismiss } = useUpdates();
  const { t } = useI18n();

  if (!noticeOpen || !update) return null;

  const status =
    stage === "installing" || stage === "finished"
      ? t("Installing update…")
      : t("Downloading update…");

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[80] w-[min(370px,calc(100vw-2.5rem))] animate-fade-in rounded-xl border border-primary/25 bg-card/95 p-4 shadow-[0_18px_55px_-18px_rgb(0_0_0/0.55)] backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ArrowUpCircle className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{t("Update available")}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("Mnemo {version} is available.", { version: update.version })}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("Dismiss update notification")}
          className="focus-ring -mr-1 -mt-1 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {update.notes && (
        <p className="mt-3 line-clamp-3 border-t border-border/70 pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          {update.notes}
        </p>
      )}

      {installing && (
        <div className="mt-3 space-y-1.5">
          <Progress value={progress ?? 0} />
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {status}
            {progress !== null && <span className="ml-auto tabular-nums">{progress}%</span>}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" onClick={() => void install()} disabled={installing}>
          {installing ? <Loader2 className="animate-spin" /> : <Download />}
          {installing ? t("Installing…") : t("Download and install")}
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss} disabled={installing}>
          {t("Later")}
        </Button>
      </div>
    </div>
  );
}
