# 04 — Руководство по порту AS3 → TypeScript

## 0. Принципы

1. **Файл в файл, класс в класс.** `reference/as3/ru/alientransporter/systems/ShuttleSystem.as` → `src/game/systems/ShuttleSystem.ts`. `reference/as3/ru/antkarlov/anthill/AntActor.as` → `src/engine/core/AntActor.ts`. Box2D-плагин → `src/physics/anthill/...`.
2. Порядок методов и полей — как в оригинале, чтобы файлы легко сравнивать бок о бок.
3. Имена: классы, методы, публичные поля — как в оригинале. `_loc3_` и `param1` переименовывай в осмысленные имена (это рекомендуется), но строго сохраняй порядок вычислений.
4. В шапке файла: `// Port of ru/alientransporter/systems/ShuttleSystem.as`. Любое сознательное отклонение помечай комментарием `// DEVIATION: <почему>` и упоминай в отчёте.
5. Не упрощай «очевидно лишнее». Двойные проверки, странные коэффициенты, пустые ветки остаются как в оригинале.

## 1. Типы и значения по умолчанию

| AS3 | TS | Примечание |
|---|---|---|
| `int` | `number` + `\|0` | см. §2 |
| `uint` | `number` + `>>>0` | см. §2 |
| `Number` | `number` | **дефолт NaN**, не 0 |
| `Boolean` | `boolean` | дефолт false |
| `String` | `string \| null` | дефолт null |
| `Object`, классы | `T \| null` | дефолт null |
| `*` | `any` (точечно) или `unknown` | |
| `Array` | `any[]` или типизированный массив | |
| `Vector.<T>` | `T[]` | `.fixed` игнорировать |
| `Dictionary` | `Map<K, V>` | если ключи — объекты. Порядок итерации AS3 не определён; если логика от него зависит — отметь |
| `Class` | `new (...a: any[]) => T` | |
| `Function` | `(...a: any[]) => any` | |
| `flash.geom.Point/Rectangle/Matrix` | `src/engine/utils/geom.ts` (минимальные аналоги) | |
| `XML` / E4X | JSON из `assets/data/*.json` | §6 |

**Поля класса инициализируются явно AS3-дефолтами:** `int/uint = 0`, `Number = NaN`, `Boolean = false`, всё остальное `null`. Если в декомпиляции конструктор присваивает значение, оставь это присваивание в конструкторе, в том же порядке.

## 2. Целочисленная семантика — главный источник тихих расхождений

В AS3 значение, **записываемое** в `int`/`uint`, приводится к целому (к нулю, с переполнением по модулю 2³²). В JS этого нет. Правила:

```ts
// var i:int = a / b;                       →
let i = (a / b) | 0;
// public var count:int;  this.count = x * 0.5; →
this.count = (x * 0.5) | 0;
// function f(n:int):int { return n * 1.5; }  → параметры и возврат тоже приводятся!
function f(n: number): number { n = n | 0; return (n * 1.5) | 0; }
// int(x) → x | 0 ;  uint(x) → x >>> 0 ;  int("12") → Number("12") | 0
// uint-арифметика с умножением (PRNG!) → Math.imul(a, b) >>> 0
```
- `++`/`--` над уже целым значением можно оставить как есть.
- Сравнения и чтения без записи приводить не нужно.
- В сомнительных местах (int-поле получает результат `Math.random()*N`, деление, `* 0.5`) всегда `|0`.
- Помощник для ревью: `npm run tool:int-report -- <as3-файл>` печатает все `:int`/`:uint`-объявления (поля, var, параметры, возвраты) — сверь с ними свой TS. Это делается в T1.1.

## 3. Семантика методов и замыканий

