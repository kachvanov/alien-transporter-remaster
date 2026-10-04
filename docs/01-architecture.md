# 01 — Архитектура

## 1. Процессы и потоки данных

```
┌──────────────────── Renderer process (BrowserWindow) ────────────────────┐        ┌──────── Main process ────────┐
│                                                                           │        │ save.ts     save/settings JSON │
│  InputCollector (keydown/keyup по event.code, pointer → 800×600)          │  IPC   │ wsServer.ts (только хост)      │
│        │ InputSnapshot (postMessage)                                      │◄──────►│ discovery.ts (UDP beacon/scan) │
│        ▼                                                                  │        │ window, fullscreen, openExternal│
│  ┌──────────── Sim Worker (src/sim/worker.ts) ────────────┐               │        └──────────────┬─────────────────┘
│  │ GameLoop 35 Гц → engine (Anthill-TS) + game + physics  │               │   MessagePort          │ ws (TCP 47020)
│  │ FrameWriter → Frame (ArrayBuffer)                      │───────────────┼──────(хост)────────────┤ UDP 47021
│  └───────────────────────┬─────────────────────────────────┘               │                        ▼
│                          │ Frame (transfer)                                │                  клиент в LAN
│                          ▼                                                 │
│  FramePlayer (prev/curr, интерполяция) ──► PixiRenderer (WebGL2)           │
│                          └──────────────► AudioEngine (Web Audio)          │
│                                                                           │
│  Client mode: WebSocket(ws://host:47020) ─► Frame ─► FramePlayer            │
│               InputCollector ─► bits ─► WebSocket                          │
└───────────────────────────────────────────────────────────────────────────┘
```

Режимы:

| Режим | Кто считает | Откуда Frame | Ввод |
|---|---|---|---|
| Solo / вдвоём на одном ПК | локальный воркер | воркер | обе раскладки с локальной клавиатуры |
| Host (LAN) | локальный воркер | воркер (и копия идёт в сеть) | P1 — локальная клавиатура; P2 — биты от клиента |
| Client (LAN) | никто (воркер не запускается) | WebSocket | локальная клавиатура → биты → хост |

**Сетевой путь у хоста.** Main создаёт `MessageChannelMain`, отдаёт один порт в renderer, а renderer передаёт его в воркер. После этого воркер и main общаются напрямую: воркер шлёт копию `Frame` в main, main пересылает её в `ws` и передаёт в воркер ввод клиента. Renderer в сетевом трафике не участвует.

## 2. Структура репозитория

```
CLAUDE.md
docs/                         спецификация и карточки задач
.env.example                  ORIGINAL_SWF=/Applications/Flash Games/alien-transporter.swf
reference/                    (gitignored, генерируется) as3/ — декомпиляция; data/ — XML из binaryData
vendor/original/              (gitignored) копия SWF
vendor/jpexs/                 (gitignored) JPEXS 26.3.0
tools/extract/                пайплайн: *.ts (Node) + java/SymbolInfo.java
assets/                       (gitignored, генерируется) gfx/{1x,2x,3x}/, sfx/, data/, manifest.json, sounds.json
src/engine/                   Anthill-TS (без DOM/Pixi)
  core/                       AntBasic, AntEntity, AntActor, AntAnimation, AntCamera, AntTileMap, AntMask, AntG, AntState
  ants/                       AntCore, AntFamily, AntNode, AntNodeList, AntNodePool, AntObject, AntSystem
  input/                      AntKeyboard, AntMouse, InputSnapshot, keyCodes
  plugins/                    AntPluginManager, AntTaskManager, AntTween, AntTransition
  signals/                    AntSignal, AntDeluxeSignal, ...
  utils/                      AntMath (+ PRNG), AntPoint, AntRect, AntColor, AntFormat, AntList
  sound/                      AntSound, AntSoundManager (логика громкости/панорамы → состояние каналов)
  effects/                    AntEffectManager, AntEffectEmitter, AntEffectParticle, ...
  lights/                     AntLight, AntLightEnvironment (данные)
  assets/                     AssetRegistry: manifest (метаданные кадров), levels, models, fonts, effects
src/physics/
  box2dweb/index.ts + box2d.d.ts   обёртка над npm-пакетом box2dweb@2.1.0-b (не патчить; хэш проверяется тестом)
  anthill/                    порт ru/antkarlov/anthill/plugins/box2d/**
src/game/                     порт ru/alientransporter/** — структура пакетов 1:1
src/frame/                    FrameWriter, FrameReader, типы, uid
src/sim/                      GameLoop, worker.ts, headless.ts, SaveStorage, InputRouter
src/render/                   FramePlayer, PixiRenderer, AtlasLoader, Letterbox, LightRenderer, PerfOverlay
src/audio/                    AudioEngine
src/net/                      protocol.ts, clientSession.ts, hostBridge.ts (worker-сторона), discoveryModel.ts
src/app/                      renderer entry: выбор режима, связка воркер/сеть/рендер/звук
electron/                     main.ts, preload.ts, save.ts, net/wsServer.ts, net/discovery.ts
tests/                        unit (рядом с кодом или tests/unit), golden/, e2e/
```

