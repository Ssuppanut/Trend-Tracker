import { describe, expect, it } from "vitest";

import {
  pickCategory,
  pickLangScope,
  pickTitle,
  scoreCluster,
  TREND_WEIGHTS,
} from "./score";
import type { Cluster, ClusterItem } from "./types";

const NOW = new Date("2026-09-15T12:00:00.000Z").getTime();
const HOUR = 3_600_000;

let nextId = 1;
function aged(hours: number, over: Partial<ClusterItem> = {}): ClusterItem {
  return {
    id: over.id ?? nextId++,
    embedding: over.embedding ?? [1, 0],
    source: over.source ?? "rss",
    engagement: over.engagement ?? 50,
    publishedAt: new Date(NOW - hours * HOUR).toISOString(),
    lang: over.lang ?? "en",
    categoryHint: over.categoryHint ?? "tech-ai",
    title: over.title ?? "t",
  };
}

function cluster(items: ClusterItem[]): Cluster {
  return { items, centroid: [1, 0] };
}

describe("TREND_WEIGHTS", () => {
  it("sums to 1", () => {
    const total = Object.values(TREND_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });
});

describe("scoreCluster", () => {
  it("computes each component and the composite for a known cluster", () => {
    const m = scoreCluster(
      cluster([
        aged(0.5, { engagement: 80, source: "rss" }),
        aged(2, { engagement: 60, source: "hackernews" }),
        aged(30, { engagement: 40, source: "rss" }),
      ]),
      { now: NOW },
    );

    expect(m.volume24h).toBe(2); // two items < 24h
    expect(m.velocity).toBe(2); // 2 recent / 1 in the prev 24-48h window
    expect(m.sourceCount).toBe(2);
    expect(m.engagementSum).toBe(180);
    expect(m.status).toBe("active");

    expect(m.components.velocity).toBe(100); // ratio 2 -> capped
    expect(m.components.volume).toBe(10); // 2 / 20 * 100
    expect(m.components.engagement).toBe(60); // mean(80,60,40)
    expect(m.components.diversity).toBeCloseTo(66.6667, 3); // 2 / 3 * 100
    expect(m.components.recency).toBe(100); // newest 30 min old

    // 100*.3 + 10*.25 + 60*.2 + 66.667*.15 + 100*.1 = 64.5 -> 65
    expect(m.score).toBe(65);
  });

  it("marks a stale, non-accelerating cluster as fading", () => {
    const m = scoreCluster(cluster([aged(30), aged(36)]), { now: NOW });
    expect(m.volume24h).toBe(0);
    expect(m.velocity).toBeLessThan(1);
    expect(m.status).toBe("fading");
  });

  it("archives a cluster whose newest item is over a week old", () => {
    const m = scoreCluster(cluster([aged(24 * 8), aged(24 * 9)]), { now: NOW });
    expect(m.status).toBe("archived");
  });

  it("uses the prior 7d average as the velocity baseline when provided", () => {
    const m = scoreCluster(
      cluster([aged(1), aged(2), aged(3), aged(4)]), // 4 in last 24h
      { now: NOW, priorVolume7dAvg: 2 },
    );
    expect(m.volume24h).toBe(4);
    expect(m.velocity).toBe(2); // 4 / 2
  });
});

describe("pickCategory", () => {
  const it0 = (categoryHint: string | null) =>
    ({ categoryHint }) as ClusterItem;

  it("returns the majority hint", () => {
    expect(pickCategory([it0("tech-ai"), it0("tech-ai"), it0("news")])).toBe(
      "tech-ai",
    );
  });

  it("breaks ties by fixed precedence", () => {
    expect(pickCategory([it0("crypto"), it0("tech-ai")])).toBe("crypto");
  });

  it("falls back to 'news' when no item carries a hint", () => {
    expect(pickCategory([it0(null), it0(null)])).toBe("news");
  });
});

describe("pickLangScope", () => {
  const it0 = (lang: "th" | "en") => ({ lang }) as ClusterItem;
  it("returns the uniform lang", () => {
    expect(pickLangScope([it0("th"), it0("th")])).toBe("th");
  });
  it("returns 'mixed' when languages differ", () => {
    expect(pickLangScope([it0("th"), it0("en")])).toBe("mixed");
  });
});

describe("pickTitle", () => {
  it("picks the highest-engagement item's title", () => {
    expect(
      pickTitle([
        aged(1, { engagement: 30, title: "low" }),
        aged(1, { engagement: 90, title: "high" }),
      ]),
    ).toBe("high");
  });
});
