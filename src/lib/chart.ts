/**
 * Position helpers for the learning-activity chart.
 *
 * The chart draws one column per day. Bars and date labels are rendered in two
 * rows that share the same column template, so these helpers only decide which
 * days get a label and how much space a column may take.
 */

/**
 * Evenly spaced label positions for a range of `count` days.
 *
 * Both ends are included so the axis covers the whole range instead of stopping
 * a few days short of the newest bar. Positions are rounded and de-duplicated,
 * so short ranges label every day and long ranges still fit about seven labels.
 */
export function activityLabelIndices(count: number, target = 7): number[] {
  if (count <= 0) return [];
  const labels = Math.max(1, Math.min(count, target));
  if (labels === 1 || count === labels) {
    return Array.from({ length: count }, (_, index) => index);
  }

  const step = (count - 1) / (labels - 1);
  const indices = new Set<number>();
  for (let position = 0; position < labels; position += 1) {
    indices.add(Math.round(position * step));
  }
  return [...indices].sort((a, b) => a - b);
}

/**
 * Gap between day columns in pixels.
 *
 * A year of bars needs narrower gutters than a fortnight, otherwise the gaps
 * alone would eat the available width and squeeze every bar to nothing.
 */
export function activityBarGap(count: number): number {
  if (count > 180) return 1;
  if (count > 90) return 2;
  return 3;
}
