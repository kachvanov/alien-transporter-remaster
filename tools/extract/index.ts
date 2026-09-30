// Extraction orchestrator: `npm run extract [-- --step=<name>] [--force]`.
// Steps run in declaration order; each has a cache key built from the hashes of
// its inputs, stored in build/extract/.cache.json (docs/02-extraction-pipeline.md).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  decompileInputs,
  makePaths,
  prepareSwf,
  resolveSwfPath,
  runDecompile,
  verifyReference,
  type Paths,
} from './decompile';
import { levelsInputs, levelsOutputsOk, runLevels } from './levels';
import { runSounds, soundsInputs, soundsOutputsOk } from './sounds';
import { runSprites, spritesInputs, spritesOutputsOk } from './sprites';
import { runSymbols, symbolsInputs, symbolsOutputsOk } from './symbols';

interface StepContext {
  paths: Paths;
  swfSource: string;
}

interface Step {
  name: string;
  /** Hash inputs of the step; the step is skipped when the key and outputs are unchanged. */
  inputs(ctx: StepContext): Record<string, string>;
  /** True when the step's outputs are still present and valid. */
  outputsOk(ctx: StepContext): boolean;
  run(ctx: StepContext): { summary: string } | Promise<{ summary: string }>;
}

// New steps (sprites, sounds, data, levels, ...) are appended here by later tasks.
const STEPS: Step[] = [
  {
    name: 'decompile',
    inputs: ({ paths, swfSource }) => {
      // Fresh clone: pins the SWF hash on first run, verifies it afterwards.
      const sha = prepareSwf(paths, swfSource);
      return decompileInputs(paths.root, sha);
    },
    outputsOk: ({ paths }) =>
      existsSync(join(paths.extractDir, 'swf.xml')) &&
      existsSync(join(paths.extractDir, 'symbolClass.csv')) &&
      verifyReference(join(paths.root, 'reference')).length === 0,
    run: ({ paths, swfSource }) => runDecompile(paths, swfSource),
  },
  {
    name: 'symbols',
    inputs: ({ paths, swfSource }) => symbolsInputs(paths, prepareSwf(paths, swfSource)),
    outputsOk: ({ paths }) => symbolsOutputsOk(paths),
    run: ({ paths }) => runSymbols(paths),
  },
  {
    name: 'sprites',
    inputs: ({ paths, swfSource }) => spritesInputs(paths, prepareSwf(paths, swfSource)),
    outputsOk: ({ paths }) => spritesOutputsOk(paths),
    run: ({ paths }) => runSprites(paths),
  },
  {
    name: 'sounds',
    inputs: ({ paths, swfSource }) => soundsInputs(paths, prepareSwf(paths, swfSource)),
    outputsOk: ({ paths }) => soundsOutputsOk(paths),
    run: ({ paths }) => runSounds(paths),
  },
  {
    name: 'levels',
    inputs: ({ paths, swfSource }) => levelsInputs(paths, prepareSwf(paths, swfSource)),
    outputsOk: ({ paths }) => levelsOutputsOk(paths),
    run: ({ paths }) => runLevels(paths),
  },
];

type Cache = Record<string, string>;

function readCache(file: string): Cache {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Cache;
  } catch {
    return {};
  }
}

function keyOf(inputs: Record<string, string>): string {
  const sorted = Object.keys(inputs)
    .sort()
    .map((k) => `${k}=${inputs[k]}`)
    .join('\n');
  return createHash('sha256').update(sorted).digest('hex');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stepArg = args.find((a) => a.startsWith('--step='))?.slice('--step='.length);
  const force = args.includes('--force');

  const selected = stepArg ? STEPS.filter((s) => s.name === stepArg) : STEPS;
  if (stepArg && selected.length === 0) {
    console.error(`Unknown step "${stepArg}". Available: ${STEPS.map((s) => s.name).join(', ')}`);
    process.exit(2);
  }

  const root = process.cwd();
  const paths = makePaths(root);
  const ctx: StepContext = { paths, swfSource: resolveSwfPath(root) };
  const cacheFile = join(paths.extractDir, '.cache.json');
  mkdirSync(paths.extractDir, { recursive: true });
  const cache = readCache(cacheFile);

  for (const step of selected) {
    const t0 = Date.now();
    const key = keyOf(step.inputs(ctx));
    if (!force && cache[step.name] === key && step.outputsOk(ctx)) {
      console.log(`[${step.name}] up to date (cached)`);
      continue;
    }
    console.log(`[${step.name}] running...`);
    const result = await step.run(ctx);
    cache[step.name] = key;
    writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
    console.log(
      `[${step.name}] done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${result.summary}`,
    );
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
