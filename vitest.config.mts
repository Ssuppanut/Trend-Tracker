import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Resolve the "@/..." path alias (matches tsconfig paths) for tests.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
});
