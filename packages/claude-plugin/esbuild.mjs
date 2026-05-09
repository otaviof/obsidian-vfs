import * as esbuild from "esbuild";

const common = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: false,
  tsconfigRaw: "{}",
};

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: ["src/hook-handler.ts"],
    outfile: "bundle/hook-handler.mjs",
  }),
  esbuild.build({
    ...common,
    entryPoints: ["src/entry-expansion.ts"],
    outfile: "bundle/entry-expansion.mjs",
  }),
  esbuild.build({
    ...common,
    entryPoints: ["src/entry-subagent.ts"],
    outfile: "bundle/entry-subagent.mjs",
  }),
]);
