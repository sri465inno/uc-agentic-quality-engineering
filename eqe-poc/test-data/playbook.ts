// Test-data playbook accessor for Stage-3 specs: every value comes from demo-booking.playbook.json (synthetic only).
import * as fs from 'fs';
import * as path from 'path';

export interface SearchCriteria {
  destination: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  children: number;
}
type Entry = Record<string, unknown> & { expect?: Record<string, unknown> };

const BOOK = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-booking.playbook.json'), 'utf8')) as { data: Record<string, Entry> };
const isoDay = (offset: number): string => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export function playbook(key: string): Entry {
  const entry = BOOK.data[key];
  if (!entry) throw new Error(`Test-data key "${key}" is not in the playbook`);
  return entry;
}

export function searchData(key: string): SearchCriteria & { expect: Record<string, unknown> } {
  const e = playbook(key) as Entry & { checkInOffsetDays: number; nights: number };
  return {
    destination: String(e.destination),
    checkIn: isoDay(e.checkInOffsetDays),
    checkOut: isoDay(e.checkInOffsetDays + e.nights),
    rooms: Number(e.rooms),
    adults: Number(e.adults),
    children: Number(e.children),
    expect: e.expect || {},
  };
}
