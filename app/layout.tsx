import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Maë’s Brewery",
  description: "Cocktail and shot recipes, layer by layer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page extend under the notch / system bars; the CSS keeps content clear of them
  viewportFit: "cover",
  themeColor: "#171717",
};

// Dev on the phone only: the page lives at tauri.localhost, so Next opens its hot-reload
// socket on ws://tauri.localhost (port 80, unreachable). Send it to the dev server instead,
// which `adb reverse tcp:3000` makes reachable as localhost:3000.
const HMR_FIX = `
(function () {
  if (location.hostname !== "tauri.localhost") return;
  var Native = window.WebSocket;
  function Patched(url, protocols) {
    if (typeof url === "string") {
      url = url.replace("ws://tauri.localhost/", "ws://localhost:3000/");
    }
    return protocols === undefined ? new Native(url) : new Native(url, protocols);
  }
  Patched.prototype = Native.prototype;
  Patched.CONNECTING = 0; Patched.OPEN = 1; Patched.CLOSING = 2; Patched.CLOSED = 3;
  window.WebSocket = Patched;
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {process.env.NODE_ENV === "development" && (
          <Script id="hmr-fix" strategy="beforeInteractive">
            {HMR_FIX}
          </Script>
        )}
        {children}
      </body>
    </html>
  );
}