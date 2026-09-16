import { describe, expect, it } from "vitest";

import { assignToExistingTrends, clusterByEmbedding } from "./cluster";
import type { ClusterItem } from "./types";

let nextId = 1;
function item(embedding: number[], over: Partial<ClusterItem> = {}): ClusterItem {
  return {
    id: over.id ?? nextId++,
    embedding,
    source: over.source ?? "rss",
    engagement: over.engagement ?? 50,
    publishedAt: over.publishedAt ?? "2026-09-15T12:00:00.000Z",
    lang: over.lang ?? "en",
    categoryHint: over.categoryHint ?? "tech-ai",
    title: over.title ?? "t",
  };
}

describe("clusterByEmbedding", () => {
  it("separates two well-separated groups", () => {
    const items = [
      item([1, 0]),
      item([0.98, 0.02]),
      item([0, 1]),
      item([0.02, 0.98]),
    ];

    const clusters = clusterByEmbedding(items, { threshold: 0.6 });

    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.items.length).sort()).toEqual([2, 2]);
  });

  it("merges items above the threshold into one cluster", () => {
    const clusters = clusterByEmbedding(
      [item([1, 0]), item([0.99, 0.01]), item([0.97, 0.05])],
      { threshold: 0.6 },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].items).toHaveLength(3);
  });

  it("keeps dissimilar items in their own singleton clusters", () => {
    const clusters = clusterByEmbedding([item([1, 0]), item([0, 1])], {
      threshold: 0.6,
    });
    expect(clusters).toHaveLength(2);
  });

  it("keeps the centroid as the exact running mean", () => {
    // [2,1] and [2,3] are ~0.87 similar (merge) and average cleanly to [2,2].
    const clusters = clusterByEmbedding([item([2, 1]), item([2, 3])], {
      threshold: 0.6,
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].centroid).toEqual([2, 2]);
  });

  it("ignores items with an empty embedding", () => {
    const clusters = clusterByEmbedding([item([]), item([1, 0])], {
      threshold: 0.6,
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].items).toHaveLength(1);
  });

  it("is deterministic regardless of input order", () => {
    const a = item([1, 0], { id: 1 });
    const b = item([0.99, 0.01], { id: 2 });
    const c = item([0, 1], { id: 3 });
    const forward = clusterByEmbedding([a, b, c], { threshold: 0.6 });
    const reversed = clusterByEmbedding([c, b, a], { threshold: 0.6 });
    expect(forward.map((x) => x.items.length).sort()).toEqual(
      reversed.map((x) => x.items.length).sort(),
    );
  });
});

describe("assignToExistingTrends", () => {
  it("attaches items to the most similar existing trend above threshold", () => {
    const { assignments, residual } = assignToExistingTrends(
      [item([1, 0], { id: 1 }), item([0.97, 0.05], { id: 2 })],
      [
        { id: 100, centroid: [1, 0] },
        { id: 200, centroid: [0, 1] },
      ],
      0.6,
    );
    expect(residual).toHaveLength(0);
    expect(assignments.get(100)?.map((i) => i.id)).toEqual([1, 2]);
    expect(assignments.has(200)).toBe(false);
  });

  it("routes items below threshold to residual", () => {
    const { assignments, residual } = assignToExistingTrends(
      [item([0, 1], { id: 9 })],
      [{ id: 100, centroid: [1, 0] }],
      0.6,
    );
    expect(assignments.size).toBe(0);
    expect(residual.map((i) => i.id)).toEqual([9]);
  });

  it("treats everything as residual when there are no existing trends", () => {
    const items = [item([1, 0], { id: 1 }), item([0, 1], { id: 2 })];
    const { assignments, residual } = assignToExistingTrends(items, [], 0.6);
    expect(assignments.size).toBe(0);
    expect(residual).toHaveLength(2);
  });

  it("skips trends whose centroid dimension does not match", () => {
    const { residual } = assignToExistingTrends(
      [item([1, 0], { id: 1 })],
      [{ id: 100, centroid: [1, 0, 0] }],
      0.6,
    );
    expect(residual.map((i) => i.id)).toEqual([1]);
  });
});
