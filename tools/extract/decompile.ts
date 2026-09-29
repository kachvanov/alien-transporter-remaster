// Extraction steps 1-2 (docs/02-extraction-pipeline.md): JPEXS download, SWF copy,
// AS3 decompilation, binaryData/font PNG layout, swf2xml, sanity checks.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export const JPEXS_VERSION = '26.3.0';
export const JPEXS_SHA256 = '35f4930eb7c380afe66f2117f90b006deac0631473ad7500bb39c78f68645ecd';
export const DEFAULT_SWF = '/Applications/Flash Games/AlienTransporter.swf';
const JAVA_FALLBACK = '/opt/homebrew/opt/openjdk@17/bin/java';

/** Project layout, all paths absolute. */
export interface Paths {
  root: string;
  jpexsDir: string;
  ffdecCli: string;
  originalSwf: string;
  swfHashFile: string;
  extractDir: string;
  rawDir: string;
  logsDir: string;
  refAs3: string;
  refData: string;
  refFonts: string;
}

export function makePaths(root: string): Paths {
  const extractDir = join(root, 'build', 'extract');
  return {
    root,
    jpexsDir: join(root, 'vendor', 'jpexs'),
    ffdecCli: join(root, 'vendor', 'jpexs', 'ffdec-cli.jar'),
    originalSwf: join(root, 'vendor', 'original', 'AlienTransporter.swf'),
    swfHashFile: join(root, 'tools', 'extract', 'swf.sha256'),
    extractDir,
    rawDir: join(extractDir, 'raw'),
    logsDir: join(extractDir, 'logs'),
    refAs3: join(root, 'reference', 'as3'),
    refData: join(root, 'reference', 'data'),
    refFonts: join(root, 'reference', 'data', 'fonts'),
  };
}

export function sha256File(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** SWF source: env ORIGINAL_SWF -> .env -> default path. */
export function resolveSwfPath(root: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.ORIGINAL_SWF) return env.ORIGINAL_SWF;
  const envFile = join(root, '.env');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*ORIGINAL_SWF\s*=\s*(.*?)\s*$/.exec(line);
      if (m && m[1]) return m[1].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return DEFAULT_SWF;
}

export function javaBin(): string {
  const probe = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (!probe.error && probe.status === 0) return 'java';
  if (existsSync(JAVA_FALLBACK)) return JAVA_FALLBACK;
  throw new Error('Java 17 not found (install openjdk@17)');
}

