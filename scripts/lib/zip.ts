// Minimal readers for the data files the fetch scripts download: zip archives (BEA's CSV bundles)
// and xlsx workbooks (HUD's FMR file, which is a zip of XML). No dependencies, no code execution.
import { inflateRawSync } from "node:zlib";

/** Minimal zip reader: central directory, then stored or deflated entries. */
export function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a zip file.");
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < entries; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad zip central directory.");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, inflateRawSync(raw));
    else throw new Error(`Unsupported zip compression method ${method} for ${name}.`);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => XML_ENTITIES[e]);

/** Column letters to a 0-based index: A -> 0, Z -> 25, AA -> 26. */
const columnIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/**
 * One worksheet of an xlsx as rows of cell text (shared strings and inline strings resolved,
 * numbers as written). `sheet` is 1-based, in workbook order.
 */
export function readSheet(files: Map<string, Buffer>, sheet: number): string[][] {
  const shared = files.has("xl/sharedStrings.xml")
    ? [...files.get("xl/sharedStrings.xml")!.toString("utf8").matchAll(/<si>([\s\S]*?)<\/si>/g)]
      .map((m) => unescapeXml([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join("")))
    : [];
  const xml = files.get(`xl/worksheets/sheet${sheet}.xml`);
  if (!xml) throw new Error(`No worksheet ${sheet} in the workbook.`);
  return [...xml.toString("utf8").matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) => {
    const cells: string[] = [];
    for (const [, ref, attrs, inner] of row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = inner?.match(/<v>([^<]*)<\/v>/)?.[1];
      const t = inner?.match(/<t[^>]*>([^<]*)<\/t>/)?.[1];
      cells[columnIndex(ref)] = /t="s"/.test(attrs) ? shared[Number(v)] : unescapeXml(v ?? t ?? "");
    }
    return Array.from(cells, (c) => c ?? "");
  });
}
