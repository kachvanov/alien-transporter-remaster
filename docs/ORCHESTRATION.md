# How to run the agents (for you, not for the agents)

## Overview

- **You** start one Claude Code session in this folder and type `/orchestrate`.
- The **orchestrator** (this session) takes ready tasks from `docs/ROADMAP.md`. For each one it launches an **executor** `porter`: a Sonnet subagent that works in its own copy of the repository (a git worktree) and its own branch. Up to 2 executors work at the same time.
- An executor does one task card, runs the tests, commits and reports. The orchestrator checks the report, merges the branch into `main`, marks `[x]` in ROADMAP and immediately launches the next task.
- The orchestrator stops by itself in only three cases:
  1. a milestone (M1–M4) is finished — your short manual check is needed;
  2. a task needs a human (a Windows laptop, screenshots from Ruffle, a decision);
  3. a task has failed twice.

  Everything it needs from you it writes as a list at the end and in `docs/STATUS.md` ("Needed from you").

## What you do

1. Open the project folder in VS Code → Claude Code.
2. Type `/orchestrate` (or `/orchestrate 1` to have a single executor).
3. Go about your business. The orchestrator wakes up by itself when an executor finishes.
4. When the orchestrator has stopped, read its final message, do the "Needed from you" items and type `/orchestrate` again. At a milestone gate it will ask a question with the buttons "All OK / There are problems".

If the session closed, crashed or hit the limit, no problem: the state is kept in `docs/STATUS.md` and in git. A new session + `/orchestrate` continues from the same place and picks up abandoned branches.

## About the Pro plan ($20)

- Pro limits are counted in 5-hour windows and per week. Parallel executors **do not increase** the total amount of work within the limit: they just use up the window faster and save wall-clock time. If the limit runs out too quickly, launch `/orchestrate 1`.
- `autoContinueAtUsageLimit` is enabled in `.claude/settings.json`: on hitting the limit the session waits for the reset and continues by itself. If that does not work (the setting may be read only from user settings), enable it in `/config` or simply repeat `/orchestrate` after the reset.
- Executors are always on Sonnet (set in `.claude/agents/porter.md`). The orchestrator itself runs on the session's model, and yours defaults to Opus. The orchestrator uses little, but if the limit is tight, switch the session to Sonnet: `/model sonnet`.
- Order of magnitude: ~43 tasks, the biggest being the port of the game code (tens of thousands of lines). Realistically that is **many 5-hour windows**, stretched over weeks. The most valuable control point is M1 (the first level is playable): it shows right away whether everything is heading the right way.

## Where things are

| File | Purpose |
|---|---|
| `.claude/skills/orchestrate/SKILL.md` | the orchestrator's instructions (`/orchestrate`) |
| `.claude/agents/porter.md` | the executor's instructions (Sonnet model) |
| `.claude/settings.json` | permissions (no needless prompts), worktrees from the current `main`, shared folders via symlinks, SWF path, auto-continue after the limit, no Co-Authored-By |
| `docs/STATUS.md` | what is in progress, what is waiting for you, the log |
| `docs/ROADMAP.md` | all tasks and dependencies, `[x]` marks |

## If something goes wrong

- To see what the executors are doing: the agents panel in Claude Code (or `/agents`).
- To stop everything: interrupt the session. Then `/orchestrate` will pick up the state.
- A bad merge can be rolled back manually (`git revert -m 1 <hash>`) or by asking the orchestrator in a normal message.
- The settings deliberately forbid agents from `git push`, `git reset --hard`, `npm ci` and deleting shared folders.