Границы слоёв проверяет ESLint `no-restricted-imports` в `eslint.config.js`:
- `src/{engine,physics,game,frame,sim,net/protocol.ts}` не импортируют `pixi.js`, `electron` и глобалы DOM (для `window`/`document` включено правило `no-restricted-globals`);
- `src/{render,audio,app}` не импортируют `electron` (только через `window.at`, который даёт preload);
- `electron/` не импортирует ничего из `src/render` и `src/audio`.

## 3. Игровой цикл (точно как в оригинале)

Оригинальный кадр — `Anthill.enterFrameHandler`, см. `reference/as3/ru/antkarlov/anthill/Anthill.as`:
```
AntG.elapsed = min(real, maxElapsed) * timeScale
update():  AntG.updateInput(); AntG.sounds.update(); state.preUpdate(); state.update(); state.postUpdate();
render():  камеры рисуют дерево сущностей (у Label и ElementSimulation в draw() есть побочная логика)
AntG.plugins.update():  плагины по порядку listOfActive (sort по priority, см. AntPluginManager.sortHandler)
           в G.init: physics.create() → start() → plugins.add(physics); затем plugins.add(core); plugins.add(music);
           AntTween и AntTaskManager добавляют себя сами, когда активны
```

Наш тик (`src/sim/GameLoop.ts`) повторяет этот порядок:
1. `AntG.elapsed = (1/35) * AntG.timeScale` — фиксированно, для детерминизма. В оригинале при стабильных 35 FPS было ≈ 0.02857.
2. `AntG.updateInput(snapshot)` → `AntG.sounds.update()` → `state.preUpdate/update/postUpdate`.
3. **Точка рендера:** `FrameWriter.write(scene)`. Побочную логику из оригинальных `draw()` (Label, ElementSimulation, MusicManager.draw) вызываем здесь, в том же порядке обхода.
4. `AntG.plugins.update()` — плагины в порядке `listOfActive` после AVM2-сортировки по приоритету (`sortAS3`). Кандидаты: `AntBox2DManager.update()` (`Step(1/40, 6, 15)` + `ClearForces()`), `AntCore.update()` (системы — тоже в порядке после AVM2-сортировки), `MusicManager`, твины и таски. Фактический порядок определяет код, его нужно залогировать в тесте T1.6 и зафиксировать эталоном.
5. Отправка `Frame`.

Важно: из-за порядка шагов `Frame` показывает состояние до физики текущего тика, как и оригинальный кадр. Не «исправлять».

**Воркер-луп:** `setInterval(pump, 4)`. `pump` добавляет в аккумулятор `performance.now() − last` и, пока аккумулятор ≥ 1/35 с, делает тик. За один `pump` не больше 3 тиков, остаток отбрасывается. На паузе (`G.gamePause`) тики продолжаются — пауза — это состояние игры, как в оригинале.

**Детерминизм:** при одинаковых сиде, вводе и сборке результат бит в бит одинаков. На этом держатся golden-тесты (`docs/05-verification.md`). Поэтому:
- никакого `Date.now()`/`performance.now()` внутри игровой логики;
- никакого `Math.random()`;
- итерация по `Map`/`Set` только там, где в оригинале был упорядоченный контейнер (`Dictionary` в AS3 не упорядочен — смотри по месту, как он используется);
- сортировки: только `sortAS3`/`sortOnAS3` (точная копия алгоритма avmplus), никогда не встроенный `Array.prototype.sort`. От этого зависит, например, порядок обновления систем (у всех `Priority = 0`) и плагинов (`04` §3).

## 4. Движок Anthill-TS

