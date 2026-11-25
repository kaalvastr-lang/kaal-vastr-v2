import { build } from "esbuild";
const src = "/home/claude/kaal-vastr-v2/src";
await build({
  entryPoints: { payments: `${src}/lib/kv/payments.ts`, analytics: `${src}/lib/kv/analytics.ts` },
  bundle: true, format: "esm", platform: "node", outdir: "out", logLevel: "error",
  alias: { "@": src },
});
