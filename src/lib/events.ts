import { getCollection, type CollectionEntry } from 'astro:content';

export type EventEntry = CollectionEntry<'events'>;

/** For a weekly event, roll the anchor date forward to the next occurrence after `from`. */
export function nextOccurrence(e: EventEntry, from = new Date()): Date {
  const d = new Date(e.data.date);
  if (!e.data.recurring) return d;
  while (d.getTime() + e.data.durationMins * 60000 < from.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

export async function upcomingEvents(location?: string) {
  const now = new Date();
  return (await getCollection('events'))
    .filter((e) => !location || e.data.location === location)
    .map((e) => ({ entry: e, next: nextOccurrence(e, now) }))
    .filter((x) => x.next.getTime() + x.entry.data.durationMins * 60000 >= now.getTime())
    .sort((a, b) => a.next.getTime() - b.next.getTime());
}

export function eventJsonLd(e: EventEntry, next: Date, url: string, address: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: `${e.data.title}, NomadGao ${e.data.location}`,
    description: e.data.blurb,
    startDate: next.toISOString(),
    endDate: new Date(next.getTime() + e.data.durationMins * 60000).toISOString(),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    isAccessibleForFree: true,
    location: { '@type': 'Place', name: `NomadGao ${e.data.location}`, address },
    organizer: { '@type': 'Organization', name: 'NomadGao', url },
    url,
  };
}
