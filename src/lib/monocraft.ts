import { normalizeTerm } from "./duplicates";

/**
 * Secret font unlock.
 *
 * The rule lives here so it can be tested without rendering the editor: a
 * brand-new study set called "Minecraft" that has no cards yet unlocks the
 * font. Imports and AI-generated sets always arrive with cards, and renaming
 * an existing set never runs this check.
 */
export const MONOCRAFT_SEED_NAME = "minecraft";

export function isMonocraftSeed(title: string, cardCount: number): boolean {
  if (cardCount !== 0) return false;
  return normalizeTerm(title) === MONOCRAFT_SEED_NAME;
}