- **Method closures.** В AS3 `this.onClick`, переданный как колбэк, навсегда привязан к `this`. В TS обработчики, которые передаются в сигналы, таймеры или кнопки, объявляй **стрелочными свойствами класса**:
  ```ts
  private onClick = (btn: Button): void => { ... };   // одна и та же ссылка для add() и remove()
  ```
  `.bind(this)` в месте вызова не подходит: `signal.remove(this.onClick)` не найдёт такой обработчик.
- `override` → `override` (включён `noImplicitOverride`). `internal` → без модификатора (экспорт из модуля). `protected`/`private` — как есть.
- Геттеры и сеттеры — как есть.
- Статические поля и инициализация классов: в AS3 статика инициализируется лениво при первом обращении к классу, в TS — при загрузке модуля. **Циклические импорты** (`G` ↔ `GameState` ↔ системы) могут давать `undefined`. Правила:
  - статику, которая создаёт объекты других модулей, переносить в явный `init()` (как `G.init`);
  - константы-числа и строки можно оставить `static readonly`;
  - если ESLint/esbuild предупреждает о цикле, разорвать его через импорт типов (`import type`).
- `is` → `instanceof`. `as` → `asType(value, Class)` (возвращает `null`, если не экземпляр) из `src/engine/utils/cast.ts`.
- `for each (var v in coll)` → `for (const v of coll)` (для Array/Vector) или `Object.values(obj)`. `for (var k in obj)` → `for (const k in obj)`.
- `getQualifiedClassName(obj)` → у всех «компонентных» и view-классов есть `static readonly className = "X"`; хелпер `qualifiedName(obj)`.
- `getDefinitionByName("X")` / `new (getDefinitionByName(name))()` → реестр `src/game/registry.ts` (`name → constructor`).
- `describeType` (используется в AntFamily для полей Node) → статическое описание `static components = { fieldName: ComponentClass }` у каждого Node-класса.
- `getTimer()` → `AntG.simTimeMs` (время симуляции, растёт на 1000/35 за тик).
- `setTimeout`/`Timer` → `AntTaskManager` или счётчики тиков. Никаких реальных таймеров в симуляции.
- `trace(...)` → удалить (или `debugLog`, вырезаемый в prod).
- `Math.random()` → `AntMath.random()`. Игровой код и так почти везде зовёт `AntMath.random*`, прямой `Math.random()` есть, например, в `AntCamera.shake`. Сам `AntMath` портируется 1:1. Его PRNG — xorshift над `uint r`:
  ```
  r ^= r << 21; r ^= r >>> 35; r ^= r << 4; return r * MAX_RATIO;
  ```
  В TS каждую строку делай с `>>> 0`: `r = (r ^ (r << 21)) >>> 0` и т.д. Сдвиг `>>> 35` и в AS3, и в JS маскируется до `>>> 3`. Начальный `r = Math.random() * uint.MAX_VALUE` замени на `AntMath.seed(n)`. Юнит-тест: первые 10 значений при сиде 12345 фиксируются как эталон.
- `Array.sort` / `sortOn` → `sortAS3` / `sortOnAS3` из `src/engine/utils/as3array.ts`. **Никогда не используй встроенный `Array.prototype.sort` для порта AS3-сортировок.** JS-сортировка стабильна, а AVM2 — нет: при равных ключах она переставляет элементы по своему алгоритму. Это важно. Например, `AntCore.updatePriority()` сортирует системы, а у всех систем `Priority = 0`, поэтому **порядок обновления систем определяется алгоритмом сортировки AVM2**. То же для `AntPluginManager` (physics/core/music) и `AntEntity.sort`. `as3array.ts` реализует точную копию алгоритма Flash Player (avmplus `core/ArrayClass.cpp`, класс `ArraySort`, метод `qsort`, исходники на github.com/adobe/avmplus) и флаги `NUMERIC`, `DESCENDING`, `CASEINSENSITIVE`, `RETURNINDEXEDARRAY`, `UNIQUESORT`.

## 4. Flash-объекты в игровом коде

