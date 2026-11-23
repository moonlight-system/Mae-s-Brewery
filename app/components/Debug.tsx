"use client";

// TEMPORARY: prints on screen why the stylesheet might not be applied. Remove once solved.

import { useEffect, useState } from "react";

type Timing = PerformanceResourceTiming & { responseStatus?: number };

export default function Debug() {
  const [lines, setLines] = useState<string[]>(["debug: waiting for the page to hydrate…"]);

  useEffect(() => {
    (async () => {
      const out: string[] = [];
      out.push(`url: ${location.href}`);
      out.push(`ua: ${navigator.userAgent}`);
      out.push(`viewport: ${innerWidth}x${innerHeight}, dpr ${devicePixelRatio}`);
      out.push(`body font: ${getComputedStyle(document.body).fontFamily}`);
      const main = document.querySelector("main");
      out.push(`main display: ${main ? getComputedStyle(main).display : "no <main>"} (flex if Tailwind applied)`);
      out.push(`<style> tags: ${document.querySelectorAll("style").length}`);
      out.push(`document.styleSheets: ${document.styleSheets.length}`);

      const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
      );
      out.push(`stylesheet links: ${links.length}`);
      for (const link of links) {
        let rules = "?";
        try {
          rules = link.sheet ? String(link.sheet.cssRules.length) : "NO SHEET (not applied)";
        } catch (e) {
          rules = `error ${e}`;
        }
        let net = "";
        try {
          const res = await fetch(link.href);
          const text = await res.text();
          net = `${res.status} ${res.headers.get("content-type")} ${text.length} bytes, starts: ${JSON.stringify(
            text.slice(0, 80)
          )}`;
        } catch (e) {
          net = `fetch error ${e}`;
        }
        out.push(`- ${link.href}\n  rules: ${rules}\n  fetch: ${net}`);
      }

      const entries = performance
        .getEntriesByType("resource")
        .filter((e) => /\.(css|js)(\?|$)/.test(e.name)) as Timing[];
      out.push(`resources (.css/.js): ${entries.length}`);
      for (const e of entries.filter((x) => x.name.includes(".css") || (x.responseStatus ?? 200) >= 400)) {
        out.push(`- ${e.name.slice(-60)} status ${e.responseStatus ?? "?"} size ${e.transferSize}`);
      }

      setLines(out);
    })();
  }, []);

  return (
    <pre
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "45vh",
        overflow: "auto",
        margin: 0,
        padding: 6,
        background: "#000",
        color: "#7CFC00",
        font: "11px/1.3 monospace",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        zIndex: 99999,
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}