### Сцена
- `AntEntity` — данные: `x, y, angle` (градусы), `scaleX, scaleY, alpha, color` (0xRRGGBB, multiply), `blend: null|'add'|'overlay'|'screen'`, `visible, exists, active, children, parent`, `scrollFactor`, `origin`. Глобальный трансформ (`globalX/globalY/globalAngle`, масштаб) считается по алгоритму оригинала (`AntEntity.as`). Портируй его как есть.
- `AntActor` — анимация. `addAnimationFromCache(name)` берёт метаданные из `AssetRegistry` (число кадров, origin и размер каждого кадра в 1x). `play/stop/gotoAndStop/gotoAndPlay/playRandomFrame/currentFrame/animationSpeed/reverse/repeat` портируются 1:1. `width/height` берутся из метаданных кадра: игра их использует (UI, коллизии). Рисования нет.
- `AntTileMap` — узел со ссылкой на текстуру слоя уровня (`LevelNNBG_mc#0` и т.д.) и `scrollFactor`. Кеширование в тайлы не портируем, прогресс загрузки эмулируем мгновенным `eventComplete`.
- `AntCamera` — `scroll`, `shake(intensity, duration)` 1:1. `FrameWriter` сам применяет камеру так же, как оригинальный `draw` (`screen = global − camera.scroll × scrollFactor` + смещение тряски) и пишет в `Frame` **экранные** координаты 800×600. Рендерер о камере ничего не знает.
- `Label` (`ru/alientransporter/fonts/Label.as`) раскладывает глифы по метрикам растрового шрифта. В `Frame` каждый глиф — отдельный узел (`uid = entityId<<8 | glyphIndex`). Цвет (multiply) и blend берутся из Label.
- Каждая сущность при создании получает `entityId` (u24, монотонный счётчик, переполнение → заново с 1).

### ECS «ants»
Порт `ru/antkarlov/anthill/ants/*` 1:1: `AntCore` (системы, семейства, `getNodes(NodeClass)`, `addObject/removeObject`), `AntFamily`, `AntNode`, `AntNodeList`, `AntNodePool`, `AntObject` (компоненты по классу), `AntSystem`. Семейства строятся по полям класса Node. В AS3 это делалось через `describeType`, в TS нужна статическая декларация: у каждого Node-класса есть `static components = { shuttle: ShuttleControl, ... }`.

### Ресурсы (`src/engine/assets/AssetRegistry.ts`)
Загружает `assets/manifest.json` (метаданные кадров, без картинок), `assets/data/levels/*.json`, `models.json`, `fonts/*.json`, `effects.json`, `missions.json`, `texts.json`, `sounds.json`. Работает и в воркере, и в Node (для тестов). Источник данных — абстракция `AssetSource` (fetch в воркере, fs в Node).

## 5. Рендер (`src/render`)

- **PixiRenderer:** `Application` с `preference: 'webgl'`, `antialias: false`, `resolution: devicePixelRatio`, `autoDensity: true`. Корневой контейнер масштабируется так, чтобы 800×600 вписалось в окно с сохранением 4:3 (letterbox, чёрные поля).
- **Пул спрайтов по `uid`.** Каждый кадр: для каждого узла `Frame` берём или создаём `Sprite`, ставим текстуру по `texId`, `anchor` = origin/size кадра, `position`, `rotation`, `scale` = `nodeScale / assetScale`, `alpha`, `tint`, `blendMode`. Порядок отрисовки = порядок узлов (`zIndex` по индексу или перестановка `children`). Спрайты, которых нет в кадре, скрываются и возвращаются в пул.
- **Интерполяция (`FramePlayer`):** хранит `prev` и `curr`. `alpha = clamp((now − currArrivalTime) / (1000/35), 0, 1)`. Для узлов с `teleport` или без пары в `prev` — значения `curr`. Угол интерполируется по кратчайшей дуге. Режим Classic рисует `curr` без интерполяции. У клиента сети `FramePlayer` получает кадры из jitter-буфера (см. `03`).
- **Атласы:** `AtlasLoader` грузит группы из manifest для выбранного тира (`3x` / `2x` / `1x`). Группы `ui`, `game-common`, `shuttles`, `passengers`, `effects` грузятся при старте, `level-NN` — по полю `levelGroup` заголовка кадра; предыдущий уровень выгружается (`texture.destroy(true)`). Пока текстура не загружена, узел не рисуется.
- **Blend:** `add` нативно, `overlay` через `import 'pixi.js/advanced-blend-modes'`, `screen` нативно.
- **Свет (AntLight, «living lights») — это геймплей, а не только графика.** Лучи сенсоров считаются в симуляции (порт `AntLight.draw`, шаги `rayStep`/`angleStep`). Каждый луч останавливается на первом «непрозрачном» пикселе. Непрозрачные объекты — сущности, добавленные в `AntLightEnvironment` (в игре это `ShuttleView`, см. `Factory.makeShuttle`). Касание луча с кораблём вызывает `eventBeginTouch`/`eventEndTouch`, и от этого срабатывают ракеты. `isOpaque(x, y)` в порте проверяется по 1x альфа-маскам кадров (пайплайн, `02` §4.6) с обратным трансформом сущности. В `Frame` свет уходит узлом с `ext LIGHT`: полигон в экранных координатах и радиальный градиент (`colors/alphas/ratios`). `LightRenderer` рисует его через `Graphics` с `FillGradient` (radial) и blend узла; если `blur > 0`, добавляется `BlurFilter`.
- **Переходы экранов** (`FadeEffectShow_mc/FadeEffectHide_mc`, класс `FadeEffectView`) — обычная анимация AntActor: чёрная рамка с прозрачным скруглённым окном. Никаких масок не нужно, рисуется как обычный узел. Тир не выше 2x (overrides).
- **PerfOverlay (F3):** FPS, время тика (присылает воркер), размер `Frame` в байтах, число узлов, draw calls, RTT в сети.

