#!/usr/bin/env node
// Guardián PreToolUse de LIFE//SIM (AGENT-V2-03/04). Herramienta de desarrollo: nada de src/ lo importa. Sin red ni dependencias.
// Dos políticas:
//   specialist (por defecto): lista blanca de los especialistas de solo lectura, desde el frontmatter de gameplay-qa/optimizer.
//   project (--policy=project): segunda barrera de .claude/settings.json, detrás de los permisos nativos. Aplica el contrato
//     de CLAUDE.md § SAFETY & CHANGE CONTROL: deniega lo destructivo y pide autorización (ask) para lo protegido.
// Lee {tool_name, tool_input, cwd, agent_type} por stdin y responde deny/ask, o nada (sigue el flujo normal de permisos).
// Falla cerrado: si no puede leer la llamada, deniega. Junto con `onFailure: "block"`, un fallo o un timeout bloquean.
//   node scripts/agent-guard.mjs --selftest
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ especialistas (lista blanca)
const ALLOW = [
  /^node scripts\/(check|simulate|bench)-[\w-]+\.ts( [\w=.,:-]+)*$/,
  /^npm run (build|check)$/,
  /^git (status|diff|log|show|rev-parse)( [\w=./:@~^%-]+)*$/,
];
const SUFFIX = /(\s+2>&1|\s*\|\s*(tail|head)\s+(-n\s*)?-?\d+)$/;
const META = /[;&|<>`$()\n\r\\]/;
const STORAGE_WRITE = /(local|session)Storage\s*\.\s*(setItem|removeItem|clear)\b|(local|session)Storage\s*\[[^\]]*\]\s*=(?!=)|\bindexedDB\b|lifesim\s*\.\s*(quality|audio)\s*\(|document\.cookie\s*=(?!=)/;

export function decide(tool, input) {
  if (tool === 'Bash') {
    let cmd = String(input?.command ?? '').trim();
    for (let m; (m = cmd.match(SUFFIX)); ) cmd = cmd.slice(0, m.index).trim();
    if (!cmd || META.test(cmd) || /--output\b/.test(cmd)) return `Bash fuera de la lista de solo lectura: ${cmd.slice(0, 80)}`;
    return ALLOW.some((re) => re.test(cmd)) ? null : `Bash fuera de la lista de solo lectura: ${cmd.slice(0, 80)}`;
  }
  if (/evaluate_script$/.test(tool)) {
    return STORAGE_WRITE.test(JSON.stringify(input ?? {})) ? 'evaluate_script que escribe guardados o la configuración del jugador' : null;
  }
  return null;
}

// ------------------------------------------------------------------ proyecto (contrato de CLAUDE.md)
const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');
const low = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
function absPath(p, cwd) {
  let s = String(p).trim().replace(/^["']|["']$/g, '');
  if (/^\/[a-zA-Z]\//.test(s)) s = `${s[1]}:${s.slice(2)}`; // /c/Users → c:/Users (Git Bash)
  if (s.startsWith('~')) s = (process.env.USERPROFILE || process.env.HOME || '') + s.slice(1);
  return norm(isAbsolute(s) ? resolve(s) : resolve(cwd, s));
}
const under = (p, dir) => low(p) === low(dir) || low(p).startsWith(low(dir) + '/');
const HOME = norm(process.env.USERPROFILE || process.env.HOME || '/nonexistent-home');
const TEMPS = [norm(tmpdir()), '/tmp', `${HOME}/AppData/Local/Temp`];

const SECRET = /(^|\/)(\.env(\.(?!example$)[^/]+)?|[^/]*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)[^/]*|credentials[^/]*\.json|secrets?\.[^/]+)$/i;
/** Clasifica una ruta que se va a escribir. Devuelve {level:'deny'|'ask', why} o null. */
export function pathRule(abs, root, agent) {
  const rel = under(abs, root) ? abs.slice(root.length + 1) : null;
  if (SECRET.test(abs)) return { level: 'deny', why: `archivo sensible (${abs.split('/').pop()})` };
  if (/(^|\/)settings\.local\.json$/i.test(abs)) return { level: 'deny', why: 'settings.local.json solo lo cambia el usuario a mano' };
  if (rel === null) {
    if (TEMPS.some((t) => under(abs, t))) return null;
    if (under(abs, `${HOME}/.claude/projects`) && /\/memory(\/|$)/.test(abs)) return null; // memoria privada del usuario
    if (under(abs, `${HOME}/.claude/plans`)) return null;
    if (under(abs, `${HOME}/.claude`)) return { level: 'ask', why: 'configuración global de Claude' };
    return { level: 'ask', why: `escritura fuera del proyecto (${abs})` };
  }
  const barrier = /^(scripts\/agent-guard\.mjs|scripts\/autodev-gate\.mjs|\.claude\/settings\.json)$/i.test(rel);
  if (barrier && agent) return { level: 'deny', why: 'un agente no puede cambiar su propia barrera de seguridad' };
  if (barrier) return { level: 'ask', why: 'barrera de seguridad del proyecto' };
  if (/^\.github\//i.test(rel) || /^(vercel\.json|netlify\.toml|\.gitlab-ci\.yml)$/i.test(rel)) return { level: 'ask', why: 'CI/CD o despliegue' };
  if (/^(\.claude\/|CLAUDE\.md$|AGENTS\.md$|\.gitignore$)/i.test(rel)) return { level: 'ask', why: `${rel}: solo dentro del alcance de la misión` };
  if (/^(package\.json|package-lock\.json|tsconfig[\w.-]*\.json|vite\.config\.\w+)$/i.test(rel)) return { level: 'ask', why: `${rel}: configuración de build y pruebas` };
  if (/^\.git(\/|$)/i.test(rel)) return { level: 'deny', why: 'escritura directa en .git' };
  return null;
}

const ASSERT = /\bassert\b/g;
const DISABLE = /\.(skip|only)\s*\(|\bprocess\.exit\(\s*0\s*\)|\bif\s*\(\s*false\s*\)|^\s*\/\/\s*assert/m;
const count = (s, re) => (String(s).match(re) || []).length;
const TEST_FILE = /^scripts\/(check|simulate)-[\w-]+\.ts$/i;
/** Protección de tests: compara antes y después. Devuelve {level, why} o null. */
export function testRule(abs, root, before, after) {
  if (!under(abs, root)) return null;
  const rel = abs.slice(root.length + 1);
  if (TEST_FILE.test(rel)) {
    if (DISABLE.test(after) && !DISABLE.test(before)) return { level: 'deny', why: `${rel}: desactiva pruebas (skip/only/exit(0)/if(false)/assert comentado)` };
    if (count(after, ASSERT) < count(before, ASSERT)) return { level: 'ask', why: `${rel}: quita asserts (${count(before, ASSERT)}→${count(after, ASSERT)}); requiere revisión independiente` };
  }
  if (/^package\.json$/i.test(rel)) {
    const checks = (s) => new Set(String(s).match(/scripts\/check-[\w-]+\.ts/g) || []);
    const gone = [...checks(before)].filter((c) => !checks(after).has(c));
    if (gone.length) return { level: 'ask', why: `package.json: saca ${gone.join(', ')} de la cadena de pruebas; requiere revisión independiente` };
  }
  return null;
}

// --- shell: segmenta, desenvuelve intérpretes y evalúa cada orden
function splitSegments(cmd) {
  const out = [];
  let cur = '', q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === q) q = null; cur += c; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '\n' || c === ';' || c === '|' || c === '&') {
      if (c === '&' && (cmd[i - 1] === '>' || cmd[i + 1] === '>')) { cur += c; continue; } // 2>&1, &>
      out.push(cur); cur = ''; if (cmd[i + 1] === c) i++; continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
const WRAP = /^(?:bash|sh|zsh|dash)\s+(?:-\w*c)\s+(["'])([\s\S]*)\1$|^(?:powershell|pwsh)(?:\.exe)?\s+(?:-\w+\s+)*-(?:c|command)\s+(["'])([\s\S]*)\3$|^cmd(?:\.exe)?\s+\/[ck]\s+(["']?)([\s\S]*)\5$|^eval\s+(["'])([\s\S]*)\7$/i;
const tokens = (s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ''));

function gitRule(args) {
  const [sub, ...rest] = args;
  const has = (re) => rest.some((a) => re.test(a));
  switch (sub) {
    case 'clean': return { level: 'deny', why: 'git clean descarta archivos no rastreados' };
    case 'reset': return has(/^--(hard|merge|keep)$/) ? { level: 'deny', why: 'git reset --hard descarta trabajo' } : { level: 'ask', why: 'git reset cambia el índice' };
    case 'checkout': return has(/^(\.|--|-f|--force|-p|--patch|--ours|--theirs|:\/)$/) || rest.length > 1 ? { level: 'deny', why: 'git checkout que descarta cambios' } : { level: 'ask', why: 'git checkout cambia el árbol' };
    case 'restore': return has(/^(\.|-p|--patch|:\/|\*)$/) || has(/^(\.\/?|\*)$/) ? { level: 'deny', why: 'git restore masivo o interactivo' } : { level: 'ask', why: 'git restore selectivo: requiere autorización' };
    case 'stash': return /^(list|show)$/.test(rest[0] ?? '') ? null : { level: 'deny', why: 'git stash está prohibido por el contrato' };
    case 'push': return has(/^(-f|--force(-with-lease)?|--mirror|--delete)$/) ? { level: 'deny', why: 'git push forzado o destructivo' } : { level: 'ask', why: 'git push publica' };
    case 'branch': return has(/^-D$|^--delete$/) ? { level: 'ask', why: 'git branch -D borra una rama' } : null;
    case 'commit': case 'pull': case 'merge': case 'rebase': case 'cherry-pick': case 'revert': case 'am': case 'apply': case 'add': case 'rm': case 'mv': case 'update-ref': case 'gc': case 'prune': case 'filter-branch':
      return { level: 'ask', why: `git ${sub} cambia el repositorio: requiere autorización` };
    default: return null;
  }
}

function writeTargets(seg) {
  const t = [];
  for (const m of seg.matchAll(/(?:^|[^>&\d])>{1,2}\s*("[^"]+"|'[^']+'|[^\s;&|]+)/g)) t.push(m[1]);
  for (const m of seg.matchAll(/\btee\s+(?:-a\s+)?("[^"]+"|'[^']+'|\S+)/g)) t.push(m[1]);
  for (const m of seg.matchAll(/\b(?:Out-File|Set-Content|Add-Content|New-Item)\b[^|;]*?(?:-(?:File)?Path\s+)?("[^"]+"|'[^']+'|[^\s-][^\s]*)/gi)) t.push(m[1]);
  const tk = tokens(seg);
  if (/^(cp|mv|Copy-Item|Move-Item|copy|move)$/i.test(tk[0] ?? '')) { const a = tk.filter((x) => !x.startsWith('-')); if (a.length > 2) t.push(a[a.length - 1]); }
  if (tk[0] === 'sed' && tk.some((x) => /^-i/.test(x))) t.push(tk[tk.length - 1]);
  return t.filter((x) => !/^(\/dev\/null|nul|&\d)$/i.test(x));
}

function shellRule(cmd, cwd, root, agent, depth = 0) {
  const vars = {};
  for (const m of cmd.matchAll(/(?:^|[\s;&|])([A-Za-z_]\w*)=("[^"]*"|'[^']*'|[^\s;&|]+)/g)) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  const sub = (s) => s.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (all, v) => vars[v] ?? process.env[v] ?? all);
  let worst = null;
  const take = (r) => { if (r && (!worst || (r.level === 'deny' && worst.level !== 'deny'))) worst = r; };
  for (const raw of splitSegments(cmd)) {
    const seg = raw.replace(/^(?:[A-Za-z_]\w*=("[^"]*"|'[^']*'|\S*)\s+)+/, '').replace(/^(sudo|command|exec|nohup|time)\s+/, '');
    const w = seg.match(WRAP);
    if (w && depth < 3) { take(shellRule(w[2] ?? w[4] ?? w[6] ?? w[8], cwd, root, agent, depth + 1)); continue; }
    const tk = tokens(seg);
    const head = (tk[0] ?? '').replace(/\.exe$/i, '').toLowerCase();
    if (head === 'git') {
      const args = tk.slice(1);
      while (/^(-C|-c|--git-dir|--work-tree)$/.test(args[0] ?? '') || /^--(no-pager|git-dir=|work-tree=)/.test(args[0] ?? '')) args.splice(0, /=/.test(args[0]) || args[0] === '--no-pager' ? 1 : 2);
      take(gitRule(args));
    }
    if (/^(rm|rmdir|rd|del|erase|remove-item|ri)$/.test(head)) {
      const recursive = tk.some((a) => /^-(?:[a-zA-Z]*[rR][a-zA-Z]*|-recursive)$|^\/s$|^-recurse$/i.test(a));
      const targets = tk.slice(1).filter((a) => !a.startsWith('-') && !/^\/[sqf]$/i.test(a)).map((a) => absPath(sub(a), cwd));
      const outsideTemp = targets.filter((p) => !TEMPS.some((t) => under(p, t)) && !under(p, `${root}/dist`) && !under(p, `${root}/.autodev`));
      if (recursive && (outsideTemp.length || !targets.length)) take({ level: 'deny', why: 'borrado recursivo fuera de temporales' });
      else if (outsideTemp.some((p) => under(p, root))) take({ level: 'ask', why: 'borrar archivos del proyecto: requiere autorización' });
    }
    if (/\bfind\b[^|]*\s-delete\b|\bxargs\s+(-\S+\s+)*rm\b/.test(seg)) take({ level: 'deny', why: 'borrado masivo (find -delete / xargs rm)' });
    if (/^(npm|pnpm|yarn)$/.test(head) && /^(run\s+)?(deploy|release|publish)\b/.test(tk.slice(1).join(' '))) take({ level: 'ask', why: 'despliegue o publicación' });
    if (/^(vercel|netlify|firebase|gh)$/.test(head) && /^(deploy|--prod|pr merge|release|repo delete)/.test(tk.slice(1).join(' '))) take({ level: 'ask', why: 'despliegue o publicación' });
    if (/^(node|python3?|py|deno|bun|ruby|perl)$/.test(head) && tk.some((a) => /^-(e|c|-eval)$/.test(a))) {
      const code = seg;
      if (/(rmSync|rmdirSync|unlinkSync|rm\(|rmdir\(|unlink\(|shutil\.rmtree|os\.remove|os\.unlink)/.test(code)) take({ level: 'ask', why: 'intérprete que borra archivos' });
      if (/(writeFileSync|writeFile\(|appendFileSync|open\([^)]*['"][wa])/.test(code)) {
        const lit = [...code.matchAll(/['"]([^'"]*\.[\w]+)['"]/g)].map((m) => absPath(m[1], cwd));
        for (const p of lit) take(pathRule(p, root, agent));
      }
    }
    for (const t of writeTargets(seg)) {
      const p = absPath(sub(t), cwd);
      if (/\$/.test(p)) { take({ level: 'ask', why: `escritura a una ruta sin resolver (${t})` }); continue; }
      const r = pathRule(p, root, agent);
      if (r) take(r);
      else if (under(p, root) && !under(p, `${root}/.autodev`) && !under(p, `${root}/dist`)) take({ level: 'ask', why: `escritura por shell en el proyecto (${p.slice(root.length + 1)}); usa Edit/Write` });
    }
  }
  return worst;
}

/** V2-07: un check seguido de |, ||, ; o salto de línea devuelve el exit code de otro comando (visto en `npm run check | tail`). `&&` no lo oculta. */
export const CHECK_CMD = /\bnpm run (build|check|test[\w:-]*)\b|\bnode\s+scripts\/\S+\.(ts|mjs)\b|\bnpx\s+(tsx|tsc)\b/;
export function maskedCheck(cmd) {
  const bare = cmd.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""'); // separadores dentro de comillas no cuentan
  return CHECK_CMD.test(bare) && /\|\|?|;|\n/.test(bare.replace(/[12]?>&[12]/g, ''));
}

/** V2-07 · techo absoluto: 1 builder + 3 correcciones por ejecución (CLAUDE.md § Agentes). El techo por modo lo aplica closure() en autodev-run. */
export const MAX_BUILDERS = 4;
export function builderCap(root, ev, dir = join(root, '.autodev', 'guard')) {
  const key = String(process.env.AUTODEV_RUN_ID || ev.session_id || 'sin-sesion').replace(/[^\w.-]/g, '_');
  const file = join(dir, `${key}.json`);
  const n = (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).builders : 0) + 1;
  if (n > MAX_BUILDERS) return { level: 'ask', why: `límite absoluto de correcciones: sería el builder n.º ${n} de ${key} (máx. ${MAX_BUILDERS} = 1 + 3 correcciones)` };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ builders: n }));
  return null;
}

export function decideProject(ev) {
  const tool = ev.tool_name;
  const input = ev.tool_input ?? {};
  const root = norm(process.env.CLAUDE_PROJECT_DIR || ev.cwd || process.cwd());
  const cwd = norm(ev.cwd || root);
  const agent = Boolean(ev.agent_type || ev.agent_id);
  if (tool === 'Agent' && input.subagent_type === 'lifesim-builder' && !agent) return builderCap(root, ev);
  if (tool === 'Bash' || tool === 'PowerShell') {
    const cmd = String(input.command ?? '');
    const r = shellRule(cmd, cwd, root, agent);
    if (r?.level === 'deny' || !maskedCheck(cmd)) return r;
    return { level: 'ask', why: 'check encadenado (|, ||, ; o salto de línea): el exit code ya no es el del check; ejecútalo solo' };
  }
  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' || tool === 'NotebookEdit') {
    const file = input.file_path ?? input.notebook_path;
    if (!file) return { level: 'deny', why: `${tool} sin ruta` };
    const abs = absPath(file, cwd);
    const p = pathRule(abs, root, agent);
    if (p?.level === 'deny') return p;
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    let before = current, after = current;
    if (tool === 'Write') after = String(input.content ?? '');
    else if (tool === 'Edit') { before = String(input.old_string ?? ''); after = String(input.new_string ?? ''); }
    else if (tool === 'MultiEdit') { before = (input.edits ?? []).map((e) => e.old_string).join('\n'); after = (input.edits ?? []).map((e) => e.new_string).join('\n'); }
    const t = current || tool !== 'Write' ? testRule(abs, root, before, after) : null; // un archivo nuevo no debilita nada
    return [p, t].find((r) => r?.level === 'deny') ?? p ?? t ?? null;
  }
  return null;
}

// ------------------------------------------------------------------ entrada
function main(policy) {
  let r;
  try {
    const ev = JSON.parse(readFileSync(0, 'utf8'));
    if (policy === 'project') r = decideProject(ev);
    else { const why = decide(ev.tool_name, ev.tool_input); r = why && { level: 'deny', why }; }
  } catch (e) {
    r = { level: 'deny', why: `agent-guard no pudo leer la llamada (${e.message})` };
  }
  if (r) {
    const tail = r.level === 'deny' ? (policy === 'project' ? 'Ver CLAUDE.md § SAFETY & CHANGE CONTROL.' : 'Pide la ejecución al orquestador.') : 'Autorízalo solo si está dentro del alcance de la misión.';
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: r.level, permissionDecisionReason: `agent-guard: ${r.why}. ${tail}` } }));
  }
  process.exit(0);
}

function selftest() {
  const ok = (t, i) => decide(t, i) === null;
  const sAllow = [
    ['Bash', { command: 'node scripts/check-bici.ts' }], ['Bash', { command: 'node scripts/check-economy.ts 2>&1 | tail -5' }],
    ['Bash', { command: 'npm run build' }], ['Bash', { command: 'git diff --stat -- src' }], ['Bash', { command: 'git log -1 --format=%h' }],
    ['mcp__plugin_ecc_chrome-devtools__evaluate_script', { function: '() => lifesim.perf()' }],
    ['mcp__plugin_ecc_chrome-devtools__evaluate_script', { function: '() => localStorage.getItem("lifesim.save.slot3")' }],
    ['Read', { file_path: 'CLAUDE.md' }],
  ];
  const sDeny = [
    ['Bash', { command: 'echo x > CLAUDE.md' }], ['Bash', { command: 'node scripts/check-bici.ts && rm -rf src' }], ['Bash', { command: 'rm -rf dist' }],
    ['Bash', { command: 'git checkout .' }], ['Bash', { command: 'git diff --output=leak.txt' }], ['Bash', { command: 'sed -i s/a/b/ src/main.ts' }],
    ['Bash', { command: 'node -e "require(\'fs\').writeFileSync(\'x\',\'y\')"' }], ['Bash', { command: 'npm install left-pad' }], ['Bash', { command: '' }],
    ['mcp__plugin_ecc_chrome-devtools__evaluate_script', { function: '() => localStorage.setItem("lifesim.save.slot3","{}")' }],
    ['mcp__plugin_ecc_chrome-devtools__evaluate_script', { function: '() => { localStorage["k"] = 1 }' }],
    ['mcp__plugin_ecc_chrome-devtools__evaluate_script', { function: '() => localStorage.clear()' }],
    ['mcp__plugin_ecc_chrome-devtools__evaluate_script', { function: '() => lifesim.quality("low")' }],
  ];
  for (const [t, i] of sAllow) if (!ok(t, i)) throw new Error(`specialist debía permitir: ${t} ${JSON.stringify(i)}`);
  for (const [t, i] of sDeny) if (ok(t, i)) throw new Error(`specialist debía denegar: ${t} ${JSON.stringify(i)}`);

  // proyecto: raíz sintética, nada se ejecuta; solo se evalúan las llamadas.
  const root = norm(resolve(HOME, 'agent-guard-fixture-root')); // fuera de temporales; no hace falta que exista
  const prev = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = root;
  const B = (command, extra = {}) => ({ tool_name: 'Bash', tool_input: { command }, cwd: root, ...extra });
  const E = (file_path, old_string, new_string, extra = {}) => ({ tool_name: 'Edit', tool_input: { file_path, old_string, new_string }, cwd: root, ...extra });
  const W = (file_path, content = 'x', extra = {}) => ({ tool_name: 'Write', tool_input: { file_path, content }, cwd: root, ...extra });
  const cases = [
    // inocuos y trabajo ordinario
    [B('git status --porcelain=v1 --untracked-files=all'), null], [B('npm run build'), null],
    // V2-07: check encadenado → ask (antes era null: `| tail` ocultaba el exit code y el registro lo contaba PASS)
    [B('node scripts/check-bici.ts 2>&1 | tail -3'), 'ask'], [B('npm run check 2>&1 | tail -15'), 'ask'], [B('npm run build > /dev/null 2>&1; echo "EXIT=$?"'), 'ask'],
    [B('npm run build || true'), 'ask'], [B('npm run build 2>&1'), null], [B('npm run build && node scripts/check-x.ts'), null],
    [B('node scripts/autodev-gate.mjs evidence --run=R --criterion=A1 --exit=0 --cmd="npm run build; x"'), null], [B('git log --oneline | head -3'), null],
    [B(`OUT="${tmpdir()}/x"; echo hi > "$OUT/log.txt"`), null], [B('git stash list'), null], [B('git diff --cached --stat'), null],
    [E(`${root}/src/systems/Cycling.ts`, 'a', 'b'), null], [W(`${root}/src/data/nuevo.ts`), null],
    [W(`${root}/scripts/check-nuevo.ts`, 'assert.ok(true)'), null],
    [E(`${root}/scripts/check-x.ts`, 'assert.ok(a);', 'assert.ok(a);\nassert.ok(b);'), null],
    // destructivos
    [B('git clean -fd'), 'deny'], [B('git checkout .'), 'deny'], [B('git restore .'), 'deny'], [B('git reset --hard'), 'deny'],
    [B('git reset --hard HEAD~1'), 'deny'], [B('git -C . clean -fdx'), 'deny'], [B('git stash'), 'deny'], [B('git stash push -m x'), 'deny'],
    [B('git checkout -- src/main.ts'), 'deny'], [B('git restore -p'), 'deny'], [B('git push --force origin main'), 'deny'],
    [B('rm -rf src'), 'deny'], [B(`rm -r "${root}/scripts"`), 'deny'], [B('find . -name "*.ts" -delete'), 'deny'], [B('git ls-files | xargs rm'), 'deny'],
    // compuestos, envoltorios, Windows
    [B('git status && git clean -fd'), 'deny'], [B('npm run build; git reset --hard'), 'deny'], [B('bash -c "git checkout ."'), 'deny'],
    [B('sh -c \'git restore .\''), 'deny'], [B('powershell -NoProfile -Command "Remove-Item -Recurse -Force src"'), 'deny'],
    [B('cmd /c rmdir /s /q src'), 'deny'], [B('cd sub && git clean -n'), 'deny'], [{ tool_name: 'PowerShell', tool_input: { command: 'Remove-Item src -Recurse' }, cwd: root }, 'deny'],
    // autorización (ask)
    [B('git restore src/main.ts'), 'ask'], [B('git commit -m x'), 'ask'], [B('git push origin vid-12-guia'), 'ask'], [B('git add -A'), 'ask'],
    [B('npm run deploy'), 'ask'], [B('rm src/old.ts'), 'ask'], [B('echo x > src/main.ts'), 'ask'], [B('sed -i s/a/b/ src/main.ts'), 'ask'],
    [B('node -e "require(\'fs\').rmSync(\'src\',{recursive:true})"'), 'ask'],
    // sensibles, traversal, fuera de alcance
    [W(`${root}/.env`), 'deny'], [W(`${root}/.env.production`), 'deny'], [E(`${root}/scripts/../.env`, 'a', 'b'), 'deny'], [W(`${root}\\config\\.env`), 'deny'],
    [W(`${root}/.env.example`), null], [B('echo SECRET=1 >> .env'), 'deny'], [B(`cp x "${root}/.env.local"`), 'deny'],
    [W(`${root}/.claude/settings.local.json`), 'deny'], [W(`${root}/.github/workflows/ci.yml`), 'ask'], [W(`${root}/src/../../fuera.txt`), 'ask'],
    [W('C:/Windows/system32/x.dll'), 'ask'], [W(`${HOME}/.claude/settings.json`), 'ask'], [W(`${HOME}/.claude/projects/p/memory/m.md`), null],
    [E(`${root}/.gitignore`, 'dist', 'dist\n.agent-runs/'), 'ask'], [E(`${root}/CLAUDE.md`, 'a', 'b'), 'ask'], [E(`${root}/.claude/agents/x.md`, 'a', 'b'), 'ask'],
    [B('git -c core.x=y --no-pager commit -m x'), 'ask'],
    // barrera propia
    [E(`${root}/scripts/agent-guard.mjs`, 'a', 'b', { agent_type: 'lifesim-builder' }), 'deny'], [E(`${root}/scripts/agent-guard.mjs`, 'a', 'b'), 'ask'],
    [W(`${root}/.claude/settings.json`, '{}', { agent_id: 'a1' }), 'deny'],
    // tests
    [E(`${root}/scripts/check-x.ts`, 'assert.ok(a);\nassert.ok(b);', 'assert.ok(a);'), 'ask'], [E(`${root}/scripts/check-x.ts`, 'run();', 'run.skip();'), 'deny'],
    [E(`${root}/scripts/check-x.ts`, 'assert.ok(a);', '// assert.ok(a);'), 'deny'], [E(`${root}/scripts/check-x.ts`, 'main();', 'process.exit(0);\nmain();'), 'deny'],
    [E(`${root}/package.json`, '"check": "node scripts/check-a.ts && node scripts/check-b.ts"', '"check": "node scripts/check-a.ts"'), 'ask'],
  ];
  const fails = [];
  for (const [ev, want] of cases) {
    const got = decideProject(ev)?.level ?? null;
    if (got !== want) fails.push(`${ev.tool_name} ${JSON.stringify(ev.tool_input).slice(0, 90)} → ${got}, esperado ${want}`);
  }
  if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = prev;
  // techo absoluto de builders: contador en un directorio temporal propio
  const capDir = join(tmpdir(), `agent-guard-cap-${process.pid}`);
  const savedRun = process.env.AUTODEV_RUN_ID; delete process.env.AUTODEV_RUN_ID;
  const levels = Array.from({ length: MAX_BUILDERS + 1 }, () => builderCap(root, { session_id: 's1' }, capDir)?.level ?? null);
  if (levels.join() !== [...Array(MAX_BUILDERS).fill(''), 'ask'].join()) fails.push(`builderCap: ${levels.join()}`);
  if (builderCap(root, { session_id: 's2' }, capDir) !== null) fails.push('builderCap: otra sesión cuenta aparte');
  if (decideProject({ tool_name: 'Agent', tool_input: { subagent_type: 'lifesim-planner' }, cwd: root }) !== null) fails.push('Agent no builder: sin límite');
  if (savedRun !== undefined) process.env.AUTODEV_RUN_ID = savedRun;
  rmSync(capDir, { recursive: true, force: true });
  if (fails.length) throw new Error(`agent-guard project:\n  ${fails.join('\n  ')}`);
  console.log(`agent-guard selftest OK (specialist ${sAllow.length}+${sDeny.length}, project ${cases.length} casos)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else main(process.argv.includes('--policy=project') ? 'project' : 'specialist');
}
