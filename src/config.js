import { readFileSync } from 'node:fs';

export const config = JSON.parse(readFileSync(new URL('../config/rekindle.json', import.meta.url), 'utf8'));

// Writing to Campfire is OFF unless REKINDLE_WRITE is exactly "true".
export const writeEnabled = () => process.env.REKINDLE_WRITE === 'true';
