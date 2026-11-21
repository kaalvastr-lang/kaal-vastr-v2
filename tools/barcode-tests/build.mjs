import { build } from "esbuild";
const src = "/home/claude/kaal-vastr-v2/src/lib/kv/barcode";
await build({
  entryPoints: { code128: `${src}/code128.ts`, label: `${src}/label.ts`, scanner: `${src}/scanner.ts`, settings: `${src}/settings.ts` },
  bundle: true, format: "esm", platform: "node", outdir: "out", logLevel: "error",

});
await build({ entryPoints: { billing: "/home/claude/kaal-vastr-v2/src/lib/kv/barcode/billing.ts" }, bundle: true, format: "esm", platform: "node", outdir: "out", logLevel: "error" });