/** Runs JPEXS CLI; full stdout/stderr goes to build/extract/logs/<logName>.log. */
function runFfdec(p: Paths, logName: string, args: string[]): void {
  mkdirSync(p.logsDir, { recursive: true });
  const logFile = join(p.logsDir, `${logName}.log`);
  const r = spawnSync(javaBin(), ['-Djava.awt.headless=true', '-jar', p.ffdecCli, ...args], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  writeFileSync(logFile, `${r.stdout ?? ''}${r.stderr ? `\n--- stderr ---\n${r.stderr}` : ''}`);
  if (r.error) throw r.error;
  const tail = (r.stdout ?? '').trim().split('\n').slice(-1)[0] ?? '';
  if (r.status !== 0 || /^(ERROR|FAIL)/m.test(tail)) {
    throw new Error(`ffdec ${args[0]} failed (exit ${r.status}); see ${logFile}`);
  }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** ru.alientransporter.Fonts_XmlFont04Blue -> fonts/font04Blue.xml etc. Null = not needed. */
export function mapDataName(className: string, ext: 'xml' | 'png'): string | null {
  const short = className.slice(className.lastIndexOf('.') + 1); // e.g. Fonts_XmlFont04Blue
  if (className.startsWith('ru.antkarlov.anthill.debug.')) return null; // debug fonts/buttons
  if (ext === 'xml') {
    if (short === 'MissionManager_XmlMissions') return 'missions.xml';
    if (short === 'Text_XmlTextEN') return 'texts_en.xml';
    if (short === 'PrepareState_XmlEffects') return 'effects.xml';
    const f = /^Fonts_XmlFont(\w+)$/.exec(short);
    if (f) return `fonts/font${f[1]}.xml`;
  } else {
    const f = /^Fonts_ImgFont(\w+)$/.exec(short);
    if (f) return `fonts/font${f[1]}.png`;
  }
  return null;
}

/** symbolClass CSV (`id;"class"`) -> id => className. */
export function parseSymbolClass(csv: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of csv.split(/\r?\n/)) {
    const m = /^(\d+);"(.*)"\s*$/.exec(line);
    if (m && m[1] && m[2]) map.set(Number(m[1]), m[2]);
  }
  return map;
}

export const EXPECTED_FONTS = [
  'font01',
  'font02',
  'font03',
  'font04',
  'font04Blue',
  'font04Green',
  'font04Pink',
  'font04Purple',
  'font04Red',
  'font05',
];

/** Sanity checks of docs/02 step 7. Returns a list of problems (empty = OK). */
export function verifyReference(refRoot: string): string[] {
  const errors: string[] = [];
  const as3 = join(refRoot, 'as3');
  const data = join(refRoot, 'data');

  const ru = join(as3, 'ru');
  if (!existsSync(ru)) {
    errors.push('reference/as3/ru is missing');
  } else {
    const bad = walk(ru).filter((f) => f.endsWith('.as') && readFileSync(f, 'utf8').includes('§§'));
    if (bad.length)
      errors.push(`${bad.length} files under reference/as3/ru contain "§§", e.g. ${bad[0]}`);
  }

  const config = join(as3, 'ru', 'alientransporter', 'Config.as');
  if (!existsSync(config)) errors.push('Config.as is missing');
  else if (!/FRAME_RATE\s*:\s*int\s*=\s*35\b/.test(readFileSync(config, 'utf8'))) {
    errors.push('Config.as does not contain "FRAME_RATE:int = 35"');
  }

  if (existsSync(as3)) {
    const levels = readdirSync(as3).filter((n) => /^Level\d\dPhysic_mc\.as$/.test(n));
    if (levels.length !== 20) errors.push(`expected 20 Level*Physic_mc.as, found ${levels.length}`);
  } else {
    errors.push('reference/as3 is missing');
  }

  for (const f of ['missions.xml', 'texts_en.xml', 'effects.xml']) {
    if (!existsSync(join(data, f))) errors.push(`reference/data/${f} is missing`);
  }
  for (const font of EXPECTED_FONTS) {
    for (const ext of ['xml', 'png']) {
      if (!existsSync(join(data, 'fonts', `${font}.${ext}`))) {
        errors.push(`reference/data/fonts/${font}.${ext} is missing`);
      }
    }
  }
  return errors;
}

export interface DecompileResult {
  summary: string;
}

/** Everything the `decompile` step consumes, hashed into the cache key. */
export function decompileInputs(root: string, swfSha: string): Record<string, string> {
  return {
    swf: swfSha,
    jpexs: `${JPEXS_VERSION}:${JPEXS_SHA256}`,
    script: sha256File(join(root, 'tools', 'extract', 'decompile.ts')),
    getJpexs: sha256File(join(root, 'tools', 'extract', 'get-jpexs.sh')),
  };
}

/** Copies the SWF into vendor/original and pins/verifies its SHA-256. Returns the hash. */
export function prepareSwf(p: Paths, sourceSwf: string): string {
  if (!existsSync(sourceSwf)) {
    throw new Error(`Original SWF not found: ${sourceSwf} (set ORIGINAL_SWF)`);
  }
  const sha = sha256File(sourceSwf);
  if (existsSync(p.swfHashFile)) {
    const pinned = readFileSync(p.swfHashFile, 'utf8').trim().split(/\s+/)[0];
    if (pinned !== sha) {
      throw new Error(
        `SWF SHA-256 mismatch: ${sourceSwf} is ${sha}, pinned in tools/extract/swf.sha256 is ${pinned}. ` +
          'Wrong file? If the SWF change is intentional, delete tools/extract/swf.sha256.',
      );
    }
  } else {
    writeFileSync(p.swfHashFile, `${sha}\n`);
    console.log(`decompile: pinned SWF SHA-256 in tools/extract/swf.sha256 (${sha})`);
  }
  mkdirSync(dirname(p.originalSwf), { recursive: true });
  if (!existsSync(p.originalSwf) || sha256File(p.originalSwf) !== sha) {
    copyFileSync(sourceSwf, p.originalSwf);
  }
  return sha;
}

export function ensureJpexs(p: Paths): void {
  const r = spawnSync('bash', [join(p.root, 'tools', 'extract', 'get-jpexs.sh')], {
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('get-jpexs.sh failed');
}

export function runDecompile(p: Paths, sourceSwf: string): DecompileResult {
  ensureJpexs(p);
  prepareSwf(p, sourceSwf);

  // Fresh raw export every time the step actually runs.
  rmSync(p.rawDir, { recursive: true, force: true });
  mkdirSync(p.rawDir, { recursive: true });

  runFfdec(p, 'export-script', [
    '-export',
    'script,binaryData,symbolClass',
    p.rawDir,
    p.originalSwf,
  ]);
  const imagesDir = join(p.rawDir, 'images');
  runFfdec(p, 'export-image', ['-export', 'image', imagesDir, p.originalSwf]);
  runFfdec(p, 'swf2xml', ['-swf2xml', p.originalSwf, join(p.extractDir, 'swf.xml')]);

  // raw/scripts -> reference/as3
  const rawScripts = join(p.rawDir, 'scripts');
  if (!existsSync(rawScripts)) throw new Error('JPEXS produced no scripts/ directory');
  rmSync(p.refAs3, { recursive: true, force: true });
  mkdirSync(dirname(p.refAs3), { recursive: true });
  cpSync(rawScripts, p.refAs3, { recursive: true });

  // symbolClass
  const csvSrc = join(p.rawDir, 'symbolClass', 'symbols.csv');
  if (!existsSync(csvSrc)) throw new Error('JPEXS produced no symbolClass/symbols.csv');
  const csvDst = join(p.extractDir, 'symbolClass.csv');
  copyFileSync(csvSrc, csvDst);
  const classById = parseSymbolClass(readFileSync(csvDst, 'utf8'));

  // binaryData / font images -> reference/data
  rmSync(p.refData, { recursive: true, force: true });
  mkdirSync(p.refFonts, { recursive: true });
  const skipped: string[] = [];
  const rawBin = join(p.rawDir, 'binaryData');
  let xmlCount = 0;
  for (const name of readdirSync(rawBin)) {
    const m = /^(\d+)_(.+)\.bin$/.exec(name);
    const id = m?.[1] ? Number(m[1]) : NaN;
    const className = classById.get(id) ?? m?.[2] ?? name;
    const target = mapDataName(className, 'xml');
    if (!target) {
      skipped.push(name);
      continue;
    }
    copyFileSync(join(rawBin, name), join(p.refData, target));
    xmlCount++;
  }
  let pngCount = 0;
  for (const name of readdirSync(imagesDir)) {
    const m = /^(\d+)(?:_.*)?\.png$/.exec(name);
    if (!m?.[1]) continue;
    const className = classById.get(Number(m[1]));
    if (!className) continue;
    const target = mapDataName(className, 'png');
    if (!target) continue;
    copyFileSync(join(imagesDir, name), join(p.refData, target));
    pngCount++;
  }

  const errors = verifyReference(join(p.root, 'reference'));
  if (errors.length) {
    throw new Error(`decompile verification failed:\n  - ${errors.join('\n  - ')}`);
  }

  const asCount = walk(p.refAs3).filter((f) => f.endsWith('.as')).length;
  const swfSize = (statSync(p.originalSwf).size / 1024 / 1024).toFixed(1);
  return {
    summary:
      `${asCount} .as files, ${xmlCount} data xml, ${pngCount} font png, ` +
      `SWF ${swfSize} MB` +
      (skipped.length ? `, skipped ${skipped.length} debug binaryData` : ''),
  };
}
