import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ runAnalyze: vi.fn() }));

vi.mock("@/lib/trends/analyze", () => ({ runAnalyze: h.runAnalyze }));

import { GET } from "./route";

const SECRET = "test-secret";

function request(auth?: string): Request {
  const headers = new Headers();
  if (auth) headers.set("authorization", auth);
  return new Request("http://localhost/api/cron/analyze", { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = SECRET;
});

describe("GET /api/cron/analyze", () => {
  it("returns 401 when the authorization header is missing", async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(h.runAnalyze).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret is wrong", async () => {
    const res = await GET(request("Bearer nope"));
    expect(res.status).toBe(401);
    expect(h.runAnalyze).not.toHaveBeenCalled();
  });

  it("runs analyze and returns its summary when authorized", async () => {
    h.runAnalyze.mockResolvedValue({
      durationMs: 5,
      embed: { candidates: 0, embedded: 0, skipped: true },
      itemsConsidered: 3,
      trendsCreated: 1,
      trendsUpdated: 0,
      itemsClustered: 2,
    });

    const res = await GET(request(`Bearer ${SECRET}`));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.trendsCreated).toBe(1);
    expect(body.itemsConsidered).toBe(3);
    expect(h.runAnalyze).toHaveBeenCalledOnce();
  });
});
