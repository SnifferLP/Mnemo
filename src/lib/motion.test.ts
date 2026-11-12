import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Motion is controlled by Settings → Animations, not by the operating system.
 *
 * WebView2 on Windows reports `prefers-reduced-motion: reduce` whenever the
 * Windows "Animation effects" setting is off, so a stylesheet rule keyed to
 * that media query silently removed every animation from the Windows build
 * while the Linux build kept them.
 */
const css = readFileSync(path.resolve(import.meta.dirname ?? ".", "../index.css"), "utf8");

describe("motion preferences", () => {
  it("never disables animations from the OS reduced-motion flag", () => {
    expect(css).not.toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  });

  it("disables animations only through the in-app switch", () => {
    expect(css).toMatch(/\.reduce-motion \*[\s\S]*?animation: none !important;/);
  });

  it("keeps the animation utilities the interface relies on", () => {
    for (const utility of ["animate-fade-in", "animate-scale-in", "animate-pop"]) {
      expect(css).toContain(`.${utility}`);
    }
    expect(css).toContain("@keyframes fade-in");
    expect(css).toContain("@keyframes pop");
  });
});
