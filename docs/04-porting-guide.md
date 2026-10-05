# 04 — AS3 → TypeScript porting guide

## 0. Principles

1. **File for file, class for class.** `reference/as3/ru/alientransporter/systems/ShuttleSystem.as` → `src/game/systems/ShuttleSystem.ts`. `reference/as3/ru/antkarlov/anthill/AntActor.as` → `src/engine/core/AntActor.ts`. The Box2D plugin → `src/physics/anthill/...`.
2. The order of methods and fields is as in the original, so that the files are easy to compare side by side.
3. Names: classes, methods, public fields — as in the original. Rename `_loc3_` and `param1` to meaningful names (recommended), but strictly preserve the order of computation.
4. In the file header: `// Port of ru/alientransporter/systems/ShuttleSystem.as`. Mark any deliberate deviation with a `// DEVIATION: <why>` comment and mention it in the report.
5. Do not simplify the "obviously redundant". Double checks, odd coefficients and empty branches stay as in the original.

## 1. Types and default values

| AS3 | TS | Note |
|---|---|---|
| `int` | `number` + `\|0` | see §2 |
| `uint` | `number` + `>>>0` | see §2 |
| `Number` | `number` | **default NaN**, not 0 |
| `Boolean` | `boolean` | default false |
| `String` | `string \| null` | default null |
| `Object`, classes | `T \| null` | default null |
| `*` | `any` (sparingly) or `unknown` | |
| `Array` | `any[]` or a typed array | |
| `Vector.<T>` | `T[]` | ignore `.fixed` |
| `Dictionary` | `Map<K, V>` | if the keys are objects. The AS3 iteration order is undefined; if the logic depends on it, flag it |
| `Class` | `new (...a: any[]) => T` | |
| `Function` | `(...a: any[]) => any` | |
| `flash.geom.Point/Rectangle/Matrix` | `src/engine/utils/geom.ts` (minimal equivalents) | |
| `XML` / E4X | JSON from `assets/data/*.json` | §6 |

**Class fields are initialized explicitly with the AS3 defaults:** `int/uint = 0`, `Number = NaN`, `Boolean = false`, everything else `null`. If in the decompilation the constructor assigns a value, keep that assignment in the constructor, in the same order.

## 2. Integer semantics — the main source of silent divergences

In AS3 a value **written** into an `int`/`uint` is coerced to an integer (toward zero, with modulo 2³² overflow). JS has no such thing. Rules:

```ts
// var i:int = a / b;                       →
let i = (a / b) | 0;
// public var count:int;  this.count = x * 0.5; →
this.count = (x * 0.5) | 0;
// function f(n:int):int { return n * 1.5; }  → parameters and return values are coerced too!
function f(n: number): number { n = n | 0; return (n * 1.5) | 0; }
// int(x) → x | 0 ;  uint(x) → x >>> 0 ;  int("12") → Number("12") | 0
// uint arithmetic with multiplication (PRNG!) → Math.imul(a, b) >>> 0
```
- `++`/`--` on an already integer value can be left as is.
- Comparisons and reads without a write need no coercion.
- In doubtful places (an int field receives the result of `Math.random()*N`, a division, `* 0.5`) always use `|0`.
- A review helper: `npm run tool:int-report -- <as3-file>` prints all `:int`/`:uint` declarations (fields, vars, parameters, return values) — check your TS against them. This is done in T1.1.

## 3. Method and closure semantics

- **Method closures.** In AS3 `this.onClick` passed as a callback is permanently bound to `this`. In TS declare handlers that are passed to signals, timers or buttons as **arrow-function class properties**:
  ```ts
  private onClick = (btn: Button): void => { ... };   // the same reference for add() and remove()
  ```
  `.bind(this)` at the call site does not work: `signal.remove(this.onClick)` will not find such a handler.
- `override` → `override` (`noImplicitOverride` is on). `internal` → no modifier (a module export). `protected`/`private` — as is.
- Getters and setters — as is.
- Static fields and class initialization: in AS3 statics are initialized lazily on first access to the class, in TS — when the module is loaded. **Circular imports** (`G` ↔ `GameState` ↔ systems) can yield `undefined`. Rules:
  - statics that create objects of other modules should be moved into an explicit `init()` (like `G.init`);
  - numeric and string constants can stay `static readonly`;
  - if ESLint/esbuild warns about a cycle, break it with a type import (`import type`).
