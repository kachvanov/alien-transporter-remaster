// Extraction step 6 (docs/02-extraction-pipeline.md §6): XML data of the original -> JSON.
//
// Inputs:  reference/data/fonts/*.xml, reference/data/{missions,texts_en,effects}.xml (written by `decompile`)
// Outputs: assets/data/fonts/<fontXX>.json   { name, charInterval, chars: [{ name, x, y, w, h }] }  (game format)
//          assets/data/{missions,texts,effects}.json   (generic xmlToJson tree, all values strings)
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  EffectsSchema,
  FontSchema,
  MissionsSchema,
  TextsSchema,
  type FontData,
} from '../../src/engine/assets/schemas';
import { sha256File, type Paths } from './decompile';
import { xmlToJson, type XmlNode } from './xmlToJson';

/** `<xml file>` -> `<json file>` of the generic conversions. */
export const GENERIC_FILES = [
  { xml: 'missions.xml', json: 'missions.json', schema: MissionsSchema },
  { xml: 'texts_en.xml', json: 'texts.json', schema: TextsSchema },
  { xml: 'effects.xml', json: 'effects.json', schema: EffectsSchema },
] as const;

export function dataDir(p: Paths): string {
  return join(p.root, 'assets', 'data');
}
export function fontsJsonDir(p: Paths): string {
  return join(dataDir(p), 'fonts');
}

function asArray(v: unknown): XmlNode[] {
  return Array.isArray(v) ? (v as XmlNode[]) : [];
}

function str(n: XmlNode, key: string): string {
  const v = n[key];
  if (typeof v !== 'string') throw new Error(`missing attribute "${key}"`);
  return v;
}

/** Number as `parseFloat` of the original `Font.parseAtlasXML` reads it; NaN is an error here. */
function num(n: XmlNode, key: string): number {
  const v = parseFloat(str(n, key));
  if (Number.isNaN(v)) throw new Error(`attribute "${key}" is not a number: ${String(n[key])}`);
  return v;
}

/**
 * `<BitmapFont name charInterval><Char name x y w h/>...</BitmapFont>` -> FontData.
 * Commented-out chars are dropped by the XML parser (the original ignores them too).
 */
export function convertFont(xml: string): FontData {
  const root = xmlToJson(xml);
  const chars = asArray(root.Char).map((c) => {
    const out: FontData['chars'][number] = {
      name: str(c, 'name'),
      x: num(c, 'x'),
      y: num(c, 'y'),
      w: num(c, 'w'),
      h: num(c, 'h'),
    };
    // Optional in Font.parseAtlasXML (isNaN -> 0); none of the shipped fonts has them.
    if (c.offsetX !== undefined) out.offsetX = num(c, 'offsetX');
    if (c.offsetY !== undefined) out.offsetY = num(c, 'offsetY');
    return out;
  });
  return FontSchema.parse({ name: str(root, 'name'), charInterval: num(root, 'charInterval'), chars });
}

export function fontXmlFiles(p: Paths): string[] {
  return readdirSync(p.refFonts)
    .filter((n) => /^font\w+\.xml$/.test(n))
    .sort();
}

export function dataInputs(p: Paths, swfSha: string): Record<string, string> {
  const inputs: Record<string, string> = {
    swf: swfSha,
    schemas: sha256File(join(p.root, 'src', 'engine', 'assets', 'schemas.ts')),
  };
  for (const s of ['data.ts', 'xmlToJson.ts']) inputs[s] = sha256File(join(p.root, 'tools', 'extract', s));
  for (const g of GENERIC_FILES) inputs[g.xml] = sha256File(join(p.refData, g.xml));
  const h = createHash('sha256');
  for (const n of fontXmlFiles(p)) h.update(n).update(readFileSync(join(p.refFonts, n)));
  inputs.fonts = h.digest('hex');
  return inputs;
}

export function dataOutputsOk(p: Paths): boolean {
  try {
    const xmlFonts = fontXmlFiles(p);
    if (xmlFonts.length === 0) return false;
    for (const n of xmlFonts) {
      FontSchema.parse(JSON.parse(readFileSync(join(fontsJsonDir(p), n.replace(/\.xml$/, '.json')), 'utf8')));
    }
    for (const g of GENERIC_FILES) g.schema.parse(JSON.parse(readFileSync(join(dataDir(p), g.json), 'utf8')));
    return true;
  } catch {
    return false;
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
}

export function runData(p: Paths): { summary: string } {
  mkdirSync(fontsJsonDir(p), { recursive: true });
  let fonts = 0;
  let chars = 0;
  for (const n of fontXmlFiles(p)) {
    const font = convertFont(readFileSync(join(p.refFonts, n), 'utf8'));
    writeJson(join(fontsJsonDir(p), n.replace(/\.xml$/, '.json')), font);
    fonts++;
    chars += font.chars.length;
  }
  const notes: string[] = [];
  for (const g of GENERIC_FILES) {
    const json = g.schema.parse(xmlToJson(readFileSync(join(p.refData, g.xml), 'utf8')));
    writeJson(join(dataDir(p), g.json), json);
    const counts = Object.entries(json)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => `${(v as unknown[]).length} ${k}`);
    notes.push(`${g.json} (${counts.join(', ')})`);
  }
  return { summary: `${fonts} fonts (${chars} chars); ${notes.join('; ')}` };
}
