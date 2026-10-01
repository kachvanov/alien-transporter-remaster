# STATUS — состояние работ (ведёт только оркестратор `/orchestrate`)

Обновлено: 2026-10-01 · Последний merge: T0.6 7437cf7

## В работе
| ID | попытка | ветка | worktree | запущено |
|---|---|---|---|---|
| T1.9e | 1 | (worktree-agent, ветка уточнится) | .claude/worktrees/… | 2026-10-01 15:05 |

## Ворота
| Милстоун | статус |
|---|---|
| M1 | не достигнут |
| M2 | не достигнут |
| M3 | не достигнут |
| M4 | не достигнут |

## Нужно от тебя
- (не блокирует) T0.8: запусти `npm run viewer` и глянь: Coin_mc (origin по центру), корабль, уровень 01 с оверлеем коллизий — совпадает ли с картинкой.

## Заблокировано
—

## Журнал
- 2026-09-29 — пакет документов и настройка оркестрации созданы (Opus). Следующая задача: T0.1.
- 2026-09-30 T0.1 merged a3c363e (попытка 1)
- 2026-09-30 T0.2 merged 05e22c1 (попытка 1)
- 2026-09-30 T0.3 merged aec4b79 (попытка 1)
- 2026-09-30 T0.4 merged 9c63578 (попытка 1)
- 2026-09-30 T1.1 merged 8189ffe (попытка 1)
- 2026-09-30 T0.7 merged 51b5de0 (попытка 1)
- 2026-09-30 T1.2 прервана лимитом сессии (до коммита, правки остались в worktree) — возобновляю того же агента
- 2026-09-30 T0.5 merged 91f3ce0 (попытка 1)
- 2026-09-30 T1.2 merged 1ef4970 (попытка 1, возобновлена после лимита)
- 2026-09-30 T1.9a merged bc2150c (попытка 1)
- 2026-09-30 T1.7 merged 503ec59 (попытка 1)
- 2026-09-30 T1.5 merged f80ee62 (попытка 1)
- 2026-09-30 T1.4 merged 11f462c (попытка 1)
- 2026-09-30 T1.3 merged 9135dae (попытка 1)
- 2026-09-30 T1.6 merged b030894 (попытка 1)
- 2026-09-30 T1.8 merged 211b2c0 (попытка 1)
- 2026-09-30 T1.9b merged 257fb53 (попытка 1; check красный из-за параллельного FIX-1 в общих build/assets — перепроверить после мержа FIX-1)
- 2026-09-30 FIX-1 merged 626217d (models.json 53 клипа; check зелёный: 558 тестов)
- 2026-09-30 T0.6 merged 7437cf7 (попытка 1; check зелёный: 570 тестов)
- 2026-09-30 T0.5: лупы прослушаны пользователем, всё ок
- 2026-10-01 T1.9c merged 8a6fd9f (попытка 1; check зелёный: 587 тестов)
- 2026-10-01 T1.9d merged 32bb860 (попытка 1; конфликты G.ts/GoalSystem/PassengerView разрешены; check зелёный: 626 тестов)
- 2026-10-01 T0.8 merged 18550ca (попытка 1; check зелёный: 631 тест)
- 2026-10-01 T1.7 (плавность 120 Гц, classic 35 fps) и T1.8 (звук) проверены пользователем, всё ок

