import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
const loc = getLocation('cuatro-rios');
for (let y = 7; y <= 23; y++) { let r = ''; for (let x = 0; x < 48; x++) { const p = loc.props.find((q) => q.tx === x && q.ty === y); r += p ? p.kind[0] : isWalkable(loc, x, y) ? '.' : '#'; } console.log(String(y).padStart(2), r); }
const c = new Map<string, number>(); for (const p of loc.props) c.set(p.kind, (c.get(p.kind) ?? 0) + 1); console.log([...c].map(([k, v]) => `${k}:${v}`).join(' '));
