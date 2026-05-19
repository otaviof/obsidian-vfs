import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node22",
  mainFields: ["module", "main"],
  sourcemap: true,
  // tsc --noEmit handles type checking; esbuild only bundles. Inline config
  // avoids warnings from the root tsconfig's "target": "es2025" (which
  // esbuild doesn't recognize) leaking through the extends chain.
  tsconfigRaw: "{}",
});
