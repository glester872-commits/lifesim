# Lane cards: one file per lane, the only thing a successor reads about its lane

`.claude/coord/lanes/<role>.md` is at most 150 lines.

- **Who keeps it current:** the lane itself. Update it at every milestone, and again before retiring at about 250k tokens.
- **It is a card, not a diary.** Overwrite stale lines. History lives in your progress log and on the bus.

## Template (copy these headings)

```markdown
# <role> lane card (updated <YYYY-MM-DD HH:MM> by <session>)

## State (5 lines max)
What is landed, what is staged, and what is waiting on whom. One line each.

## Next 3 actions
1. <action> -- <file or command> -- <done when>
2. ...
3. ...

## Owned
| item | state | proof / path | waiting on |
|---|---|---|---|

## Rules that matter for this lane (pointers only)
- .claude/coord/RULES_CORE.md section N

## Anchors (file:line, so nobody reads whole files)
- src/module/file.ext:123 -- <what is there>

## Open messages / questions
- <id> from <role>: <one line> -- <what you owe>

## Gotchas (one line each)
```

## How a successor starts
The whole reading list is in .claude/coord/briefs/RESUME.md.
