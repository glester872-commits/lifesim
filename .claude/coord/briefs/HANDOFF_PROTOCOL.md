# Handoff protocol: retiring a worker and resuming its lane

## When to retire
- Retire at about 250k tokens of context. Past that point, quality drops and every turn costs more.
  The coordinator plugin reminds you when you cross it.
- Retire at once on a coordinator `retire` message.
- At 97% of the session window, checkpoint the same way and pause. Do not retire then: the successor would
  hit the same limit.
- On a coordinator PAUSE (weekly usage at 80%), checkpoint the same way, run `coord paused`, and end with
  SAFE TO CLOSE. A lane that stays silent gets one reminder, then is interrupted and closed. `coord resume` respawns
  every paused lane from its card.

## Retiring (in this order)
1. **Finish or park the current step.**
   - A half-done edit is either finished or undone. Undo means editing your own hunks back.
   - A running heavy job: wait for it, or record its PID, log path and expected end.
2. **Update .claude/coord/lanes/<role>.md:**
   - State;
   - Next 3 actions, each with "done when";
   - Owned items;
   - Anchors (file:line);
   - open messages you owe;
   - Gotchas.

   Everything a successor needs, and nothing it can read elsewhere.
3. **Release scheduler slots** you hold, and tell `scheduler`.
4. **Send the coordinator a FINAL:** 3 lines at most and the card path.
5. **End with `SAFE TO CLOSE`.** If something must keep running, end with `KEEP OPEN: <reason>` instead.

## Resuming (the successor)
- The coordinator runs `respawn <role>`. It closes the old terminal and starts a new worker on .claude/coord/briefs/RESUME.md.
- Mail sent to the role while nobody held it waits in the role's inbox. A successor reads it with `digest`.

## The coordinator's side
- Closes terminals whose last word is SAFE TO CLOSE: `coord close-idle`.
- Never closes a KEEP OPEN lane without asking it first.
