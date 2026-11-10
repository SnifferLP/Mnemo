import { Outlet, useLocation } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell() {
  const location = useLocation();

  return (
    <div className="app-canvas flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <div
          key={location.pathname}
          className="mx-auto w-full max-w-[1320px] px-6 py-7 animate-fade-in lg:px-10 lg:py-9 xl:px-12"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function FullBleedShell() {
  return (
    <div className="app-canvas flex h-screen w-full overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}
