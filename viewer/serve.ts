#!/usr/bin/env bun
/**
 * serve.ts — minimal Bun static server for the viewer.
 *
 *   bun viewer:serve          # defaults to port 4040
 *   PORT=3000 bun viewer:serve
 *
 * Open http://localhost:4040 to use the viewer.
 */
import { file } from "bun";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4040;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg":  "image/svg+xml",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path === "/" || path === "") path = "/index.html";
    const abs = resolve(join(HERE, path));
    if (!abs.startsWith(HERE)) return new Response("forbidden", { status: 403 });
    const f = file(abs);
    if (!(await f.exists())) return new Response("not found", { status: 404 });
    const ext = abs.slice(abs.lastIndexOf("."));
    return new Response(f, {
      headers: { "content-type": TYPES[ext] ?? "application/octet-stream" },
    });
  },
});

console.log(`viewer running at http://localhost:${PORT}`);
