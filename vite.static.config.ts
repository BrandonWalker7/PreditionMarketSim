import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/** Strip crossorigin from built index.html so Safari applies CSS without CORS. */
function stripCrossorigin(): Plugin {
  return {
    name: "strip-crossorigin",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(?:="[^"]*")?/g, "");
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  define: {
    "process.env.NEXT_PUBLIC_SIGNALING_URL": JSON.stringify(
      process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:3001",
    ),
  },
  publicDir: "public",
  build: {
    outDir: "dist-static",
    emptyOutDir: true,
  },
});
