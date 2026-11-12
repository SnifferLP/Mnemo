import { Outlet, useLocation } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell() {
  const location = useLocation();

  return (
    <div className="app-canvas app-viewport flex w-full overflow-hidden">
      <Sidebar />
      <main className="relative min-w-0 flex-1 scroll-pb-6 overflow-y-auto">
        {/* At least one viewport tall, but free to grow with its content: pages
            can fill the shell without doing their own 100vh maths, and a page
            taller than the window still scrolls instead of being clipped. */}
        <div
          key={location.pathname}
          className="mx-auto flex min-h-full w-full max-w-[1360px] flex-col px-6 py-8 animate-fade-in lg:px-9 lg:py-10 xl:px-12"
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function FullBleedShell() {
  return (
    <div className="app-canvas app-viewport flex w-full overflow-hidden bg-background">
      <Outlet />
    </div>
  );
}
