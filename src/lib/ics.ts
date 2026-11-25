import type { EventEntry } from './events';
import { nextOccurrence } from './events';

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function vevent(e: EventEntry, site: string): string {
  const start = nextOccurrence(e);
  const end = new Date(start.getTime() + e.data.durationMins * 60000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.id}@nomadgao`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${e.data.title} · NomadGao ${e.data.location}`)}`,
    `DESCRIPTION:${esc(e.data.blurb)}`,
    `LOCATION:${esc(`NomadGao ${e.data.location}`)}`,
    `URL:${site}`,
  ];
  if (e.data.recurring) lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${DAYS[new Date(start.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getDay()]}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}
export const wrap = (body: string) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NomadGao//Happenings//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:NomadGao Happenings', body, 'END:VCALENDAR'].join('\r\n');
