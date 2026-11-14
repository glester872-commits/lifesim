#!/usr/bin/env node
// Devuelve lifesim-builder a Sonnet (AGENTS-04): frontmatter del agente y la llamada de /autodev.
// Solo toca esas dos líneas; el resto de los archivos, y sus cambios sin commit, se quedan como están.
//   node scripts/rollback-builder-model.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const edits = [
  ['.claude/agents/lifesim-builder.md', /^# AGENTS-04:.*\r?\nmodel: .*$/m, 'model: sonnet'],
  ['.claude/skills/autodev/SKILL.md', /Llámalo siempre con `model: "opus"`/, 'Llámalo siempre con `model: "sonnet"`'],
];
for (const [file, from, to] of edits) {
  const text = readFileSync(file, 'utf8');
  if (!from.test(text)) { console.log(`${file}: sin cambios (ya revertido o editado a mano)`); continue; }
  writeFileSync(file, text.replace(from, to));
  console.log(`${file}: → ${to}`);
}
