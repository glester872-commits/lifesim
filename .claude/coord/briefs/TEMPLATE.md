# Brief: <role> -- <one-line goal>

Written by the coordinator, read once by the worker. Keep it under 80 lines and point to sections instead of pasting them.

## Read first
1. .claude/coord/RULES_CORE.md
2. This brief.
3. <only the sections this task needs, as file:line ranges>

## Goal
<What done looks like, from the user's point of view. One paragraph.>

## Scope
- In: <files, modules, behaviours>
- Out: <what not to touch; who owns it>

## Steps
1. <step> -- done when <observable result>
2. ...

## Proof
<Which artefact proves it: a test command and its expected result, a log line, a capture.>

## Constraints
- <user rules that apply; heavy jobs via `scheduler`; no edits to files owned by other lanes>

## Report
- Keep .claude/coord/lanes/<role>.md current. It is your handoff.
- Send the coordinator a FINAL: 3 lines at most plus a path, then end with SAFE TO CLOSE or KEEP OPEN: <reason>.
