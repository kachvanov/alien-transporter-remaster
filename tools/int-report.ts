// Review helper for docs/04-porting-guide.md §2 (integer semantics).
//
// Usage: npm run tool:int-report -- <file.as> [more.as ...]
//
// Prints every `:int` / `:uint` declaration of an AS3 file (fields, local variables and
// constants, parameters, return types, `Vector.<int>` element types) with line numbers, so that the
// TypeScript port can be checked for a `| 0` / `>>> 0` at each place where a value is written to
// such a variable.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export type IntKind = 'field' | 'var' | 'param' | 'return' | 'vector' | 'other';

export interface IntDecl {
  line: number;
  /** `int` or `uint`. */
  type: 'int' | 'uint';
  kind: IntKind;
  /** Declared name (empty for return types and vectors). */
  name: string;
  /** Trimmed source line, for context. */
  text: string;
}

/** Blank out comments and string literals (keeps line structure and columns). */
function stripNonCode(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i] as string;
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && d === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
    } else if (c === '"' || c === "'") {
      out += c;
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) {
          out += '  ';
          i += 2;
          continue;
        }
        out += ' ';
        i++;
      }
      if (i < n && src[i] === c) {
        out += c;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Find all int/uint declarations in AS3 source text. */
export function analyze(source: string): IntDecl[] {
  const code = stripNonCode(source);
  const codeLines = code.split('\n');
  const rawLines = source.split('\n');
  const result: IntDecl[] = [];

  // `Vector.<int>` / `Vector.<uint>` (element type; every write to such a vector truncates).
  const vectorRe = /Vector\.<\s*(u?int)\s*>/g;
  // `name:int`, `name : uint`, `):int`
  // (not followed by `(` or `.`: `cond ? a : int(x)` and `uint.MAX_VALUE` are not declarations)
  const declRe = /(?:([A-Za-z_$][\w$]*)|(\)))\s*:\s*(u?int)\b(?!\s*[(.])/g;

  let parenDepthInFunction = 0; // > 0 while inside the parameter list of a `function`
  let pendingFunction = false; // saw `function` keyword, waiting for its `(`

  for (let li = 0; li < codeLines.length; li++) {
    const line = codeLines[li] as string;
    const text = (rawLines[li] ?? '').trim();

    // Track whether each match is inside a function parameter list.
    const events: { pos: number; kind: 'decl' | 'vector'; m: RegExpExecArray }[] = [];
    for (const m of line.matchAll(declRe)) events.push({ pos: m.index ?? 0, kind: 'decl', m });
    for (const m of line.matchAll(vectorRe)) events.push({ pos: m.index ?? 0, kind: 'vector', m });
    events.sort((a, b) => a.pos - b.pos);

    let ei = 0;
    for (let pos = 0; pos <= line.length; pos++) {
      // Process events located at this position first.
      while (ei < events.length && (events[ei] as (typeof events)[number]).pos === pos) {
        const ev = events[ei++] as (typeof events)[number];
        const m = ev.m;
        if (ev.kind === 'vector') {
          result.push({ line: li + 1, type: m[1] as 'int' | 'uint', kind: 'vector', name: '', text });
          continue;
        }
        const type = m[3] as 'int' | 'uint';
        const name = m[1] ?? '';
        if (m[2] === ')') {
          result.push({ line: li + 1, type, kind: 'return', name: '', text });
          continue;
        }
        const before = line.slice(0, pos);
        let kind: IntKind;
        if (parenDepthInFunction > 0) {
          kind = 'param';
        } else if (/\b(var|const)\s+$/.test(before)) {
          kind = /\b(public|private|protected|internal|static|override)\b/.test(before) ? 'field' : 'var';
        } else if (/\b(var|const)\s+[\w$]+\s*:\s*[\w$.<>*]+\s*(=[^,;]*)?,\s*$/.test(before)) {
          // `var a:int = 0, b:int` style continuation
          kind = 'var';
        } else {
          kind = 'other';
        }
        result.push({ line: li + 1, type, kind, name, text });
      }

      if (pos === line.length) break;
      const ch = line[pos] as string;
      if (ch === '(') {
        if (pendingFunction) {
          parenDepthInFunction = 1;
          pendingFunction = false;
        } else if (parenDepthInFunction > 0) {
          parenDepthInFunction++;
        }
      } else if (ch === ')') {
        if (parenDepthInFunction > 0) parenDepthInFunction--;
      } else if (ch === 'f' && /^function\b/.test(line.slice(pos)) && (pos === 0 || !/[\w$]/.test(line[pos - 1] as string))) {
        // `function name(` / `function get name(` / anonymous `function(`
        pendingFunction = true;
      }
    }
  }

  // `pendingFunction` is reset when the `(` is found; a stray `function` keyword (e.g. type `Function`
  // is case-sensitive and does not match) cannot leave it set across declarations in practice.
  return result;
}

/** Format one declaration for the report. */
export function formatDecl(d: IntDecl): string {
  const label = d.name ? `${d.name}:${d.type}` : d.kind === 'return' ? `):${d.type}` : `Vector.<${d.type}>`;
  return `${String(d.line).padStart(5)}  ${d.kind.padEnd(6)}  ${label.padEnd(28)}  ${d.text}`;
}

function main(argv: string[]): number {
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('usage: npm run tool:int-report -- <file.as> [more.as ...]');
    return 2;
  }
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`int-report: cannot read ${file}: ${(e as Error).message}`);
      return 1;
    }
    const decls = analyze(src);
    console.log(`# ${file}: ${decls.length} int/uint declaration(s)`);
    for (const d of decls) console.log(formatDecl(d));
  }
  return 0;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  process.exit(main(process.argv.slice(2)));
}
