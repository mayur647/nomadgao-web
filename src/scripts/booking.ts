import { bookingUrl, bookingEngine } from '../data/site';
import { stays } from '../data/stays';

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function validate(stay: string, checkIn: string, checkOut: string): string | null {
  const today = iso(new Date());
  if (!stays.some((s) => s.slug === stay)) return 'Pick a place.';
  if (!checkIn || !checkOut) return 'Choose your check-in and check-out dates.';
  if (checkIn < today) return 'Check-in cannot be in the past.';
  if (checkOut <= checkIn) return 'Check-out must be after check-in.';
  return null;
}

/** Stayflexi link for a stay, or null when it has no booking id yet. */
export function linkFor(stay: string, checkIn: string, checkOut: string, adults: number) {
  const s = stays.find((x) => x.slug === stay);
  return s?.hotelId ? bookingUrl(s.hotelId, checkIn, checkOut, adults) : null;
}

document.querySelectorAll<HTMLFormElement>('[data-booking-form]').forEach((form) => {
  const inEl = form.elements.namedItem('in') as HTMLInputElement;
  const outEl = form.elements.namedItem('out') as HTMLInputElement;
  const err = form.querySelector<HTMLElement>('[data-booking-error]');
  const today = new Date();
  inEl.min = iso(today);
  outEl.min = iso(new Date(today.getTime() + 86400000));
  inEl.addEventListener('change', () => {
    if (!inEl.value) return;
    const next = new Date(inEl.value); next.setDate(next.getDate() + 1);
    outEl.min = iso(next);
    if (!outEl.value || outEl.value <= inEl.value) { next.setDate(next.getDate() + 6); outEl.value = iso(next); } // default: a week
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const stay = (form.elements.namedItem('stay') as HTMLInputElement).value;
    const adults = Number((form.elements.namedItem('adults') as HTMLSelectElement).value) || 2;
    const problem = validate(stay, inEl.value, outEl.value);
    if (problem) { if (err) err.textContent = problem; return; }
    if (err) err.textContent = '';
    const params = '?' + new URLSearchParams({ stay, in: inEl.value, out: outEl.value, adults: String(adults) });
    const url = bookingEngine === 'native' ? null : linkFor(stay, inEl.value, outEl.value, adults);
    location.href = url ?? form.action + params;
  });
});
