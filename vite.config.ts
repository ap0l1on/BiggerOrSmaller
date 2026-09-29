import { defineConfig, type Plugin } from "vite";

const CF_BEACON =
  "<!-- Cloudflare Web Analytics --><script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{\"token\": \"519b97ca534c48e6aff6d6298a48187f\", \"spa\": true}'></script><!-- End Cloudflare Web Analytics -->";

/**
 * Injects the Cloudflare Web Analytics beacon (SPA mode) just before </body>
 * on every HTML page — production builds only.
 *
 * - `apply: "build"` keeps the dev server (`vite`, serve) beacon-free.
 * - The plugin is only registered when `command === "build"` and
 *   `mode === "production"`, so `vite build --mode development` (dev/preview
 *   checks) also stays beacon-free.
 * - Exactly one beacon per page: skips injection if one is already present.
 */
function cfBeaconProdOnly(): Plugin {
  return {
    name: "cf-beacon-prod-only",
    apply: "build",
    transformIndexHtml(html: string): string {
      if (html.includes("beacon.min.js")) return html;
      if (!html.includes("</body>")) return html;
      return html.replace("</body>", `${CF_BEACON}\n  </body>`);
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const isProdBuild = command === "build" && mode === "production";
  return {
    base: "/BiggerOrSmaller/",
    plugins: isProdBuild ? [cfBeaconProdOnly()] : [],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      target: "es2020",
      cssMinify: true,
      minify: "esbuild",
      assetsInlineLimit: 4096,
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    server: {
      port: 5173,
    },
  };
});
