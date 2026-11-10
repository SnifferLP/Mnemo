import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell, FullBleedShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/Dashboard";
import { SetsPage } from "@/pages/SetsPage";
import { SetDetailPage } from "@/pages/SetDetailPage";
import { SetEditorPage } from "@/pages/SetEditorPage";
import { FoldersPage } from "@/pages/FoldersPage";
import { CreatePage } from "@/pages/CreatePage";
import { AssistantPage } from "@/pages/AssistantPage";
import { MagicNotesPage } from "@/pages/MagicNotesPage";
import { StatisticsPage } from "@/pages/StatisticsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { StudySessionPage } from "@/pages/study/StudySessionPage";
import { TestPage } from "@/pages/study/TestPage";
import { MatchingPage } from "@/pages/study/MatchingPage";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

function AppToaster() {
  const { settings } = useSettings();
  return (
    <Toaster
      theme={settings.theme === "system" ? "system" : settings.theme}
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{ className: "text-[13px]" }}
    />
  );
}

function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="text-[44px] font-semibold tracking-tight text-gradient">404</div>
      <h1 className="text-lg font-semibold">{t("This page does not exist")}</h1>
      <p className="max-w-sm text-[13px] text-muted-foreground">
        {t("The view you were looking for may have been moved or removed.")}
      </p>
      <Button onClick={() => window.location.assign("#/")}>{t("Back to dashboard")}</Button>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <SettingsProvider>
        <TooltipProvider delayDuration={250}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/sets" element={<SetsPage />} />
              <Route path="/sets/:id" element={<SetDetailPage />} />
              <Route path="/sets/:id/edit" element={<SetEditorPage />} />
              <Route path="/folders" element={<FoldersPage />} />
              <Route path="/create" element={<CreatePage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/magic-notes" element={<MagicNotesPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/study" element={<Navigate to="/sets" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route element={<FullBleedShell />}>
              <Route path="/sets/:id/study/test" element={<TestPage />} />
              <Route path="/sets/:id/study/matching" element={<MatchingPage />} />
              <Route path="/sets/:id/study/:mode" element={<StudySessionPage />} />
            </Route>
          </Routes>
          <AppToaster />
        </TooltipProvider>
      </SettingsProvider>
    </HashRouter>
  );
}
