import { defineConfig } from "vite";
import { createSageConfig } from "@wearesage/vue/vite";
import { config } from "dotenv";
import fs from "fs";
import path from "path";
config();

// Pure magic - one function call!
export default defineConfig(async () => {
  const baseConfig = await createSageConfig({
    router: true
  });

  // Fix dayjs ES module issue from AppKit - merge configs properly
  const certPath = path.resolve("localhost.pem");
  const keyPath = path.resolve("localhost-key.pem");
  const hasLocalCert = fs.existsSync(certPath) && fs.existsSync(keyPath);

  return {
    ...baseConfig,
    server: {
      ...baseConfig.server,
      host: true,
      port: 5173,
      https: hasLocalCert
        ? { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }
        : undefined,
    },
    optimizeDeps: {
      ...baseConfig.optimizeDeps,
      include: [...(baseConfig.optimizeDeps?.include || []), "dayjs", "dayjs/locale/en", "dayjs/esm/locale/en", "debug", "media-typer", "mime-types", "mime-db", "ms", "bytes", "content-type", "depd", "inherits", "safe-buffer", "toidentifier", "setprototypeof", "statuses", "range-parser", "on-finished", "ee-first", "destroy", "unpipe", "raw-body", "iconv-lite", "safer-buffer", "ieee754", "buffer", "base64-js", "eventemitter3", "has-flag", "supports-color"]
    }
  };
});
