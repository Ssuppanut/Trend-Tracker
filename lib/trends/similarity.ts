/**
 * Vector math for clustering. Pure, dependency-free, deterministic.
 */

/**
 * Cosine similarity of two equal-length vectors, in [-1, 1].
 * Returns 0 when either vector has zero magnitude (undefined direction).
 * Throws on a length mismatch — that's a programming error, not data.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: length mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Component-wise mean of one or more equal-length vectors (a centroid).
 * Throws on empty input or a length mismatch.
 */
export function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error("meanVector: no vectors");
  const dims = vectors[0].length;
  const sum = new Array<number>(dims).fill(0);
  for (const v of vectors) {
    if (v.length !== dims) {
      throw new Error(`meanVector: length mismatch ${v.length} vs ${dims}`);
    }
    for (let d = 0; d < dims; d++) sum[d] += v[d];
  }
  return sum.map((s) => s / vectors.length);
}
