#!/usr/bin/env node
// dsh-exec — DSH 全局算力入口。清单真身: $DSH_HOME/ops/exec-targets.json
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const HOME = process.env.DSH_HOME || String.raw`D:\Program Files\DSH`;
const CFG = join(HOME, 'ops', 'exec-targets.json');
const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
const argv = process.argv.slice(2);
const verb = argv[0] || 'which';
const pick = (name) => {
  const t = cfg.targets[name || cfg.active];
  if (!t) { console.error(`未知目标: ${name}（可用: ${Object.keys(cfg.targets).join(', ')}）`); process.exit(2); }
  return t;
};
const sshHost = (t) => {
  const c = t.candidates || [{ ssh: t.host }];
  const best = c.find((x) => x.via === t.bestVia) || c[0];
  return { host: best.ssh, via: best.via || "direct", port: t.port };
};
const ALIAS = { 'temp-burn-4': 'tb4', 'tb4': 'temp-burn-4' };

function run(t, name, cmd) {
  if (t.kind === 'local') {
    const r = spawnSync('bash', ['-lc', cmd], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  }
  const { host, port } = sshHost(t);
  const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15'];
  if (t.user) args.push('-l', t.user);
  if (port) args.push('-p', String(port));
  args.push(host, cmd);
  const r = spawnSync('ssh', args, { stdio: 'inherit' });
  if (r.status === 255 && cfg.fallback && cfg.fallback !== name) {
    console.error(`\n[已降级到 ${cfg.fallback}] ${name} 连不上`);
    return run(pick(cfg.fallback), cfg.fallback, cmd);
  }
  process.exit(r.status ?? 1);
}

switch (verb) {
  case 'which': {
    const t = pick();
    const { host, via } = sshHost(t);
    console.log(`active : ${cfg.active}${t.kind === 'local' ? '  [local]' : `  [ssh ${host}]`}`);
    console.log(`via    : ${via || '-'}${t.bestVia ? '（bestVia）' : ''}`);
    console.log(`fallback: ${cfg.fallback}`);
    if (t.note) console.log(`note   : ${t.note}`);
    break;
  }
  case 'list':
    for (const [k, v] of Object.entries(cfg.targets))
      console.log(`${k === cfg.active ? '*' : ' '} ${k.padEnd(14)} ${v.kind === 'local' ? 'local' : `${sshHost(v).host}:${v.port || 22} (${sshHost(v).via})`}  ${v.note || ''}`);
    break;
  case 'use': {
    const name = argv[1] || '';
    const t = cfg.targets[name];
    if (!t) { console.error(`未知目标: ${name}`); process.exit(2); }
    // 简单原地改写 active，保留其余内容
    const raw = readFileSync(CFG, 'utf8').replace(/"active"\s*:\s*"[^"]*"/, `"active": "${name}"`);
    (await import('node:fs')).writeFileSync(CFG, raw);
    console.log(`active -> ${name}`);
    break;
  }
  case 'probe': {
    const names = argv[1] ? [argv[1]] : Object.keys(cfg.targets);
    for (const n of names) {
      const t = cfg.targets[n];
      if (t.kind === 'local') { console.log(` ✔ ${n.padEnd(14)} local`); continue; }
      const { host, via } = sshHost(t);
      const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=12', ...(t.user ? ['-l', t.user] : []), ...(t.port ? ['-p', String(t.port)] : []), host, 'echo ok; hostname'];
      const r = spawnSync('ssh', args, { encoding: 'utf8', timeout: 30000 });
      const ok = r.status === 0;
      console.log(`${ok ? ' ✔' : ' ✘'} ${n.padEnd(14)} [${via}] ${host}${ok ? '  ' + (r.stdout.split('\n')[1] || '').trim() : '  ' + (r.stderr || '').trim().split('\n')[0]}`);
    }
    break;
  }
  case 'run': case 'sh': {
    const name = argv[1];
    const rest = argv.slice(2);
    const cmd = (rest[0] === '--' ? rest.slice(1) : rest).join(' ');
    if (!cmd) { console.error('用法: dsh-exec run <target|-> -- <command>   （- 表示本机原地，active 表示当前默认目标）'); process.exit(2); }
    // '-' = 本机原地执行（不会偷偷跑在云主机上）；'active' 或不写 = 当前 active
    const targetName = name === '-' ? 'local' : name === 'active' ? cfg.active : name;
    run(pick(targetName), targetName, cmd);
    break;
  }
  default:
    console.log('dsh-exec which|list|probe [t]|use <t>|run <t|-> -- "<cmd>"\n  run -       本机原地执行\n  run active  当前默认目标\n  run <t>     指定目标');
}