| Встречается в AS3 | Что делаем |
|---|---|
| `new Level01Physic_mc()` + обход `getChildAt(i)` (LevelCore.createPhysicsFromClip) | Итерация по `assets/data/levels/level01.json → objects` (уже по `depth`). Каждый объект оборачиваем в `ClipProxy` |
| `param1: Sprite` в `Factory.make*` / `Ground.make*` / `ObjectManager` | `ClipProxy { x, y, rotation, scaleX, scaleY, width, height, name, visible, [prop]: value }`. `width/height` — Flash-размер при `rotation = 0` (посчитан в пайплайне). Присваивание `rotation = 0` разрешено и ничего не ломает. `getQualifiedClassName(proxy)` → `proxy.cls` |
| Клипы моделей (`AntModelManager` читает `*Model_mc`) | То же через `models.json` + `ClipProxy` |
| `addAnimationFromCache("X", name?)` | `AssetRegistry.getAnimation("X")` — метаданные кадров |
| `AntTileMap.addClip(Level01BG_mc)` + `cacheClips()` | Узел со ссылкой на `LevelNNBG_mc#0` и `scrollFactor`; `eventComplete` диспатчится сразу (асинхронно на следующем тике, если оригинальный код рассчитывает на отложенность — проверить) |
| `BitmapData`, `copyPixels`, `draw` | Не переносим. Рисует рендерер по `Frame`. Исключение — альфа-тест AntLight (§5 в `01`) |
| `SoundTransform`, `Sound.play` | `AntSound` → состояние каналов (loops/oneShots) → `Frame` |
| `SharedObject` (`AntCookie`) | `SaveStorage` (асинхронный). Где AS3 читает синхронно при старте — загрузить заранее в `PrepareState` и отдавать из кеша |
| `navigateToURL` | `hostApi.openExternal(url)` (через воркер → renderer → preload). Спонсорские ссылки удалены |
| `stage.frameRate = N` (`AntG.frameRate`) | Не влияет на тик. Логика всегда 35 Гц. Значение 28 в PrepareState — только для загрузочного экрана оригинала, игнорировать |
| `flash.filters.GlowFilter` в `AntLabel` | AntLabel (TextField) в игре не используется, Label — растровый. Если встретится — `// DEVIATION` и пропустить |

## 5. XML → JSON

Пайплайн переводит XML в JSON по схеме: элемент → объект, атрибуты → поля, дочерние элементы с одним именем → массив под этим именем. Текст узла → `"#text"`. Пример:
```xml
<Mission><SubProp name="iconBig" value="IconPassengerOrange_mc"/>…</Mission>
```
```json
{ "Mission": [ { "SubProp": [ { "name": "iconBig", "value": "IconPassengerOrange_mc" } ] } ] }
```
E4X-выражения меняются на обход массивов: `xml.Mission` → `data.Mission`; `m.SubProp.(@name == "x").@value` → `m.SubProp.find(p => p.name === "x")?.value`. Числа в атрибутах остаются **строками**, а AS3-код сам делает `Number(...)` / `int(...)` — повторяй это с приведением из §2.

## 6. Карта: пакет оригинала → папка → задача

