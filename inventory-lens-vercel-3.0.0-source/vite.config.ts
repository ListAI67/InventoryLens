import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: resolve(projectRoot, "index.html"),
        popup: resolve(projectRoot, "popup.html"),
        background: resolve(projectRoot, "src/background.ts"),
        content: resolve(projectRoot, "src/content.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "background" || chunk.name === "content"
            ? "[name].js"
            : "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: { reporter: ["text"] },
  },
});
