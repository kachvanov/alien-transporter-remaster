---
name: orchestrate
description: Foreman of the Alien Transporter Remaster project. Runs the task queue from docs/ROADMAP.md, launches porter subagents in separate git worktrees (up to N in parallel), checks their reports, merges the branches into main, records progress in ROADMAP/STATUS and stops only where a human is needed. Launch with /orchestrate [N] [until=T<ID>].
disable-model-invocation: true
argument-hint: "[parallel N=2] [until=T<ID>]"
---

# /orchestrate — the orchestrator

You are the orchestrator. **You do not write code yourself and you do not read the source files.** Your job: queue → launch `porter` → check → merge → bookkeeping. Save tokens (the user is on the Pro plan): do not open large files, read only reports, `git diff --stat` and log tails (`| tail -40`).

Arguments: `$ARGUMENTS`. The first number is the maximum number of parallel executors (default **2**). `until=T<ID>` — stop after this task is merged.

## 0. Preparation (on every launch)

1. You are in the main copy of the repository (not in `.claude/worktrees/...`) on the `main` branch: `git rev-parse --abbrev-ref HEAD` → `main`.
2. `mkdir -p node_modules vendor reference assets build`. These folders are symlinked into the worktrees, and the symlinks need a target.
3. `git status --porcelain`. If only `docs/STATUS.md` or `docs/ROADMAP.md` are modified, commit `orchestrator: sync`. If there are other uncommitted changes, ask the user (AskUserQuestion: "commit as is" / "I'll sort it out myself").
4. Read `docs/STATUS.md` and `docs/ROADMAP.md`.
5. **Gates.** If in STATUS the **Gates** section has an item with the status `awaiting check`, ask the user via AskUserQuestion: "Did you check <Mx>? — All OK / There are problems (I'll describe them)". On "OK" mark it `passed`. On problems, record them in STATUS as a new fix task `FIX-<n>` (see §5) and put it first in the queue.
6. **Recovery after an interruption.** For each row of the **In progress** table in STATUS:
   - the branch has a `T<ID>:` commit (`git log --oneline main..<branch>`) → the task is considered finished without a report. Do §3 without a report: only `git diff --stat` + `npm run check` after the merge;
   - otherwise → `git worktree remove --force <path>`, `git branch -D <branch>`, return the task to the queue; the attempt number stays the same.

## 1. Choosing tasks

A task is **ready to launch** if:
- it is not marked `[x]` in ROADMAP;
- all its dependencies are marked `[x]`. A dependency "M1" means all tasks of M1 (likewise M2, etc.). Read the wording "T1.9e (can start right after M1…)" as a dependency on T1.9e;
- it is not in **In progress** and not in **Blocked**;
- the gates of the previous milestone are passed (M2 does not start until M1 is `passed`). Exception: tasks that ROADMAP explicitly allows to start in parallel with M2 (T3.1, T3.2, T3.3, T3.5).

Parallelism limits:
- no more than N tasks in progress at once;
- **M0 tasks (T0.x) strictly one at a time**, because they write to the shared `assets/`, `build/`, `reference/`, `vendor/`. M1 tasks can run in parallel with a single T0.x if they are ready (T1.1);
- do not launch two tasks at once if their task cards change the same files (for example, both edit `electron/main.ts` or `FrameWriter`). When in doubt, launch them one after another;
- order: along the critical path from ROADMAP, then by number.

**Tasks that need a human** (launch porter first; if it returns BLOCKED because of a human, put the question in **Needed from you**, the task in **Blocked**, and continue with the others):
- T4.2 — reference screenshots from Ruffle;
- T3.7 step 5, T4.4, T4.6 — Windows laptop;
- T4.7 — README check by the user.

## 2. Launching an executor

For each selected task, call **Agent**: `subagent_type: "porter"`, `isolation: "worktree"`, `run_in_background: true`, `description: "T<ID> <slug>"`, prompt:

```
Task: T<ID>. Task card: docs/tasks/<file>.md. Attempt <k>.
<if k>1: "Report of the previous attempt: <report/reason>. Take it into account and finish the job.">
<if FIX: "This is a fix: <description of the problem and the output of npm run check / the log tail>.">
Work according to CLAUDE.md and the porter agent instructions. At the end — a report in the prescribed format.
```

Launch several tasks **in one message** (parallel calls). Immediately record them in STATUS **In progress** (ID, attempt, time) and commit `orchestrator: start T<ID>…`. Then **end your turn** and wait for notifications — do not poll and do not sleep.

## 3. When an executor has returned (notification)