- `is` → `instanceof`. `as` → `asType(value, Class)` (returns `null` if not an instance) from `src/engine/utils/cast.ts`.
- `for each (var v in coll)` → `for (const v of coll)` (for Array/Vector) or `Object.values(obj)`. `for (var k in obj)` → `for (const k in obj)`.
- `getQualifiedClassName(obj)` → all "component" and view classes have `static readonly className = "X"`; the helper `qualifiedName(obj)`.
- `getDefinitionByName("X")` / `new (getDefinitionByName(name))()` → the registry `src/game/registry.ts` (`name → constructor`).
- `describeType` (used in AntFamily for Node fields) → a static description `static components = { fieldName: ComponentClass }` on every Node class.
- `getTimer()` → `AntG.simTimeMs` (simulation time, grows by 1000/35 per tick).
- `setTimeout`/`Timer` → `AntTaskManager` or tick counters. No real timers in the simulation.
- `trace(...)` → delete (or `debugLog`, stripped in prod).
- `Math.random()` → `AntMath.random()`. The game code almost everywhere already calls `AntMath.random*`; a direct `Math.random()` exists, for example, in `AntCamera.shake`. `AntMath` itself is ported 1:1. Its PRNG is xorshift over a `uint r`:
  ```
  r ^= r << 21; r ^= r >>> 35; r ^= r << 4; return r * MAX_RATIO;
  ```
  In TS write every line with `>>> 0`: `r = (r ^ (r << 21)) >>> 0` and so on. A shift by `>>> 35` is masked to `>>> 3` in both AS3 and JS. Replace the initial `r = Math.random() * uint.MAX_VALUE` with `AntMath.seed(n)`. Unit test: the first 10 values at seed 12345 are fixed as the reference.
- `Array.sort` / `sortOn` → `sortAS3` / `sortOnAS3` from `src/engine/utils/as3array.ts`. **Never use the built-in `Array.prototype.sort` for ports of AS3 sorts.** JS sorting is stable, while AVM2's is not: with equal keys it reorders elements by its own algorithm. This matters. For example, `AntCore.updatePriority()` sorts the systems, and all systems have `Priority = 0`, so **the update order of systems is determined by the AVM2 sorting algorithm**. The same goes for `AntPluginManager` (physics/core/music) and `AntEntity.sort`. `as3array.ts` implements an exact copy of the Flash Player algorithm (avmplus `core/ArrayClass.cpp`, class `ArraySort`, method `qsort`, sources at github.com/adobe/avmplus) and the flags `NUMERIC`, `DESCENDING`, `CASEINSENSITIVE`, `RETURNINDEXEDARRAY`, `UNIQUESORT`.

## 4. Flash objects in game code

| Found in AS3 | What we do |
|---|---|
| `new Level01Physic_mc()` + traversal `getChildAt(i)` (LevelCore.createPhysicsFromClip) | Iterate over `assets/data/levels/level01.json → objects` (already by `depth`). We wrap each object in a `ClipProxy` |
| `param1: Sprite` in `Factory.make*` / `Ground.make*` / `ObjectManager` | `ClipProxy { x, y, rotation, scaleX, scaleY, width, height, name, visible, [prop]: value }`. `width/height` is the Flash size at `rotation = 0` (computed in the pipeline). Assigning `rotation = 0` is allowed and breaks nothing. `getQualifiedClassName(proxy)` → `proxy.cls` |
| Model clips (`AntModelManager` reads `*Model_mc`) | The same via `models.json` + `ClipProxy` |
| `addAnimationFromCache("X", name?)` | `AssetRegistry.getAnimation("X")` — frame metadata |
| `AntTileMap.addClip(Level01BG_mc)` + `cacheClips()` | A node referencing `LevelNNBG_mc#0` and a `scrollFactor`; `eventComplete` is dispatched immediately (asynchronously on the next tick if the original code relies on deferral — check) |
| `BitmapData`, `copyPixels`, `draw` | Not ported. The renderer draws from the `Frame`. The exception is the AntLight alpha test (§5 in `01`) |
| `SoundTransform`, `Sound.play` | `AntSound` → channel state (loops/oneShots) → `Frame` |
| `SharedObject` (`AntCookie`) | `SaveStorage` (asynchronous). Where AS3 reads synchronously at startup — load in advance in `PrepareState` and serve from the cache |
| `navigateToURL` | `hostApi.openExternal(url)` (via worker → renderer → preload). The sponsor links have been removed |
| `stage.frameRate = N` (`AntG.frameRate`) | Does not affect the tick. The logic always runs at 35 Hz. The value 28 in PrepareState is only for the original's loading screen; ignore it |
| `flash.filters.GlowFilter` in `AntLabel` | AntLabel (TextField) is not used in the game, Label is bitmap-based. If encountered — `// DEVIATION` and skip |

## 5. XML → JSON

The pipeline converts XML to JSON by this scheme: an element → an object, attributes → fields, child elements with the same name → an array under that name. Node text → `"#text"`. Example:
```xml
<Mission><SubProp name="iconBig" value="IconPassengerOrange_mc"/>…</Mission>
```
```json
{ "Mission": [ { "SubProp": [ { "name": "iconBig", "value": "IconPassengerOrange_mc" } ] } ] }
```
E4X expressions turn into array traversal: `xml.Mission` → `data.Mission`; `m.SubProp.(@name == "x").@value` → `m.SubProp.find(p => p.name === "x")?.value`. Numbers in attributes stay **strings**, and the AS3 code itself does `Number(...)` / `int(...)` — repeat that with the coercion from §2.

