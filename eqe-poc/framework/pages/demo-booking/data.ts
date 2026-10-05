import playbookJson from '../../test-data/playbook.json';

export type SearchCriteria = { destination: string; checkIn: string; checkOut: string; rooms: number; adults: number; children: number };

// Relative dates ("+30d") in the test-data playbook keep the data valid whenever the suite runs.
const day = (spec: string): string => {
  const m = /^([+-]\d+)d$/.exec(spec);
  if (!m) return spec;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + Number(m[1]));
  return d.toISOString().slice(0, 10);
};

const resolve = (v: unknown): unknown => {
  if (typeof v === 'string') return day(v);
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
  return v;
};

export function playbook(): Record<string, any> {
  return resolve((playbookJson as any).entries) as Record<string, any>;
}
