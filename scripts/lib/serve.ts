import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

// A static server for the production build, close enough to Vercel for a load-time measurement: it
// compresses text (Brotli when the browser accepts it, as Vercel does) and sends vercel.json's headers,
// the CSP included. `vite preview` sends files uncompressed, which would triple the JS a simulated slow
// 4G connection downloads.

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const TEXT = new Set([".html", ".js", ".css", ".json", ".svg"]);

interface VercelHeaders { source: string; headers: { key: string; value: string }[] }

/** vercel.json's headers for a path. Its sources (`/(.*)`, `/assets/(.*)`) are regexes as written. */
export function headersFor(path: string, rules: VercelHeaders[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules) if (new RegExp(`^${r.source}$`).test(path)) for (const h of r.headers) out[h.key] = h.value;
  return out;
}

/** Serves `dir` on a free port on 127.0.0.1; resolves with the server and its URL. */
export function serveDist(dir: string, vercelJson: string): Promise<{ server: Server; url: string }> {
  const rules: VercelHeaders[] = JSON.parse(readFileSync(vercelJson, "utf8")).headers ?? [];
  const root = normalize(dir);
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    let body: Buffer;
    try {
      if (!file.startsWith(root + sep)) throw new Error("outside dist");
      body = readFileSync(file);
    } catch {
      res.writeHead(404).end();
      return;
    }
    const ext = extname(file);
    const accept = String(req.headers["accept-encoding"] ?? "");
    const headers: Record<string, string> = { ...headersFor(path, rules), "Content-Type": TYPES[ext] ?? "application/octet-stream" };
    if (TEXT.has(ext) && /\bbr\b/.test(accept)) { body = brotliCompressSync(body); headers["Content-Encoding"] = "br"; }
    else if (TEXT.has(ext) && /\bgzip\b/.test(accept)) { body = gzipSync(body); headers["Content-Encoding"] = "gzip"; }
    res.writeHead(200, { ...headers, "Content-Length": String(body.length) }).end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") return reject(new Error("no port"));
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}
