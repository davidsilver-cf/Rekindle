import { readFileSync } from 'node:fs';
import { effectiveConfig } from './setup.js';

// The starter file. Deal setup saved in Rekindle and live Campfire tags are
// layered on top of it by loadConfig().
export const config = JSON.parse(readFileSync(new URL('../config/rekindle.json', import.meta.url), 'utf8'));

// Writing to Campfire is OFF unless REKINDLE_WRITE is exactly "true".
export const writeEnabled = () => process.env.REKINDLE_WRITE === 'true';

// Demo mode: no API key yet, or explicitly asked for. Uses the test bill in the repo.
export const demoMode = () => process.env.REKINDLE_DEMO === 'true' || !process.env.CAMPFIRE_API_KEY;

// The config the engine runs on right now: live Deals and Billback Customer
// tags from Campfire (not in demo mode) plus the setup saved in Rekindle.
export async function loadConfig() {
  const { getStore } = await import('./store.js');
  const store = await getStore();
  let tags = null;
  if (!demoMode()) {
    const { listTags } = await import('./campfire.js');
    const [deals, billbackCustomers] = await Promise.all([
      listTags(config.tagGroups.deals),
      listTags(config.tagGroups.billbackCustomer),
    ]);
    tags = { deals, billbackCustomers };
  }
  const [setups, owners] = await Promise.all([store.getSetups(), store.getOwners()]);
  return effectiveConfig(config, { tags, setups, owners });
}
