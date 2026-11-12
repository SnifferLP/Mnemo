import { describe, expect, it } from "vitest";

import { activityBarGap, activityLabelIndices } from "./chart";

describe("activity chart axis", () => {
  it("labels every day of a short range", () => {
    expect(activityLabelIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(activityLabelIndices(1)).toEqual([0]);
    expect(activityLabelIndices(0)).toEqual([]);
  });

  it("spreads about seven labels across a range and keeps both ends", () => {
    for (const count of [14, 30, 90, 365]) {
      const indices = activityLabelIndices(count);
      expect(indices.length).toBeGreaterThanOrEqual(6);
      expect(indices.length).toBeLessThanOrEqual(7);
      expect(indices[0]).toBe(0);
      expect(indices[indices.length - 1]).toBe(count - 1);
      for (let position = 1; position < indices.length; position += 1) {
        expect(indices[position]).toBeGreaterThan(indices[position - 1]);
      }
    }
  });

  it("never returns a label index outside the data", () => {
    for (const count of [2, 3, 5, 11, 60, 200, 730]) {
      for (const index of activityLabelIndices(count)) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(count);
      }
    }
  });

  it("narrows the gutters as the range grows so bars keep their width", () => {
    expect(activityBarGap(7)).toBe(3);
    expect(activityBarGap(30)).toBe(3);
    expect(activityBarGap(90)).toBe(3);
    expect(activityBarGap(180)).toBe(2);
    expect(activityBarGap(365)).toBe(1);
    expect(activityBarGap(0)).toBe(3);
  });
});
