#!/usr/bin/env node
import fs from 'node:fs';

const input = fs.readFileSync(0, 'utf8');
let data = {};
try { data = JSON.parse(input || '{}'); } catch { data = {}; }
const command = String(data?.tool_input?.command || '').toLowerCase();
const risky = [
  'git push',
  'npm publish',
  'pnpm publish',
  'yarn publish',
  'rm -rf',
  'del /s',
  'rmdir /s',
  'drop table',
  'claude mcp remove',
  'claude mcp add ',
  'claude mcp add-json'
];
const hit = risky.find(x => command.includes(x));
if (hit) {
  console.error(`Pala guard blocked risky command: ${hit}. Use a dry-run plan and explicit approval.`);
  process.exit(2);
}
process.exit(0);
