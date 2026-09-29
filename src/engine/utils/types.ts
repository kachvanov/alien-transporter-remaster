// Shared loose types for ported AS3 code (`Function`, `Class`, `Object`, `*`).
// This is not a port of a single AS3 file: it collects the TS spelling of the
// AS3 types listed in docs/04-porting-guide.md §1.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** AS3 `Function`. */
export type AnyFunction = (...args: any[]) => any;

/** AS3 `Class`. */
export type Ctor<T = any> = new (...args: any[]) => T;

/** AS3 `*` inside argument lists (`...rest`, `Function.apply`). */
export type AnyArgs = any[];

/** AS3 dynamic `Object` used as a property bag. */
export type AnyObject = Record<string, any>;
