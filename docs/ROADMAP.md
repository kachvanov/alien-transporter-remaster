# ROADMAP — задачи, зависимости, параллельность

Одна карточка — одна сессия агента. Файлы карточек: `docs/tasks/<ID>-<slug>.md`. Отметки `[x]` + хэш merge-коммита ставит **только оркестратор** (`/orchestrate`); текущее состояние — в `docs/STATUS.md`. Как это запускать — `docs/ORCHESTRATION.md`.

Размеры: **S** — до ~300 строк или конфигурация; **M** — ~300–1000; **L** — ~1000–2000 (если выходит больше, раздели и отметь в отчёте).

## M0 — Фундамент и извлечение

| | ID | Задача | Зависит от | Размер |
|---|---|---|---|---|
| [x] | T0.1 | Каркас репозитория (electron-vite, TS, ESLint-границы, Vitest, Playwright, скрипты) `a3c363e` | — | M |
| [x] | T0.2 | JPEXS + декомпиляция → `reference/` `05e22c1` | T0.1 | S |
| [x] | T0.3 | `SymbolInfo.java` в пайплайне → `symbols.json`, `placements.json` `aec4b79` | T0.2 | S |
| [x] | T0.4 | Растеризация спрайтов, whitelist/blacklist, trim/dedupe, атласы, `manifest.json`, альфа-маски `9c63578` | T0.3 | L |
| [x] | T0.5 | Звуки → OGG + `sounds.json`, проверка лупов `91f3ce0` | T0.3 | S |
| [x] | T0.6 | Шрифты, миссии, тексты, эффекты → JSON + zod `7437cf7` | T0.2 | M |
| [x] | T0.7 | Уровни и модели → JSON + оверлей-проверка `51b5de0` | T0.4 | M |
| [x] | T0.8 | Dev Asset Viewer `18550ca` | T0.4, T0.7 | M |

## M1 — Вертикальный срез: Level01 играбелен (соло и вдвоём)

| | ID | Задача | Зависит от | Размер |
|---|---|---|---|---|
| [x] | T1.1 | Утилиты Anthill: AntMath/PRNG, geom, сигналы, плагины (Task/Tween), AS3-хелперы, int-report `8189ffe` | T0.1 | M |
| [x] | T1.2 | Сцена: AntBasic/Entity/Actor/Animation/Camera/TileMap/State, AntG, ввод, AssetRegistry `1ef4970` | T1.1, T0.4 | L |
| [x] | T1.3 | ECS «ants» `9135dae` | T1.1 | M |
| [x] | T1.4 | Физика: box2dweb + порт Box2D-for-Anthill + ModelManager `11f462c` | T1.2, T0.7 | L |
| [x] | T1.5 | Формат `Frame`: writer/reader/uid/teleport `f80ee62` | T1.2 | M |
| [x] | T1.6 | Sim runtime: GameLoop 35 Гц, worker, headless, SaveStorage, InputRouter `b030894` | T1.2, T1.3, T1.5 | M |
| [x] | T1.7 | Electron shell + Pixi-рендер + FramePlayer + letterbox + атласы + ввод `503ec59` | T1.5, T0.4 | L |
| [x] | T1.8 | Звук: порт AntSound/AntSoundManager + AudioEngine `211b2c0` | T1.2, T0.5, T1.7 | M |
| [x] | T1.9a | Порт данных игры: Config/G/Assets/Models/AvailKeys, data/, components/, tags/, nodes/ `bc2150c` | T1.3, T1.4 | L |
| [x] | T1.9b | Порт map/, levels/, models/ (ClipProxy, Factory, Ground, LevelCore) `257fb53` | T1.9a, T0.7 | L |
| [x] | T1.9c | Системы Control/Shuttle/Health/Render/Station + ShuttleView и соседние view `8a6fd9f` | T1.9b | L |
| [x] | T1.9d | ai/, системы Passenger/Spawn/Trigger/Portal/Goal + PassengerView `32bb860` | T1.9b | L |
| [x] | T1.9e | GameState (слои), Label/шрифты, HUD (UISystem) → **Level01 играбелен** `3476088` | T1.9c, T1.9d, T1.6, T1.7, T1.8, T0.6 | L |

**✅ M1:** `npm run dev -- --start-level=Level01`. Шаттл летает, садится, топливо тратится и заправляется, пассажиры садятся и выходят, портал открывается, звук есть. P2 входит клавишей W. Заглушки помечены `STUB(Txx)`.

## M2 — Полный порт