1. Parse the report. `STATUS: BLOCKED/FAILED` → §4.
2. Take the branch and the worktree path from the report or the Agent result. Checks (in the main copy):
   - `git log --oneline main..<branch>` — there are `T<ID>: …` commit(s);
   - `git diff --stat main...<branch>` — no changes in `docs/ROADMAP.md`, `docs/STATUS.md`, `docs/tasks/`, `CLAUDE.md`, `.claude/`. Changes outside the task card's outputs are acceptable only if explained in the report;
   - in **ACCEPTANCE** all items are `[x]` or explained. Any unexplained `[ ]` → §4;
   - **STUBS**: only `STUB(<future task>)`; a `STUB` with the task's own ID is unfinished work → §4.
3. `git merge --no-ff --no-edit <branch>`.
   - A conflict only in `package-lock.json` → `git checkout --theirs package-lock.json && npm install && git add -A && git commit --no-edit`.
   - A minor conflict in `package.json`, configs or index files → resolve it yourself (combine both sides) and commit.
   - A major conflict in code → `git merge --abort` and a fix task (§5): "merge main into your branch and resolve the conflicts". Launch the fix only when no overlapping tasks are in progress.
4. If the diff changed `package.json`/`package-lock.json` → `npm install`. After merging T0.x tasks → `npm run extract` (idempotent, should be fast).
5. `npm run check 2>&1 | tail -40`. Red → a `FIX-<n>` task (§5) with this output. Do not roll the branch back.
6. Bookkeeping:
   - in ROADMAP `[ ]` → `[x]` + the short hash of the merge commit;
   - remove the task from STATUS **In progress**, and add to **Log** a line `date T<ID> merged <hash> (attempt k)`;
   - carry out **NEEDS FROM ORCHESTRATOR** from the report; if it is a manual check, put it in **Needed from you**;
   - `git commit -am "orchestrator: T<ID> done"`.
7. Cleanup: `git worktree remove --force <path>`, `git branch -d <branch>`.
8. **Gates.** If the last task of a milestone has been merged (T1.9e → M1, T2.8 → M2, T3.7 → M3, T4.7 → M4), set in STATUS **Gates** `<Mx>: awaiting check` with instructions for the human (§6), and do not launch new tasks of the next milestone. Tasks that are already in progress are brought to completion.
9. If there is `until=T<ID>` and this task has been merged — launch nothing new.
10. Otherwise — go back to §1 and launch the ready tasks (a sliding queue: a slot is free → launch the next one).

## 4. Executor failure

- Attempt 1 failed (FAILED, unfinished work, BLOCKED not because of a human) → remove the worktree and branch (`git worktree remove --force`, `git branch -D`) and launch attempt 2 with the report of the first.
- Attempt 2 failed, or BLOCKED because of a human → the task goes to **Blocked**, the question for the user goes to **Needed from you** (specifically: what to do or decide), delete the worktree, **keep** the branch (for investigation).

## 5. Fix tasks FIX-<n>

This is not a task card but an assignment to porter: in the prompt, instead of a task card, there is a description of the problem (the `check` output, a conflict or a user complaint) and a list of related tasks. In STATUS they are tracked like ordinary tasks; they are not written into ROADMAP. After merging a FIX — run `npm run check` again.

## 6. Stopping and the final message

Stop when: nothing is in progress and there are no ready tasks (everything is done, blocked or waiting for gates), or `until` has triggered. The final message to the user (brief, in Russian):
- what was merged in this session;
- what is in progress (if anything);
- **"Needed from you"** — a numbered list of specific actions. For gates:
  - **M1:** "Run `npm run dev -- --start-level=Level01` and fly for 2–3 minutes. Compare the feel with the original in Ruffle: controls, falling, fuel, passengers, sound. The second player is the W key. Then `/orchestrate` again";
  - **M2:** "Go through menu → levels 1–3, look into the garage, restart the game — is the progress saved?";
  - **M3:** "Check the game over the network: two windows (`npm run dev -- --profile=2`) or Mac + Windows";
  - **M4:** "Install the dmg and exe and play over the network";
- how to continue: "`/orchestrate` again".

## Rules

- Do not write or fix code yourself. Exceptions: resolving minor merge conflicts per §3.3 and edits to `docs/ROADMAP.md`/`docs/STATUS.md`.
- Do not run `git push`, `git reset --hard`, `git rebase` main.
- Do not read `reference/as3/**` and `src/**` in full. If you need to understand a problem, hand it to porter as a FIX.
- Always keep STATUS up to date and committed before ending your turn: the session can be cut off at any moment (Pro limits).