## 6. Map: original package → folder → task

| Original (`reference/as3/…`) | Port | Task |
|---|---|---|
| `ru/antkarlov/anthill/{AntMath,AntPoint,AntRect,utils/*,signals/*}` | `src/engine/utils`, `src/engine/signals` | T1.1 |
| `ru/antkarlov/anthill/plugins/{AntTaskManager,AntTween,AntTransition,IPlugin}`, `AntPluginManager` | `src/engine/plugins` | T1.1 |
| `ru/antkarlov/anthill/{AntBasic,AntEntity,AntActor,AntAnimation,AntCamera,AntTileMap,AntMask,AntState,AntG,AntKeyboard,AntMouse,AntMouseButton,AntStorage}` | `src/engine/core`, `src/engine/input` | T1.2 |
| `ru/antkarlov/anthill/ants/*` | `src/engine/ants` | T1.3 |
| `ru/antkarlov/anthill/plugins/box2d/**` | `src/physics/anthill` | T1.4 |
| `ru/antkarlov/anthill/{AntSound,AntSoundManager}` | `src/engine/sound` | T1.8 (logic) |
| `ru/antkarlov/anthill/extensions/effects/*` | `src/engine/effects` | T2.3 |
| `ru/antkarlov/anthill/extensions/livinglights/*` | `src/engine/lights` | T2.4 |
| `ru/antkarlov/anthill/{AntLabel,AntButton,AntCookie,AntAtlas,AntAssetLoader,AntPreloader,Anthill}`, `debug/*` | not ported (AntButton — only if the game uses it; check) | — |
| `ru/alientransporter/{Config,G,Assets,Models,AvailKeys,DebugSettings}`, `data/*`, `components/*`, `tags/*`, `nodes/*` | `src/game/...` | T1.9a |
| `ru/alientransporter/{map,levels,models}/*` | `src/game/{map,levels,models}` | T1.9b |
| `systems/{Control,Shuttle,Health,Render,Station}System` + `views/ShuttleView` and related | `src/game/systems`, `src/game/views` | T1.9c |
| `ai/**`, `systems/{Passenger,Spawn,Trigger,Portal,Goal}System`, `views/PassengerView` | … | T1.9d |
| `states/GameState` (layers), `fonts/*`, `systems/UISystem` + the needed `ui/*` for the HUD | … | T1.9e |
| `systems/{Magnet,Missile,Ragdoll,Sensor,ObjectSpawn,Menu}System` + the remaining `views/*` | … | T2.1 |
| `elements/*` | `src/game/elements` | T2.2 |
| the remaining `ui/*` | `src/game/ui` | T2.5 |
| `screens/*`, `states/PrepareState` | `src/game/screens`, `src/game/states` | T2.6 |
| `missions/*`, `texts/*`, `MusicManager`, `Sounds`, `Music` | … | T2.7 |
| `tools/*` (ConfigEditor, JointEditor), `systems/DebugSystem` | not ported | — |
| `Box2D/**` | not ported (box2dweb); an API reference | — |

## 7. box2dweb vs the Box2DFlash API

box2dweb is an automatic conversion of Box2DFlash 2.1a, the API is the same. Namespaces: `Box2D.Dynamics.b2World`, `Box2D.Common.Math.b2Vec2`, `Box2D.Collision.Shapes.b2PolygonShape`, `Box2D.Dynamics.Joints.b2RevoluteJointDef`, etc. The module `src/physics/box2dweb/index.ts` re-exports them flat (`export const b2World = Box2D.Dynamics.b2World` …) and provides types from `box2d.d.ts` (describe only the API that is used: the methods actually called in `plugins/box2d/**` and `ru/alientransporter/**`, collect them via grep). Differences from AS3:
- `b2Vec2.Make(x, y)` and `new b2Vec2(x, y)` — both exist;
- `b2World(gravity, doSleep)` — as in 2.1a;
- `SetUserData/GetUserData`, `GetFixtureList()`, `GetNext()` — as in AS3.

## 8. What to check in your port before handing it in

- [ ] The `// Port of …` header, method order as in the original.
- [ ] All `int`/`uint` writes are coerced (checked against `tool:int-report`).
- [ ] Fields are initialized with the AS3 defaults (Number → NaN!).
- [ ] Callbacks for signals and buttons are arrow-function properties.
- [ ] No `Math.random`, `Date`, `performance`, `setTimeout` in the simulation.
- [ ] No pixi, electron or DOM imports in `src/{engine,physics,game,frame,sim}`.
- [ ] Test: at least creating the object and one `update()` without exceptions. For pure logic — tests on values.
