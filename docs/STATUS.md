# STATUS — состояние работ (ведёт только оркестратор `/orchestrate`)

Обновлено: 2026-09-29 · Последний merge: T1.3 9135dae

## В работе
| ID | попытка | ветка | worktree | запущено |
|---|---|---|---|---|
| T1.4 | 1 | worktree-agent-a8821463d2b3140f0 | .claude/worktrees/agent-a8821463d2b3140f0 | 2026-09-30 13:48 |

## Ворота
| Милстоун | статус |
|---|---|
| M1 | не достигнут |
| M2 | не достигнут |
| M3 | не достигнут |
| M4 | не достигнут |

## Нужно от тебя
—

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
- 2026-09-30 T1.3 merged 9135dae (попытка 1)
- 2026-09-30 T0.5: лупы прослушаны пользователем, всё ок

## Заметки оркестратора
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