## 6. Звук (`src/audio/AudioEngine.ts`)

- При старте декодирует все SFX (`decodeAudioData`) и музыку (3 трека).
- Из каждого `Frame`:
  - `oneShots` → сразу `AudioBufferSourceNode` → `StereoPannerNode` → `GainNode` → master;
  - `loops` (полный список активных каналов) → сверка с текущими: новые запустить (`loop = true`), отсутствующие остановить (fade 20 мс), у остальных плавно (`setTargetAtTime`, ~30 мс) обновить gain и pan;
  - музыка: `musicTrack`/`musicVol` из заголовка. Смена трека — кроссфейд 200 мс (если в оригинале MusicManager делает иначе — повторить его поведение).
- Громкость и панорама считаются в симуляции (порт `AntSound`/`AntSoundManager`), AudioEngine только исполняет.

## 7. Сохранения и настройки

- В симуляции `SaveStorage` — интерфейс `{ load(key): Promise<object|null>; save(key, obj): Promise<void> }`. В воркере он идёт через `postMessage` → renderer → `window.at.save.*` → IPC → `electron/save.ts`. В Node-тестах — in-memory реализация.
- Файлы: `app.getPath('userData')/save.json` (прогресс `GameData`) и `settings.json` (клавиши, fancy effects/quality, громкость, тир, classic, окно, последний IP/порт). Запись атомарная: `*.tmp` → `rename`.
- `--profile=N` в аргументах: `app.setPath('userData', <base>-profileN)`, нужен для теста двух экземпляров.

## 8. Ввод

- `InputCollector` (renderer) слушает `keydown`/`keyup` по **`event.code`** (физическая клавиша). Поэтому WASD работает в русской раскладке. `event.code` переводится во Flash keyCode через таблицу `src/engine/input/keyCodes.ts`; имена клавиш («UP», «W», «SPACEBAR», «ESC»…) берутся из `AntKeyboard.addKey` оригинала.
- Мышь: pointer → логические координаты 800×600 с учётом letterbox.
- Раз в тик renderer шлёт воркеру `InputSnapshot { keysDown: number[] (Flash keyCodes), mouseX, mouseY, mouseDown, wheel }`. Отправка — на каждое изменение и по `requestAnimationFrame`; воркер берёт последний.
- `InputRouter` (воркер) в режиме Host подменяет клавиши, назначенные P2 (`Config.keyP2Gas/Left/Right`), состоянием битов от клиента, а локальные нажатия этих клавиш игнорирует. Игровой код не меняется: P2 «нажимает» свои клавиши удалённо. Бит `pauseReq` от клиента превращается в однотиковое нажатие `P`.
- Горячие клавиши приложения (не идут в игру): F11 / Alt+Enter / ⌃⌘F — fullscreen, F3 — perf overlay.

## 9. Electron main и preload

- `BrowserWindow`: `backgroundColor: '#000'`, `webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false }`. Схема `app://` регистрируется через `protocol.registerSchemesAsPrivileged` (`standard`, `secure`, `supportFetchAPI`), чтобы `fetch` работал и из воркера. Размер по умолчанию — 80% высоты рабочей области при 4:3, размер и позиция запоминаются в `settings.json`. Минимум 800×600.
- `preload.ts` выставляет `window.at` (строго типизировано, `src/app/at.d.ts`):
  - `save.load(key)`, `save.write(key, data)`;
  - `settings.get()`, `settings.set(patch)`;
  - `app.toggleFullscreen()`, `app.openExternal(url)` (whitelist доменов авторов из Credits), `app.quit()`, `app.getLocalIPv4()`;
  - `net.hostStart(port)`, `net.hostStop()`, `net.onHostEvent(cb)`. MessagePort для воркера приходит в preload событием `ipcRenderer.on('sim-port')`. Из-за contextIsolation preload пробрасывает его в main world через `window.postMessage('sim-port', '*', [port])`, а `src/app` передаёт порт в воркер;
  - `discovery.startBeacon(info)`, `discovery.stopBeacon()`, `discovery.startScan()`, `discovery.stopScan()`, `discovery.onUpdate(cb)`.
- Ассеты грузятся через кастомный протокол `app://assets/...` (`protocol.handle`), а не через `file://`.
