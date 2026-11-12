#!/usr/bin/env node
// Usage:
//   node src/dry-run.js                     live: open bills from Campfire
//   node src/dry-run.js --bill ABC_261106   live: one bill (search by number)
//   node src/dry-run.js --fixture test/fixtures/ABC_261106.json   offline
//   add --json for machine-readable output
import { readFile } from 'node:fs/promises';
import { planBills } from './engine.js';
import { formatPlan } from './report.js';
import { listBills } from './campfire.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const config = JSON.parse(await readFile(new URL('../config/rekindle.json', import.meta.url), 'utf8'));

let bills;
const fixture = flag('--fixture');
if (fixture) {
  const data = JSON.parse(await readFile(fixture, 'utf8'));
  bills = Array.isArray(data) ? data : data.results || [data];
} else {
  bills = await listBills({ q: flag('--bill') });
}

const plan = planBills(bills, config);

if (args.includes('--json')) {
  console.log(JSON.stringify(plan, (k, v) => (v instanceof Map ? Object.fromEntries(v) : v), 2));
} else {
  console.log(formatPlan(plan));
}

process.exitCode = plan.totals.ties ? 0 : 1;
