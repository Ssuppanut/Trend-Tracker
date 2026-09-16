import { describe, expect, it } from "vitest";

import { buildTrends } from "./index";
import type { ClusterItem } from "./types";

const NOW = new Date("2026-09-15T12:00:00.000Z").getTime();
const HOUR = 3_600_000;

let nextId = 1;
function item(
  embedding: number[],
  hoursAgo: number,
  over: Partial<ClusterItem> = {},
): ClusterItem {
  return {
    id: over.id ?? nextId++,
    embedding,
    source: over.source ?? "rss",
    engagement: over.engagement ?? 50,
    publishedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    lang: over.lang ?? "en",
    categoryHint: over.categoryHint ?? "tech-ai",
    title: over.title ?? "t",
  };
}

describe("buildTrends", () => {
  it("drops clusters below the minimum size", () => {
    const trends = buildTrends(
      [
        item([1, 0], 1),
        item([0.99, 0.01], 1), // pair -> trend
        item([0, 1], 1), // singleton -> dropped
      ],
      { now: NOW, minClusterSize: 2, threshold: 0.6 },
    );
    expect(trends).toHaveLength(1);
    expect(trends[0].cluster.items).toHaveLength(2);
  });

  it("sorts trends by score, highest first", () => {
    const trends = buildTrends(
      [
        // strong, fresh, high engagement, two sources
        item([1, 0], 0.5, { engagement: 95, source: "rss" }),
        item([0.99, 0.01], 1, { engagement: 90, source: "hackernews" }),
        item([0.98, 0.02], 1.5, { engagement: 92, source: "rss" }),
        // weak, old, low engagement
        item([0, 1], 40, { engagement: 10 }),
        item([0.01, 0.99], 44, { engagement: 12 }),
      ],
      { now: NOW, minClusterSize: 2, threshold: 0.6 },
    );

    expect(trends).toHaveLength(2);
    expect(trends[0].metrics.score).toBeGreaterThan(trends[1].metrics.score);
    expect(trends[0].cluster.items).toHaveLength(3);
  });

  it("populates title, category and langScope for each trend", () => {
    const [trend] = buildTrends(
      [
        item([1, 0], 1, { engagement: 40, title: "lower", categoryHint: "crypto", lang: "en" }),
        item([0.99, 0.01], 1, { engagement: 88, title: "winner", categoryHint: "crypto", lang: "th" }),
      ],
      { now: NOW, minClusterSize: 2, threshold: 0.6 },
    );

    expect(trend.title).toBe("winner"); // highest engagement
    expect(trend.category).toBe("crypto");
    expect(trend.langScope).toBe("mixed"); // en + th
  });

  it("returns nothing when no cluster reaches the minimum size", () => {
    const trends = buildTrends([item([1, 0], 1), item([0, 1], 1)], {
      now: NOW,
      minClusterSize: 2,
      threshold: 0.6,
    });
    expect(trends).toEqual([]);
  });
});
