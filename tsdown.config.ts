import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/browser.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  outDir: "dist",
});
