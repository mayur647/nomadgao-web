// One place for facts that appear across the site. Edit here, not in pages.

export const site = {
  name: 'NomadGao',
  tagline: 'Come for the desk. Stay for the people.',
  description:
    'NomadGao is a work-friendly social stay in Goa, Himachal and Lonavala: private rooms and dorms, a real coworking space and a weekly calendar of community events.',
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
 * Deep link into the booking engine. Only `hotel_id` is confirmed today.
 * If the engine accepts dates in the URL, set the parameter names here and
 * the wizard will pre-fill them; otherwise guests pick dates again there.
 */
export const bookingParams = { checkIn: '', checkOut: '', guests: '' }; // e.g. { checkIn: 'checkin', checkOut: 'checkout', guests: 'adults' }

export function bookingUrl(hotelId: string, checkIn?: string, checkOut?: string, guests?: number) {
  const url = new URL(site.bookingBase);
  url.searchParams.set('hotel_id', hotelId);
  if (bookingParams.checkIn && checkIn) url.searchParams.set(bookingParams.checkIn, checkIn);
  if (bookingParams.checkOut && checkOut) url.searchParams.set(bookingParams.checkOut, checkOut);
  if (bookingParams.guests && guests) url.searchParams.set(bookingParams.guests, String(guests));
  return url.toString();
}
