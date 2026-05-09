import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/hook-handler.ts"],
  bundle: true,
  outfile: "bundle/hook-handler.mjs",
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: false,
  tsconfigRaw: "{}",
});
