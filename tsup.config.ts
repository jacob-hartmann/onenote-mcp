import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
