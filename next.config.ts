import { execFileSync } from "node:child_process";
import path from "node:path";
import type { NextConfig } from "next";

// Set by `tauri android dev` to your computer's address on the network (e.g. 192.168.1.27)
const internalHost = process.env.TAURI_DEV_HOST || "localhost";

// True only for `tauri android dev` (not for `npm run dev` in a desktop browser, not for builds)
const isTauriDev =
  Boolean(process.env.TAURI_DEV_HOST) && process.env.NODE_ENV !== "production";

// Hot reload on the phone.
// The phone page lives at http://tauri.localhost, and Next.js would open its hot-reload
// WebSocket at ws://tauri.localhost/_next/hmr, i.e. on port 80 of the phone. Binding port 80
// is refused by Android ("cannot bind listener: Permission denied"), so instead we set
// `assetPrefix` (see below) so that the assets AND the socket go to http://localhost:3000.
// `adb reverse` makes the phone's port 3000 lead to the dev server on this computer
// (port 3000). Failing is harmless: the app still works, only hot reload doesn't.
if (isTauriDev) {
  const adb = process.env.ANDROID_HOME
    ? path.join(process.env.ANDROID_HOME, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    : "adb";
  try {
    execFileSync(adb, ["reverse", "tcp:3000", "tcp:3000"], { stdio: "pipe" });
    console.log("[next.config] adb reverse tcp:3000 -> tcp:3000 OK (phone hot reload)");
  } catch (e) {
    // adb explains the problem on stderr, not in the exception's first line
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const reason = String(err.stderr || err.stdout || err.message).trim();
    console.warn(`[next.config] adb reverse tcp:3000 -> tcp:3000 FAILED, hot reload won't work on the phone. adb says: ${reason}`);
  }
}

const nextConfig: NextConfig = {
  // Tauri needs plain static files, not a Node server
  output: "export",
  images: { unoptimized: true },

  // Next.js 16 refuses to serve its dev assets and hot-reload socket to hosts it doesn't know.
  // The phone page's origin is tauri.localhost; it reaches the dev server by IP.
  allowedDevOrigins: ["tauri.localhost", "localhost", internalHost, "192.168.*.*", "10.*.*.*", "172.*.*.*"],

  experimental: {
    // Safety net: since Next.js 16, hydration waits for debug data sent over the hot-reload
    // socket. With this off, the page still becomes interactive if the socket isn't connected
    // (for example when the phone isn't plugged in). Dev server only; no effect on `next build`.
    reactDebugChannel: false,
  },

  // Tailwind CSS: this is what turns `@import "tailwindcss"` into real styles.
  // create-next-app generated it; without it, no Tailwind class does anything.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;