## Заметки оркестратора
- T0.8: `npm run viewer` (порт 5174, VIEWER_NO_OPEN=1 отключает автооткрытие); скриншоты — `CHROMIUM_PATH=… npx tsx tools/viewer/shots.ts` (Playwright 1.63 ждёт chromium_headless_shell-1243, в кэше только 1228 — для test:e2e может понадобиться `npx playwright install`). Zone-классы в оверлее — крупные полупрозрачные прямоугольники, использовать галочки по классам.
- T1.9d: стабы для T1.9e: STUB(T1.9e) ui/PassengerBarUIView.ts (GoalSystem), STUB(T2.1) systems/MenuSystem.ts (константы экранов, switchScreen — нужны PortalSystem). Каждая система обязана иметь `static readonly className` (G.gamePause ищет по нему; T2.1 — Ragdoll/Magnet/ObjectSpawn). ContentManager-стаб (T2.7): isUnlocked=true для стартовых ключей (shuttleOrange, shuttleRed, shuttle01, passengerGreen, passengerBasic). PassengerSystem: локальный каст ShuttleViewCargo можно убрать (ShuttleView теперь настоящий). tests/golden/scripts/level01-deliver.ts — скриптовый пилот (двойники Render/Station помечены STUB(T1.9c), убрать в T1.9e/T4.1). Тесты с несколькими играми: AntG.plugins = new AntPluginManager().
- T1.9c: при мерже T1.9d ожидаются конфликты add/add в src/game/views/PassengerView.ts и src/game/systems/GoalSystem.ts — брать версию T1.9d (в ней настоящие COLOR_*/LOVE/ATTENTION/FAIL, showNotify, track). G.ts: gamePause ищет системы по static className (импорты систем убраны ради разрыва цикла Display→ShuttleView→G→ShuttleSystem→ShuttleNode) — T1.9d/e не возвращать статические импорты систем в G. Priority.* все 0, порядок систем после sortAS3 = порядку добавления в GameState.as:165–181 (зафиксирован тестом). T1.9e: в GameState слои надо add() в state, иначе тела не обновляются. Тесты, вызывающие G.init() много раз, должны делать AntG.plugins = new AntPluginManager() (иначе недетерминизм). ShuttleSystem.removeFromCore: порядок строк изменён (баг оригинала TypeError), помечено DEVIATION. В Level01 нет топливных станций — оригинал. STUB(T2.2) fireSimulation.pour/smokeSimulation.pour2.
- T0.6: assets/data/{fonts/fontXX.json, missions, texts, effects}.json; схемы FontSchema/MissionsSchema/TextsSchema/EffectsSchema в src/engine/assets/schemas.ts (типы FontData, MissionsData, TextsData, EffectsData) — T1.9e/T2.3/T2.7; AssetRegistry пока отдаёт AnyObject — типизировать там. Из CacheList в манифесте нет 7 клипов (Background_mc, PortalParticle_mc, MagicFlyGreen/Yellow_mc, MagicLeafPurpleA/YellowA_mc, SparkGreen_mc) — T2.3 должна пропускать отсутствующие при кешировании. texts_en.xml имеет lang="ru" (оставлено 1:1). Числовые атрибуты missions/effects остаются строками.
- T1.9b: ES-цикл модулей: G больше не импортирует LevelManager (G.levelManagerClass ставит сам LevelManager при загрузке) — GameState (T1.9e) ОБЯЗАН импортировать levels/LevelManager и содержать smokeSimulation/fireSimulation/oilSimulation/lightEnvironment. Когда G.gamePause начнёт тянуть настоящие системы (T1.9c/d/e), цикл G↔системы↔узлы↔компоненты вернётся: резать ребро (регистрация pauseSystem снаружи) или сделать `components` узлов ленивыми. Заглушки views STUB(T2.1): Rock/SmallBox/BigBox/Barrel/House/Coin/Bonus/TransporterWheel/Indicator/Missile/Blinker/Sensor/Tutorial; STUB(T1.9c) ShuttleView, HealthSystem.applyExplosionDamage; STUB(T1.9d) PassengerView, PassengerLogic/PassengerSense; STUB(T1.9e) UISystem, GameState. LevelCore: слои — имена символов; Level01..20 — фабрика levelClass(n). Сохранены баги: ShuttleModel.shuttleColor читает кадр левого двигателя; dropCoins(n) создаёт n монет; progress загрузки 100+100/3. Тесты с AntBox2DBody: G.physics.stop() перед новым G.init в том же файле. Skew-объекты (406): размер из JSON при rotation 0, сверка с Ruffle в T4.2. PassengerModel.createRagdoll падает на null-модели, пока нет FIX-1. symbols.test.ts («53 clips» → 73 в общем build) править вместе с FIX-1.
- T1.8: AntSoundManagerStub удалён, AntG.sounds настоящий. Звук в Frame: источник или повторы>1 → loops (стабильный channelId), иначе oneShots. SOUND_COMPLETE эмулируется (AntSound.TICK_MS). Sounds.init() зовёт сейчас TestState — T1.9e (GameState.create) должен звать сам; Music.as не портирован — T2.7 (MusicManager со своим AntSoundManager, затем `collectFrameAudio(AntG.sounds, G.music.manager, G.music.mute)` в GameLoop.renderFrame, STUB(T2.7)). Проверить, что порты не передают число вместо Boolean в play(..., aLoop). Ручная проверка на слух (не блокирует): `unset ELECTRON_RUN_AS_NODE; npm run dev` — звук движка, панорама, перезапуск ~6.4 с без щелчков. Prettier в check не входит.
- T1.6: src/sim/TestState.ts и TestScene.ts (+ тест в render.test.ts) — временные, удалить после T1.9e. headless.ts в tsconfig.node.json. Добавлено сообщение воркера {t:'saveLoad',key}. STUB(T3.2): simPort в worker.ts; STUB(T4.1): запись ввода только в памяти (GameLoop.lastRecording). GameData.storage — глобальная статика (каждый GameLoop перезаписывает). SAVE_KEY vs save.json — согласовать в T2.8.
- Пользователь попросил завершить сессию: после T1.9a остановлено. Следующая по плану: T1.6 (sim runtime; конфликт в src/app/main.ts — см. T1.7).
- В окружении агентов задан `ELECTRON_RUN_AS_NODE=1`: для `npm run dev`/ручного запуска Electron нужен `unset ELECTRON_RUN_AS_NODE` (в e2e уже вычищается).
- Electron 44 не качает бинарь в postinstall: после `npm install` выполнять `node node_modules/electron/install.js` (в основной копии сделано).
- Версии из T0.1: TS 6.0.3 (peer typescript-eslint), vite 7.3.6 (peer electron-vite 5).
- T0.4: FadeEffectShow/Hide_mc имеют maxTier 1x (бюджет атласов на 2x недостижим) — обоснованное отклонение от docs/02. Порядок битов альфа-маски: MSB слева.
- T1.1: `sortAS3`/`sortOnAS3` (порт avmplus ArraySort, проверен golden-тестом на 418 кейсах) обязательны для AntCore.updatePriority, AntEntity.sort и Vector.sort. Заглушка `STUB(T1.2)`: src/engine/core/AntGStub.ts — T1.2 заменяет её на настоящий AntG в 4 файлах. Решить в T1.2, нужен ли flash.geom.ColorTransform (AntActor, AntMask). Проверить, что AntEntity реализует IBubbleEventHandler.
- T0.7: 406 объектов уровней имеют skew матрицы (размер считается по scaleX/scaleY) — при расхождении физики в T1.9b сверять с Ruffle. Level13 шире 800×600 (x от −102 до 2516) — решение за LevelCore. Ожидают очереди M0: T0.5, T0.6, T0.8.
- T0.5: в ffmpeg нет libvorbis → звуки сохранены как FLAC (assets/sfx/*.flac, 16 МБ), а не OGG; поле `file` в sounds.json хранит реальное имя, Chromium decodeAudioData читает FLAC. Если нужен OGG (~3 МБ) — поставить ffmpeg с libvorbis, шаг пересоберётся сам. SndEngineGas и SndLowFuelAlarm НЕ лупы (по коду: 999 попадает в Boolean `unique`) — docs/02 §5 неточен; зацикливание решает порт ShuttleSystem. Алиасы `EngineGas_snd` и др. → SndEngineGas и т.д. (Sounds.as initEmbedded) — нужна таблица в аудио-слое (T1.8). Половина звуков стерео, вся музыка.
- T1.2 → задачам далее: STUB(T1.8): src/engine/core/AntSoundManagerStub.ts (AntG.sounds). T1.5: камера/тряска — только scroll; AntActor.draw() содержит updateBounds() (влияет на hitTest/onScreen) — FrameWriter вызывает state.draw(camera) или делает updateBounds сам; флаг teleport = AntEntity.justReset. T1.6: звать AntBasic.resetEntityIds() при старте; FileAssetSource(root, readFile) в Node, FetchAssetSource(baseUrl) в воркере. Поле снимка ввода: `wheelDelta` (в docs/01 §8 названо `wheel`). AssetRegistry возвращает levels/models/fonts/effects/missions/texts как AnyObject — типизировать схемами из T0.6/T0.7. AntMask не портирован (игра не использует), ColorTransform не добавлен (Label в T1.9e решит).
- T1.2 отклонения: Anthill.tick рисует «update, затем draw» для нескольких камер (у оригинала покамерно; при одной камере совпадает); AntCamera.shake теперь тянет один AntMath.random (сдвиг PRNG относительно оригинала неизбежен по правилу 4).
- Гонка: параллельные M0-задачи перегенерируют assets/gfx, и тесты в другой задаче могут падать на этом; при красном check — перезапустить `npm run extract`.
- T1.3: ВАЖНО для GameState (T1.9e) и T4.2: все `Priority.*` = 0 (проверено grep, присваиваний нет), поэтому порядок update 18 систем определяет нестабильный Array.sort Flash; `AntCore.updatePriority` использует `sortAS3` (воспроизводит его, покрыт тестом) — порядок НЕ равен порядку addSystem (напр. для 8 систем: e,b,c,d,a,f,g,h). Не «чинить». Сверить порядок систем с Ruffle в T4.2 (риск: декомпилятор мог потерять статический инициализатор Priority). Node-классы: `static override readonly components = {поле: Класс}` вместо describeType; `AntObject.get<T>()` типизирован как T.
- T1.4: `_allowSleep` в оригинале нигде не присваивается → doSleep=false, тела не засыпают; сохранено (не включать сон). Эталон падающего ящика — из самого box2dweb, не из Flash (сверка с Ruffle — T4.2). AntBox2DDrawer заменён на `collectDebugLines` (Float32Array, 5 float/линия). ClipProxy в src/engine/assets/ClipProxy.ts (для T1.9b). AntModelManager: компонент-класс — строка-имя (`registerShapeComponent`). `electron.vite.config.ts` получил optimizeDeps.include=['box2dweb'] — проверить при первом `npm run dev` (T1.7). Сохранён баг оригинала: сеттер friction.
- T1.5: экранные координаты = global + scroll×scrollFactor (плюс, как в оригинале; в docs/03 было минус). Сущности со своим draw() (Label, AntLight, ElementSimulation…) реализуют `writeFrame(sink: FrameSink)` из src/frame/types.ts и сами выполняют побочные эффекты оригинального draw() — напомнить в T1.9e/T2.2/T2.4/T2.5. FrameScene (root, camera, tick, audio, debugLines, levelGroup) собирает GameLoop в T1.6. Тесты с камерой: сначала new AntCamera, потом AntBasic.resetEntityIds(). Debug-линии — последний узел uid=0. Origin AntTileMap-слоя проверить при интеграции уровней (T1.9b).
- T1.7 → T1.6: возможен конфликт в src/app/main.ts — заменить источник кадров testWorker (src/sim/TestScene.ts, testWorker.ts — временные) на SimClient, кадры в player.push(buffer, performance.now()). src/sim/worker.ts T1.7 не трогала. Заглушки: STUB(T2.4) ext LIGHT/DEBUG_LINES не рисуются; STUB(T2.8) save/settings/window.json. Отклонение: anchor/scale считаются в растре тира (точнее формулы карточки). openExternal whitelist: zombotron.com, ahuraster.com (уточнить в Credits). Вне задачи: нет CSP в index.html (отдельной задачей, с app: и worker-src); overlay-blend не проверен на реальных узлах; e2e оставляет каталог userData `*-profilee2e`.
- FIX-1 выполнена: причина — regex размещений в SymbolInfo.java (`.*Ragdoll_mc` не ловил `Ragdoll0N_mc`); теперь placements = 73 клипа (20 уровней + 53 модели), models.json = 53. Новый FragBandage_mc принят схемой. В карточках T0.7/T1.x осталось число «33 модели» (не править).
- T1.9a: карточка неточна: PlayerData.toObject НЕ сохраняет coins/lives (только name и 4 поля корабля); расход топлива = fuelRate*AntG.elapsed, от casual/hardcore не зависит (зависят strafeForce 0.3/0.15 и steeringSpeed 10/80). SAVE_KEY="alientransporter" в GameData.SAVE_KEY (T2.8 говорит про save.json — согласовать). AvailKeys.keys: Record (KeyInputPopupView в T2.5 ходит по availKeys.keys). Фабрики T1.9b: модель в obj.add() — экземпляр точного класса ShuttleModel/MissileModel/PassengerModel; у PassengerModel не должно быть hitPoint/hitForce/hasHit. CargoHold.unloadCargo — цикл без декремента как в оригинале. Заглушки STUB(T1.6,T1.8,T1.9b/c/d/e,T2.1,T2.3,T2.7) в src/game/** — при мерже конфликты add/add: брать версию владельца задачи (AntSoundManagerStub — версию T1.8). В manifest.json нет 7 спонсорских кнопок Btn* — оставлено 1:1. Тесты нодов используют Object.create(prototype).
