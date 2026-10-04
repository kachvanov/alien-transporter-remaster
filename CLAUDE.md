# Alien Transporter Remaster — правила для агентов

Это ремастер Flash-игры **Alien Transporter v1.3.0** (Anton Karlov, 2016). Он собирается для macOS arm64 и Windows 10 x64 на Electron, TypeScript, PixiJS и box2dweb. Цель — **максимальная верность оригиналу**: та же графика, те же уровни, та же физика. Сверх оригинала добавляется только LAN-мультиплеер и технические улучшения (GPU-рендер, плавность 60/120 Гц, HD-графика).

Перед любой задачей прочитай:
1. `docs/00-overview.md` — что делаем и почему.
2. `docs/ROADMAP.md` — где твоя задача в общем плане и от чего она зависит.
3. Свою карточку `docs/tasks/<ID>-*.md`.
4. Документы, на которые ссылается карточка: `01-architecture`, `02-extraction-pipeline`, `03-frame-and-network-protocol`, `04-porting-guide`, `05-verification`.

## Главные правила

1. **Источник истины — `reference/as3/`** (декомпилированный оригинал). Мы портируем, а не пишем заново. Имена классов, методов и полей, порядок операций, константы, «магические числа» и порядок вызовов сохраняются. Геймплей, баланс, тайминги и формулы не «улучшаем» и не «чиним», даже если выглядит странно.
2. В шапке каждого портированного файла пиши: `// Port of <путь в reference/as3>` (например `// Port of ru/alientransporter/systems/ShuttleSystem.as`).
3. **Целочисленная семантика AS3.** Если переменная, поле или параметр объявлены как `:int` или `:uint`, любое присваивание в них усекает значение. В TS пиши `x | 0` (int) или `x >>> 0` (uint) в **каждом** таком месте. Подробности в `docs/04-porting-guide.md`.
4. `Math.random()` запрещён в `src/engine`, `src/game`, `src/physics`, `src/sim`. Используй только `AntMath.random*()` (сидируемый PRNG).
5. **Границы слоёв** (ESLint их проверяет):
   - `src/engine`, `src/physics`, `src/game`, `src/frame`, `src/sim` — чистый TS. Нельзя импортировать `pixi.js`, `electron`, DOM API (`window`, `document`, `AudioContext` и т.п.).
   - `src/render`, `src/audio` работают только в renderer-процессе.
   - `electron/` — только main/preload (Node API).
6. Box2D — npm-пакет `box2dweb@2.1.0-b` (точная версия, SHA-256 файла проверяется тестом). Не патчить (никаких `patch-package`), не копировать в `src/`, не заменять другим движком. Это эталонный Box2D 2.1a.
7. Новые npm-зависимости добавляй только с обоснованием в отчёте. Версии фиксируй точно (без `^`).
8. Не делай работу за пределами своей карточки. Если нашёл проблему в другом месте, опиши её в отчёте в разделе «Замечания вне задачи».
9. Не удаляй и не переписывай тесты, чтобы они «прошли». Если тест неверен, объясни почему в отчёте.

## Как организована работа (оркестратор и исполнители)

- Работу ведёт оркестратор (`/orchestrate`, `.claude/skills/orchestrate/SKILL.md`). Исполнители — субагенты `porter` (`.claude/agents/porter.md`), каждый в своём git worktree в `.claude/worktrees/…`, в своей ветке.
- **`docs/ROADMAP.md` и `docs/STATUS.md` редактирует только оркестратор.** Исполнитель не трогает их, `docs/tasks/**`, `CLAUDE.md` и `.claude/**`.
- В worktree папки `node_modules`, `vendor`, `reference`, `assets`, `build` — симлинки на основную копию, общие для всех. Не удалять, `npm ci` не запускать.
- Путь к SWF берётся из переменной окружения `ORIGINAL_SWF`: она задана в `.claude/settings.json`; запасные варианты — `.env`, затем путь по умолчанию `/Applications/Flash Games/alien-transporter.swf`.
- Любые инструменты (tsc, eslint, vitest, playwright, electron-builder) обязаны игнорировать `.claude/**`: там лежат worktree других агентов.

## Команды

```bash
npm install
npm run extract        # SWF → reference/ и assets/ (нужны Java 17 и ffmpeg; путь к SWF — env ORIGINAL_SWF)
npm run dev            # запуск игры в dev-режиме
npm run check          # tsc --noEmit + eslint + vitest run  ← должен быть зелёным в конце КАЖДОЙ задачи
npm run test:e2e       # Playwright + Electron (smoke)
npm run viewer         # Dev Asset Viewer (анимации, уровни, оверлеи)
npm run build:mac      # dmg arm64
npm run build:win      # nsis + portable x64
```

## Определение «готово» для задачи

- Все критерии приёмки из карточки выполнены и проверены (команды и вывод — в отчёте).
- `npm run check` зелёный.
- Новая логика покрыта тестами. Портированная чистая логика тоже: хотя бы smoke-тест, который её конструирует и вызывает `update()`.
- Сделан коммит с сообщением `T<ID>: <кратко>`.
- Отчёт в конце сессии: что сделано; отклонения от оригинала и почему; что осталось или требует внимания; замечания вне задачи.

## Git

- Коммит на каждую задачу. Автор всегда из глобального git config: **никогда** не используй `--author`, `-c user.name`, `GIT_AUTHOR_*`.
- Не добавляй в коммиты `Co-Authored-By`, `Claude-Session` и «Generated with Claude Code».
- В git не попадают: `vendor/original/`, `vendor/jpexs/`, `assets/`, `build/`, `reference/` (они генерируются командой `npm run extract`; ассеты оригинала принадлежат автору и не публикуются).

## Лицензия и ассеты

Оригинальные ассеты и код принадлежат Anton Karlov. Проект личный, для собственного использования. Не публикуй сборки и ассеты, не заливай их в публичные репозитории.
