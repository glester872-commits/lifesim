# Rules core: what binds every agent in this project

Every worker reads this file at startup. Keep it under 100 lines. Rules that no longer bind go to an archive file, which agents open by section only. The coordinator approves every change to this file.

`coord` and `bus` below stand for the coordinator and agent-bus CLIs. Your session context gives their exact commands. In a plain shell they are `python "$COORD_CLI"` and `python "$AGENT_BUS_CLI"`.

## 1. The project (edit this section)
- **What:** LIFE//SIM, a 2D life sim in Phaser 3 + TypeScript. All user-facing text is in Spanish.
- **Binding rules:** the repo's `CLAUDE.md` (read by section: `## Límites que no se cruzan`, `## Alcance`, `## Antes de dar algo por terminado`). In short: no fake features, no per-location conditionals (everything comes from `src/data/locations.ts` through the single `WorldScene`), no binary art (draw from `PALETTE`), and the README roadmap is not permission.
- **Priority order:** set per round by the coordinator in each brief. Nothing outside a brief is in scope.
- **Frozen:** anything not named in your brief's scope-in.
- **Proof:** `npm run build`, the relevant `scripts/check-*.ts`, and a real browser check (see `QA.md`).
- **This machine:** `python` is a Store stub, so use `py "$COORD_CLI"`. `npm run check` can hang under cmd, so run its commands one at a time.

## 2. Reading cheaply
- **Order:** index or TOC first, then `rg`, then a ranged read (offset/limit).
- **Whole files:** only when under ~300 lines.
- **Long docs:** open by section only.
  - With the code-index plugin, use its `md_toc` and the code index.
  - Otherwise, `rg -n "^#" <file>` and read the range you need.
- **Startup reading:** the startup list in .claude/coord/briefs/RESUME.md is the whole list. Read anything else only when a task needs it.

## 3. Shared tree and git
- **Shared working tree.** Other agents have uncommitted work in it.
  - Never revert, checkout, restore, stash, reset, clean, rebase or mass-reformat a file you did not create.
  - To undo your own change, edit your own hunks back.
- **Commits:** only the coordinator commits. Large git operations go through the scheduler.
- **Other agents' files:** never edit another agent's brief, card or report.

## 4. Proof
- **"Done" needs a run artefact:** a test result, a log line, or a capture from the app's own tooling.
  - A diff or a report alone is CODE-ONLY. Say so.
- **Checker changes:** a change to a checker, lint or test needs a positive control, i.e. a case that should fail and does fail.
- **Artefacts:** check that an artefact is the one that ran. Match it by hash, timestamp or build id, not by file name.
- **Guards:** fix the code, not the guard. A lint, hook or rule change needs the coordinator's OK.

## 5. Machine and heavy jobs
- **Heavy jobs** are builds, full test suites, packaging, big data jobs and GPU work.
  - Run one at a time.
  - Each needs a fresh GO from `scheduler`. An old GO never covers a new run.
  - Release the slot when you are done.
- **Before a heavy job**, run `coord preflight`. Exit 0 means GO, 1 means WAIT, and it prints the reasons.
- **Processes:** kill only PIDs you started. Never kill by name.
- **Monitors:** bound long-running Monitor commands so they never outlive the Monitor: `bus watch --for 1790`, or a loop with its own deadline. Don't rely on `timeout`; macOS and Windows don't ship it.

## 6. Messages
- **With the agent-bus plugin:**
  - Mail reaches you after tool calls.
  - When idle, arm the bus watch Monitor that the session context names.
  - Send with `bus send <to> "<one line>"`.
- **Without the bus:** write to .claude/coord/reports/<role>_progress.md. The coordinator reads it.
- **No acks or hourly status.** To the coordinator, send only:
  - a decision you need;
  - a blocker;
  - a FINAL result, in 3 lines at most, plus a path.
- **Other workers and the scheduler:** talk to them directly.
- **Never type into another agent's terminal.**

## 7. Questions for the user
- Queue them: `coord ask "<question>" --options "a|b"`.
- They are asked at the next status, never blocking.
- Keep working on what does not depend on the answer.

## 8. Your own state
- **Lane card:** .claude/coord/lanes/<role>.md, at most 150 lines, IS your handoff.
  - Update it at each milestone.
  - Update it again before you retire.
- **Retiring:** retire at about 250k tokens of context. Follow .claude/coord/briefs/HANDOFF_PROTOCOL.md.
- **Usage limits:**
  - at 97% of the session window, checkpoint your card and pause;
  - at 80% of the weekly window, the coordinator sends PAUSE: finish your atomic step, update your card, run `coord paused`, and end with SAFE TO CLOSE. `coord resume` restarts you from the card.
- **Long jobs (more than 2 minutes):** write a START line and an END line in .claude/coord/reports/<role>_progress.md.
- **Time-wasters:** note them in the card's Gotchas section, one line each.
- **Final STATUS:** end it with `SAFE TO CLOSE`, or with `KEEP OPEN: <reason>`.