| Оригинал (`reference/as3/…`) | Порт | Задача |
|---|---|---|
| `ru/antkarlov/anthill/{AntMath,AntPoint,AntRect,utils/*,signals/*}` | `src/engine/utils`, `src/engine/signals` | T1.1 |
| `ru/antkarlov/anthill/plugins/{AntTaskManager,AntTween,AntTransition,IPlugin}`, `AntPluginManager` | `src/engine/plugins` | T1.1 |
| `ru/antkarlov/anthill/{AntBasic,AntEntity,AntActor,AntAnimation,AntCamera,AntTileMap,AntMask,AntState,AntG,AntKeyboard,AntMouse,AntMouseButton,AntStorage}` | `src/engine/core`, `src/engine/input` | T1.2 |
| `ru/antkarlov/anthill/ants/*` | `src/engine/ants` | T1.3 |
| `ru/antkarlov/anthill/plugins/box2d/**` | `src/physics/anthill` | T1.4 |
| `ru/antkarlov/anthill/{AntSound,AntSoundManager}` | `src/engine/sound` | T1.8 (логика) |
| `ru/antkarlov/anthill/extensions/effects/*` | `src/engine/effects` | T2.3 |
| `ru/antkarlov/anthill/extensions/livinglights/*` | `src/engine/lights` | T2.4 |
| `ru/antkarlov/anthill/{AntLabel,AntButton,AntCookie,AntAtlas,AntAssetLoader,AntPreloader,Anthill}`, `debug/*` | не портируются (AntButton — только если его использует игра; проверить) | — |
| `ru/alientransporter/{Config,G,Assets,Models,AvailKeys,DebugSettings}`, `data/*`, `components/*`, `tags/*`, `nodes/*` | `src/game/...` | T1.9a |
| `ru/alientransporter/{map,levels,models}/*` | `src/game/{map,levels,models}` | T1.9b |
| `systems/{Control,Shuttle,Health,Render,Station}System` + `views/ShuttleView` и связанные | `src/game/systems`, `src/game/views` | T1.9c |
| `ai/**`, `systems/{Passenger,Spawn,Trigger,Portal,Goal}System`, `views/PassengerView` | … | T1.9d |
| `states/GameState` (слои), `fonts/*`, `systems/UISystem` + нужные `ui/*` для HUD | … | T1.9e |
| `systems/{Magnet,Missile,Ragdoll,Sensor,ObjectSpawn,Menu}System` + оставшиеся `views/*` | … | T2.1 |
| `elements/*` | `src/game/elements` | T2.2 |
| оставшиеся `ui/*` | `src/game/ui` | T2.5 |
| `screens/*`, `states/PrepareState` | `src/game/screens`, `src/game/states` | T2.6 |
| `missions/*`, `texts/*`, `MusicManager`, `Sounds`, `Music` | … | T2.7 |
| `tools/*` (ConfigEditor, JointEditor), `systems/DebugSystem` | не портируются | — |
| `Box2D/**` | не портируется (box2dweb); справочник по API | — |

## 7. box2dweb vs Box2DFlash API

box2dweb — автоматическая конверсия Box2DFlash 2.1a, API тот же. Пространства имён: `Box2D.Dynamics.b2World`, `Box2D.Common.Math.b2Vec2`, `Box2D.Collision.Shapes.b2PolygonShape`, `Box2D.Dynamics.Joints.b2RevoluteJointDef` и т.д. Модуль `src/physics/box2dweb/index.ts` реэкспортирует их плоско (`export const b2World = Box2D.Dynamics.b2World` …) и даёт типы из `box2d.d.ts` (описывать только используемое API: методы, которые реально вызываются в `plugins/box2d/**` и `ru/alientransporter/**`, собрать через grep). Отличия от AS3:
- `b2Vec2.Make(x, y)` и `new b2Vec2(x, y)` — есть оба;
- `b2World(gravity, doSleep)` — как в 2.1a;
- `SetUserData/GetUserData`, `GetFixtureList()`, `GetNext()` — как в AS3.

## 8. Что проверять в своём порте перед сдачей

- [ ] Шапка `// Port of …`, порядок методов как в оригинале.
- [ ] Все `int`/`uint`-записи приведены (сверено с `tool:int-report`).
- [ ] Поля инициализированы AS3-дефолтами (Number → NaN!).
- [ ] Колбэки для сигналов и кнопок — стрелочные свойства.
- [ ] Нет `Math.random`, `Date`, `performance`, `setTimeout` в симуляции.
- [ ] Нет импортов pixi, electron и DOM в `src/{engine,physics,game,frame,sim}`.
- [ ] Тест: как минимум создание объекта и один `update()` без исключений. Для чистой логики — тесты на значения.
