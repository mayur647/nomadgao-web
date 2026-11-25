// Locations. Facts marked TODO were not public at build time: fill them in.

export type Room = {
  id: string;
  name: string;
  house?: string;
  sleeps: number;
  features: string[];
  priceNight?: number; // INR, leave undefined to show "Ask for rates"
  priceWeek?: number;
  priceMonth?: number;
};

export type Stay = {
  slug: string;
  name: string;
  property: string;
  region: string;
  state: string;
  kind: string;
  tagline: string;
  summary: string;
  hotelId: string | null; // id on book.nomadgao.com
  color: string;
  facts: { label: string; value: string }[];
  workspace: { title: string; text: string }[];
  week: { day: string; what: string }[];
  rooms: Room[];
  gettingThere: string[];
  faqs: { q: string; a: string }[];
  geo?: { lat: number; lng: number };
};

export const stays: Stay[] = [
  {
    slug: 'goa-anjuna',
    name: 'Anjuna',
    property: 'NomadGao Vila Nova',
    region: 'North Goa',
    state: 'Goa',
    kind: 'Coliving + coworking',
    tagline: 'Anjuna, but make it work.',
    summary:
      'Vila Nova is our home in Anjuna, a short ride from the beach: twelve private rooms, a coworking space with desks under the trees and a rooftop, and people who would like to grab dinner.',
    hotelId: '23879',
    color: 'var(--clay)',
    facts: [
      { label: 'Property', value: 'Vila Nova' },
      { label: 'Rooms', value: '12 private rooms' },
      { label: 'Beach', value: 'A short scooter ride to Anjuna beach' },
      { label: 'Best for', value: 'Solo stays, couples, team offsites' },
      { label: 'Season', value: 'October to May; monsoon rates June to September' },
    ],
    workspace: [
      { title: 'Multiple broadband lines', text: 'Speed: TODO Mbps, tested weekly.' },
      { title: 'Power backup', text: 'Monsoon outages do not end your call.' },
      { title: 'Ergonomic chairs', text: 'Desks at a proper height, not café stools.' },
      { title: 'Zenspace', text: 'An indoor silent room for deep work and calls.' },
    ],
    week: [
      { day: 'Wednesday', what: 'Community meetup, then chess club at 6 pm' },
      { day: 'Thursday', what: 'Games night from 7:30 pm' },
      { day: 'Saturday', what: 'Chess club at 11 am, evening outing' },
      { day: 'Sunday', what: 'Group hike with a local guide' },
    ],
    rooms: [
      // TODO: match these to the room types set up in Stayflexi
      { id: 'vn-private', name: 'Private room', house: 'Vila Nova', sleeps: 2, features: ['Private bathroom', 'Coworking access'] },
    ],
    gettingThere: [
      'Manohar International Airport (Mopa) is the closest airport, roughly 45 to 60 minutes by taxi. (TODO: check)',
      'Dabolim airport is about 1 hour 15 minutes by taxi.',
      'Thivim is the nearest railway station, roughly 25 minutes away.',
      'Rent a scooter for getting around; we can connect you with a trusted rental.',
    ],
    faqs: [
      { q: 'Is NomadGao a hostel?', a: 'It is a social stay with private rooms and a dedicated coworking space. You get the community of a hostel with the privacy and the desk you need to work.' },
      { q: 'What is the minimum stay?', a: 'TODO: confirm. Weekly and monthly stays get lower rates.' },
      { q: 'Can I use the coworking space without staying?', a: 'Yes. Day, week and month passes are available for people staying elsewhere in Anjuna.' },
    ],
  },
  {
    slug: 'dharamkot',
    name: 'Dharamkot',
    property: 'NomadGao Dharamkot',
    region: 'Dharamshala',
    state: 'Himachal Pradesh',
    kind: 'Boutique coliving + rooftop coworking',
    tagline: 'Work with the Himalayas in the window.',
    summary:
      'Twelve private rooms at about 2,100 metres in the Dhauladhar range, a rooftop coworking space, and McLeodganj a fifteen-minute walk away. Cafés, trails and a lot of very calm mornings.',
    hotelId: '23727',
    color: 'var(--slate)',
    facts: [
      { label: 'Rooms', value: '12 private rooms' },
      { label: 'Altitude', value: 'About 2,100 m' },
      { label: 'Walk to McLeodganj', value: 'About 15 minutes' },
      { label: 'Best for', value: 'Focus months, hikers, slow travel' },
    ],
    workspace: [
      { title: 'Rooftop coworking', text: 'Indoor and outdoor desks facing the mountains.' },
      { title: 'Reliable Wi-Fi', text: 'Speed: TODO Mbps, with a backup line.' },
      { title: 'Power backup', text: 'Keeps you online through mountain weather.' },
      { title: 'Call-friendly corners', text: 'Quiet spots away from the common area.' },
    ],
    week: [
      { day: 'Wednesday', what: 'Community meetup for new arrivals' },
      { day: 'Friday', what: 'Bonfire night on the terrace' },
      { day: 'Saturday', what: 'Chess club at 11 am' },
      { day: 'Sunday', what: 'Hike with a local guide' },
    ],
    rooms: [
      { id: 'dk-mountain', name: 'Private room, mountain view', sleeps: 2, features: ['Mountain view', 'Private bathroom', 'Coworking access'] },
      { id: 'dk-standard', name: 'Private room', sleeps: 2, features: ['Private bathroom', 'Coworking access'] },
    ],
    gettingThere: [
      'Gaggal (Kangra) airport is about 1 hour away by taxi.',
      'Overnight Volvo buses run from Delhi to McLeodganj; it is a short taxi or walk up from there.',
      'Pathankot is the nearest major railway station, about 3 to 4 hours by road.',
      'The last stretch is a lane above Lower Dharamkot: we send directions after booking.',
    ],
    faqs: [
      { q: 'Is it cold?', a: 'Winters (December to February) are cold and can bring snow. Rooms have bedding for it; bring layers.' },
      { q: 'Can I walk to McLeodganj?', a: 'Yes, it is about a fifteen-minute walk.' },
    ],
  },
];

export const getStay = (slug: string) => stays.find((s) => s.slug === slug);
