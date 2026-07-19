import react from "@vitejs/plugin-react";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

function copyWebIcons(): Plugin {
  return {
    name: "inventory-lens-web-icons",
    async closeBundle() {
      const destination = resolve(projectRoot, "dist-web", "icons");
      await mkdir(destination, { recursive: true });
      await cp(resolve(projectRoot, "public", "icons"), destination, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copyWebIcons()],
  publicDir: false,
  resolve: {
    alias: [
      {
        find: "./lib/local-data",
        replacement: resolve(projectRoot, "src", "lib", "local-data.web.ts"),
      },
    ],
  },
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(projectRoot, "index.html"),
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
