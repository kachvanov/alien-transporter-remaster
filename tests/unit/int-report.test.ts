import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze, formatDecl } from '../../tools/int-report';

const SAMPLE = `package a.b
{
   public class Sample
   {
      public static const MAX:int = 30;   // comment with fake:int inside
      protected var _count:int;
      private var flags:uint = 0;
      public var name:String;
      private var list:Vector.<uint>;

      public function Sample(aSize:uint, aName:String = "x:int", aFlag:Boolean = false)
      {
         var i:int = 0, j:uint = 1;
         var k:Number = int(aSize) + uint.MAX_VALUE;
         var t:Number = aFlag ? k : int(k);
         /* block comment: var hidden:int; */
         for (var n:int = 0; n < 3; n++) {}
      }

      public function calc(a:int,
         b:Number, c:uint):int
      {
         return a;
      }

      public function get size() : uint { return 0; }
      public function set size(value:uint):void {}
      public function cb():void { var f:Function = function(x:int):void {}; }
   }
}`;

describe('int-report analyze()', () => {
  const decls = analyze(SAMPLE);
  const summary = decls.map((d) => `${d.line}:${d.kind}:${d.type}:${d.name}`);

  it('finds fields, vars, params, returns and vectors with line numbers', () => {
    expect(summary).toEqual([
      '5:field:int:MAX',
      '6:field:int:_count',
      '7:field:uint:flags',
      '9:vector:uint:',
      '11:param:uint:aSize',
      '13:var:int:i',
      '13:var:uint:j',
      '17:var:int:n',
      '20:param:int:a',
      '21:param:uint:c',
      '21:return:int:',
      '26:return:uint:',
      '27:param:uint:value',
      '28:param:int:x',
    ]);
  });

  it('ignores comments, strings, `int(...)` casts and `uint.MAX_VALUE`', () => {
    expect(decls.some((d) => d.name === 'fake' || d.name === 'hidden')).toBe(false);
    expect(summary.some((s) => s.includes(':name') || s.includes(':k') || s.includes(':t'))).toBe(false);
  });

  it('formatDecl prints line, kind and the source line', () => {
    const line = formatDecl(decls[0] as (typeof decls)[number]);
    expect(line).toContain('5');
    expect(line).toContain('field');
    expect(line).toContain('MAX:int');
    expect(line).toContain('public static const MAX:int = 30;');
  });
});

describe('int-report CLI', () => {
  it('prints the report for a file (npm run tool:int-report -- <file>)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'int-report-'));
    const file = join(dir, 'Sample.as');
    writeFileSync(file, SAMPLE);
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'tools/int-report.ts', file],
      { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } },
    );
    expect(out).toContain('14 int/uint declaration(s)');
    expect(out).toContain('MAX:int');
  });
});
