// One place for facts that appear across the site. Edit here, not in pages.

export const site = {
  name: 'NomadGao',
  tagline: 'Come for the desk. Stay for the people.',
  description:
    'NomadGao is a work-friendly social stay at Vila Nova in Anjuna, Goa and in Dharamkot, Himachal: private rooms, a real coworking space and a weekly calendar of community events.',
  founded: 2019,
  whatsapp: '918888618466', // international format, no +
  email: 'hello@nomadgao.com', // TODO: confirm the public inbox
  social: {
    instagram: 'https://www.instagram.com/nomad.gao/',
    youtube: 'https://www.youtube.com/@nomadgao', // TODO: confirm
    linkedin: 'https://www.linkedin.com/company/nomadgao/', // TODO: confirm
  },
  // Booking engine that already runs on book.nomadgao.com.
  bookingBase: 'https://book.nomadgao.com/',
};

export const nav = [
  { label: 'Stays', href: '/stays/' },
  { label: 'Cowork', href: '/coworking/' },
  { label: 'Happenings', href: '/happenings/' },
  { label: 'The Village', href: '/village/' },
  { label: 'For teams', href: '/teams/' },
  { label: 'Journal', href: '/blog/' },
];

export function whatsappLink(message: string) {
  return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(message)}`;
}

/**
 * Stayflexi booking engine (book.nomadgao.com) deep links.
 *
 * Stayflexi does not publish its link format, so the formats below are the
 * common conventions. Open /book/link-test/ on the live preview, tap each
 * option, and set `stayflexiFormat` to the letter that opens Stayflexi with
 * your dates and guests already filled in. Or ask Stayflexi support which
 * URL parameters their booking engine accepts and add that format here.
 */
export type LinkFormat = {
  label: string;
  checkIn: string;
  checkOut: string;
  adults: string;
  date: 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'DD/MM/YYYY';
  inHash?: boolean; // parameters after # (single-page apps with hash routing)
};

export const linkFormats: Record<string, LinkFormat> = {
  A: { label: 'checkin / checkout (2026-12-10)', checkIn: 'checkin', checkOut: 'checkout', adults: 'adults', date: 'YYYY-MM-DD' },
  B: { label: 'checkin / checkout (10-12-2026)', checkIn: 'checkin', checkOut: 'checkout', adults: 'adults', date: 'DD-MM-YYYY' },
  C: { label: 'checkIn / checkOut', checkIn: 'checkIn', checkOut: 'checkOut', adults: 'adults', date: 'YYYY-MM-DD' },
  D: { label: 'check_in / check_out', checkIn: 'check_in', checkOut: 'check_out', adults: 'adults', date: 'YYYY-MM-DD' },
  E: { label: 'checkinDate / checkoutDate', checkIn: 'checkinDate', checkOut: 'checkoutDate', adults: 'adults', date: 'YYYY-MM-DD' },
  F: { label: 'startDate / endDate', checkIn: 'startDate', checkOut: 'endDate', adults: 'adults', date: 'YYYY-MM-DD' },
  G: { label: 'fromDate / toDate', checkIn: 'fromDate', checkOut: 'toDate', adults: 'adults', date: 'YYYY-MM-DD' },
  H: { label: 'from / to (10-12-2026)', checkIn: 'from', checkOut: 'to', adults: 'guests', date: 'DD-MM-YYYY' },
  I: { label: 'checkin / checkout after #', checkIn: 'checkin', checkOut: 'checkout', adults: 'adults', date: 'YYYY-MM-DD', inHash: true },
};

/** The format the whole site uses. Change this one letter after testing. */
export const stayflexiFormat: keyof typeof linkFormats | null = 'A';

function fmtDate(iso: string, f: LinkFormat['date']) {
  const [y, m, d] = iso.split('-');
  return f === 'YYYY-MM-DD' ? iso : f === 'DD-MM-YYYY' ? `${d}-${m}-${y}` : f === 'MM-DD-YYYY' ? `${m}-${d}-${y}` : `${d}/${m}/${y}`;
}

/** Link to the Stayflexi page for one property, with dates and guests when known. */
export function bookingUrl(hotelId: string, checkIn?: string, checkOut?: string, adults?: number, format = stayflexiFormat) {
  const url = new URL(site.bookingBase);
  url.searchParams.set('hotel_id', hotelId);
  const f = format ? linkFormats[format] : null;
  if (!f || !checkIn || !checkOut) return url.toString();
  const p = new URLSearchParams();
  p.set(f.checkIn, fmtDate(checkIn, f.date));
  p.set(f.checkOut, fmtDate(checkOut, f.date));
  if (adults) p.set(f.adults, String(adults));
  if (f.inHash) return `${url.toString()}#/?${p.toString()}`;
  p.forEach((v, k) => url.searchParams.set(k, v));
  return url.toString();
}
