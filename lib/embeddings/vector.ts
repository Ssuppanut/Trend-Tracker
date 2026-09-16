/**
 * pgvector <-> JS interop.
 *
 * PostgREST serializes a `vector` column as its text literal, e.g.
 * `"[0.1,0.2,0.3]"`, on read, and reliably accepts that same literal on write.
 * These helpers convert between that literal and a plain `number[]` so the rest
 * of the code can do vector math on arrays and never think about the wire form.
 */

/** Serialize a vector to the pgvector text literal `[a,b,c]` for writes. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/**
 * Parse a value read back from a `vector` column into `number[]`.
 * Accepts the pgvector literal string, an already-parsed array, or null.
 * Returns `null` for null / unparseable / non-array input, and only returns a
 * vector when every element is a finite number (guards against `NaN` sneaking
 * into similarity math).
 */
export function parseVector(value: unknown): number[] | null {
  if (value == null) return null;

  let arr: unknown;
  if (Array.isArray(value)) {
    arr = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      arr = JSON.parse(trimmed); // pgvector's "[...]" is valid JSON
    } catch {
      return null;
    }
  } else {
    return null;
  }

  if (!Array.isArray(arr) || arr.length === 0) return null;
  if (!arr.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return arr as number[];
}
