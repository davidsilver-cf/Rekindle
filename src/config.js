import { readFileSync } from 'node:fs';
import { effectiveConfig } from './setup.js';
import { isConnected } from './campfire.js';

// The starter file. Deal setup saved in Rekindle and live Campfire tags are
// layered on top of it by loadConfig().
export const config = JSON.parse(readFileSync(new URL('../config/rekindle.json', import.meta.url), 'utf8'));

// Writing to Campfire is OFF unless REKINDLE_WRITE is exactly "true".
export const writeEnabled = () => process.env.REKINDLE_WRITE === 'true';

// Demo mode: not connected to Campfire (no OAuth connection, no API key), or
// explicitly asked for. Uses the test bill in the repo.
export const demoMode = () => process.env.REKINDLE_DEMO === 'true' || (!process.env.CAMPFIRE_API_KEY && !isConnected());

// The config the engine runs on right now: live Deals and Billback Customer
// tags from Campfire (not in demo mode) plus the setup saved in Rekindle.
export async function loadConfig() {
  const { getStore } = await import('./store.js');
  const store = await getStore();
  let tags = null;
  if (!demoMode()) {
    const { listTags } = await import('./campfire.js');
    const [deals, billbackCustomers, billingGroups] = await Promise.all([
      listTags(config.tagGroups.deals),
      listTags(config.tagGroups.billbackCustomer),
      config.tagGroups.billingGroup ? listTags(config.tagGroups.billingGroup).catch(() => []) : [],
    ]);
    tags = { deals, billbackCustomers, billingGroups };
  }
  const [setups, owners, savedLinks, groups, saved] = await Promise.all([store.getSetups(), store.getOwners(), store.getCustomerLinks(), store.getBillingGroups(), store.getSavedAllocations()]);
  // Billback Customer tags with no customer attached: match a Campfire
  // customer with exactly the same name (case and spacing ignored).
  const links = new Map(savedLinks);
  const unlinked = (tags?.billbackCustomers || []).filter((t) => !t.customer && !links.has(Number(t.id)));
  if (unlinked.length) {
    const { listCustomers } = await import('./campfire.js');
    const norm = (x) => String(x || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const customers = await listCustomers().catch(() => []);
    for (const t of unlinked) {
      const same = customers.filter((c) => norm(c.name) === norm(t.name));
      if (same.length === 1) links.set(Number(t.id), Number(same[0].id));
    }
  }
  return effectiveConfig(config, { tags, setups, owners, links, groups, saved });
}
