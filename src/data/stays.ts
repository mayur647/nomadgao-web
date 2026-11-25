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
    region: 'North Goa',
    state: 'Goa',
    kind: 'Coliving + coworking',
    tagline: 'Anjuna, but make it work.',
    summary:
      'Two houses a short ride from Anjuna beach. Vila Nova has fifteen private rooms and the main coworking space; Secret Garden is quieter and leafier. Desks under mango trees, a rooftop, and people who would like to grab dinner.',
    hotelId: '23879',
    color: 'var(--clay)',
    facts: [
      { label: 'Rooms', value: '15 at Vila Nova + Secret Garden' },
      { label: 'Beach', value: 'About 1.8 km to Anjuna beach' },
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
      { id: 'vn-garden', name: 'Private room, garden view', house: 'Vila Nova', sleeps: 2, features: ['AC', 'Private bathroom', 'Balcony', 'Coworking access'] },
      { id: 'sg-private', name: 'Private room', house: 'Secret Garden', sleeps: 2, features: ['Shared kitchen', 'Garden desks', 'Coworking access'] },
    ],
    gettingThere: [
      'Manohar International Airport (Mopa) is the closest airport, roughly 45 to 60 minutes by taxi. (TODO: check)',
      'Dabolim airport is about 1 hour 15 minutes by taxi.',
      'Thivim is the nearest railway station, about 25 minutes away.',
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
  {
    slug: 'lonavala',
    name: 'Lonavala',
    region: 'Sahyadri hills',
    state: 'Maharashtra',
    kind: 'Workation hostel',
    tagline: 'A weekend escape that still has a desk.',
    summary:
      'Our social hostel in the Sahyadris, a short drive from Mumbai and Pune. Dorms, a female-only dorm, private rooms, a pool and a work lounge. Come for a weekend, stay for the week.',
    hotelId: null, // TODO: booking id for Lonavala
    color: 'var(--leaf)',
    facts: [
      { label: 'Beds', value: 'Dorms, female-only dorm, private rooms' },
      { label: 'Pool', value: 'Yes' },
      { label: 'From Mumbai / Pune', value: 'A short drive or train ride' },
      { label: 'Best for', value: 'Weekends, first workations, groups' },
    ],
    workspace: [
      { title: 'Work lounge', text: 'Desks and plug points away from the social area.' },
      { title: 'Wi-Fi', text: 'Speed: TODO Mbps.' },
      { title: 'Board games and movies', text: 'For when the laptop closes.' },
      { title: 'Pool', text: 'The best meeting room in the monsoon.' },
    ],
    week: [
      { day: 'Wednesday', what: 'Community meetup with dinner' },
      { day: 'Saturday', what: 'Monsoon trek or sunset walk' },
    ],
    rooms: [
      { id: 'ln-dorm', name: 'Bed in mixed dorm', sleeps: 1, features: ['Locker', 'Reading light', 'Lounge access'] },
      { id: 'ln-fdorm', name: 'Bed in female-only dorm', sleeps: 1, features: ['Locker', 'Reading light', 'Lounge access'] },
      { id: 'ln-private', name: 'Private room', sleeps: 2, features: ['Private bathroom', 'Lounge access'] },
    ],
    gettingThere: [
      'Lonavala station is on the Mumbai to Pune line.',
      'By road it is on the Mumbai to Pune expressway.',
      'Address: opposite Lodha Gold Crest, Gharkul Society, Valvan, Lonavala.',
    ],
    faqs: [
      { q: 'Is there a female-only dorm?', a: 'Yes.' },
      { q: 'Can I bring my team?', a: 'Yes. Groups can book out a dorm or the whole property. Ask on WhatsApp.' },
    ],
  },
];

export const getStay = (slug: string) => stays.find((s) => s.slug === slug);