| | ID | Задача | Зависит от | Размер |
|---|---|---|---|---|
| [x] | T2.1 | Системы Magnet/Missile/Ragdoll/Sensor/ObjectSpawn/Menu + оставшиеся views | M1 | L |
| [x] | T2.2 | elements/: PhysicalMap + ElementSimulation (дым/огонь/нефть) | M1 | M |
| [x] | T2.3 | Эффекты частиц (AntEffect*) + StaticEffect | M1 | M |
| [x] | T2.4 | Living lights: AntLight/Environment (лучи, касания, альфа-маски) + рендер | M1 | M |
| [x] | T2.5 | ui/ (все view) + полный Label | M1 | L |
| [x] | T2.6 | screens/ + PrepareState + переходы, без спонсорских элементов | T2.5 | L |
| [x] | T2.7 | Миссии, контент и анлоки, MusicManager/Sounds, пауза и настройки, Casual/Hardcore | T2.6 | M |
| [x] | T2.8 | Сохранения и настройки (`save.json`/`settings.json`), Classic 35 fps, тир графики | T2.7 | M |

T2.1–T2.5 идут параллельно (2–3 агента). T2.1 может временно опираться на `STUB(T2.3)` для эффектов.

**✅ M2:** все 20 уровней проходятся; гараж (корабли, цвета, переназначение клавиш), миссии, звёзды и анлоки работают; прогресс переживает перезапуск; вдвоём на одном ПК работает; `grep -r "STUB(" src` пусто.

## M3 — Игра по LAN

| | ID | Задача | Зависит от | Размер |
|---|---|---|---|---|
| [x] | T3.1 | `net/protocol`: handshake, input, коды, тесты | T1.5 | S | (merge 35d0c3c)
| [x] | T3.2 | Хост: ws-сервер в main, MessagePort-мост воркер↔main, heartbeat | T3.1, T1.7 | M | (merge 9d3ec9b)
| [x] | T3.3 | Клиент: WebSocket, jitter-буфер, ввод, обрывы, оверлей | T3.1, T1.7 | M | (merge ecdf411)
| [x] | T3.4 | Экраны Online (Host/Join, ввод IP, список игр) в стиле оригинала | T2.6, T3.5 | M | (merge 58d9698)
| [x] | T3.5 | UDP-автопоиск | T1.7 | S | (merge 474cac7)
| [x] | T3.6 | Интеграция в игру: удалённый P2, корабль клиента, уход P2, пауза | T3.2, T3.3, T3.4, T2.8 | M | (merge cbdbf76)
| [ ] | T3.7 | Сетевые тесты, latency-proxy, macOS/Windows сетевые разрешения | T3.6 | S |

T3.1, T3.2, T3.3, T3.5 можно начинать параллельно с M2.

**✅ M3:** чек-лист из `05-verification.md` §8 пройден, включая связку Mac ↔ Windows.

## M4 — Верность, оптимизация, сборки

| | ID | Задача | Зависит от | Размер |
|---|---|---|---|---|
| [ ] | T4.1 | Запись ввода и golden replays (headless) | T1.9e (расширять по мере M2) | M |
| [ ] | T4.2 | Сверка с оригиналом: визуальная (pixelmatch vs Ruffle) и поведенческая (кадры) | T2.8 | M |
| [ ] | T4.3 | Оптимизация симуляции без изменения golden-хэшей + perf-лог | T4.1, T2.8 | M |
| [ ] | T4.4 | Тиры графики и бюджет памяти (Windows) | T2.8 | S |
| [ ] | T4.5 | Сборка macOS (dmg arm64, иконка, ad-hoc подпись, Info.plist) | T2.8, T3.6 | S |
| [ ] | T4.6 | Сборка Windows (NSIS + portable x64; кросс-сборка или GitHub Actions) | T2.8, T3.6 | S |
| [ ] | T4.7 | README для пользователя (RU): установка, LAN, фаервол | T4.5, T4.6, T3.7 | S |

**✅ M4:** бюджеты из `05` §9 выполнены на обеих машинах; dmg и exe установлены и работают; LAN между собранными версиями работает.

## Критический путь

T0.1 → T0.2 → T0.3 → T0.4 → T1.2 → T1.4 → T1.9a → T1.9b → T1.9c/d → T1.9e → T2.5 → T2.6 → T2.7 → T2.8 → T3.6 → T4.5/T4.6.

## Правила для заглушек

Если задаче нужна функциональность из будущей задачи, ставь минимальную заглушку с комментарием `// STUB(T2.3): эффекты взрыва` (grep-абельно). Заглушка не должна менять порядок вызовов: вызов остаётся, пустеет только тело. Задача, которая реализует функциональность, обязана убрать свои `STUB(<её ID>)`.
