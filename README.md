# NomadGao website

Static website for NomadGao: stays, coworking, a booking flow, events with RSVP, member profiles and the Journal (blog). It's built with [Astro](https://astro.build) and deploys to GitHub Pages for free.

The preview build is **hidden from search engines** (`PUBLIC_NOINDEX=true`), so it never competes with the live nomadgao.com.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs dist/
npm run check:links
```

Needs Node 20 or newer.

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `nomadgao-web`, and push this folder to the `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the site, checks every internal link and publishes it to `https://<your-user>.github.io/nomadgao-web/`.

Optional repository variables (**Settings → Secrets and variables → Actions → Variables**):

| Variable | Default | What it does |
| --- | --- | --- |
| `PUBLIC_NOINDEX` | `true` | Keeps the preview out of Google. Set it to `false` only when this site replaces nomadgao.com. |
| `SITE_URL` / `BASE_PATH` | Taken from GitHub Pages | Set these if you use a custom domain, for example `https://new.nomadgao.com` and `/`. |
| `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` | empty | Turns on real accounts. Without them, the community runs in demo mode. |

## Where things live

| What | File |
| --- | --- |
| Contact details, WhatsApp number, navigation, Stayflexi link format | `src/data/site.ts` |
| Locations, rooms, prices, workspace facts, FAQs | `src/data/stays.ts` |
| Blog posts (one Markdown file each) | `src/content/blog/` |
| Events (weekly or one-off) | `src/content/events/` |
| Destination guides | `src/content/guides/` |
| Colours, fonts, spacing | `src/styles/global.css` |
| Photos | `public/images/`; pass `src` to `<Photo>` to replace a placeholder block |
| Old URL → new URL map | `src/data/redirects.json` |

Search the code for `TODO` to find facts that still need confirming, such as prices, Wi-Fi speeds, minimum stay, Stayflexi link format and legal text.

### Add a blog post

Create `src/content/blog/my-new-post.md`:

```markdown
---
title: "Where to work in Anjuna when the power goes out"
description: "Between 70 and 170 characters. This is the Google snippet, so say what the reader gets."
topic: goa            # india-guides | goa | himachal | remote-work | digital-nomads | people | news
pubDate: 2026-12-01
author: "Your name"
relatedStay: goa-anjuna
cover: /images/blog/my-new-post/cover.webp
coverAlt: "Laptop on a rooftop desk in Anjuna"
takeaways: ["One-line answer people are searching for", "Second key point"]
faqs:
  - q: "A question people search for?"
    a: "A short answer."
---

The article in Markdown. Use ## for sections; they become the table of contents.
```

The site checks frontmatter at build time. A description that is too long or a topic that is misspelled stops the build with a clear message.

### Add an event

Create a file in `src/content/events/`. For a weekly event set `recurring: true` and give the first date; the site rolls it forward to the next occurrence on every build. Each event gets its own page, Event schema for Google, an RSVP button and an `.ics` calendar file. There is also a full calendar feed at `/happenings/calendar.ics`.

## Migrating the 50 WordPress posts

Every old post already has a stub with its new slug, an SEO description, a topic and its old URL. Until a post is imported, its page links readers to the original on nomadgao.com and tells Google not to index it.

1. In WordPress, go to **Tools → Export → All content** and download the XML file.
2. Run:

   ```bash
   npm install
   npm run import:wp -- path/to/nomadgao.WordPress.xml --dry-run   # preview
   npm run import:wp -- path/to/nomadgao.WordPress.xml             # import
   ```

   For each post, the importer:
   - keeps the text, author and dates;
   - converts HTML to Markdown and removes page-builder shortcodes;
   - turns any stray H1 inside the article into an H2;
   - downloads images into `public/images/blog/<slug>/` with readable names;
   - rewrites internal links to the new URLs;
   - uses the Yoast title and description when they are usable;
   - marks the post `imported: true`.
3. Review the diff, especially image alt text marked "image 1", "image 2" and so on, then commit.

You can also run `npm run import:wp -- --rest https://nomadgao.com`, which reads the public WordPress API. It doesn't include Yoast fields.

### Redirects

- **GitHub Pages:** each old URL gets a small page that forwards visitors to the new address straight away.
- **Production (Vercel, Netlify or Cloudflare Pages):** run `node scripts/build-redirect-configs.mjs`. It writes `vercel.json` and `public/_redirects` with real 301s and security headers. Use one of these hosts when this site goes live on nomadgao.com; GitHub Pages can't send real 301s.

## Booking flow (Stayflexi)

There's one booking box: property, check-in, check-out and guests. It appears on the homepage, on each stay page and on `/book/`. "See rooms and prices" sends the guest **straight to the Stayflexi page for that property, with their dates and guest count in the link**, so they don't have to choose them again.

- **Property ids:** set as `hotelId` in `src/data/stays.ts` (Vila Nova `23879`, Dharamkot `23727`).
- **Link format:** Stayflexi doesn't publish the names its links use for dates and guests, so the site assumes format **A** (`?checkin=2026-12-10&checkout=2026-12-17&adults=2`). To confirm it:
  1. Open `/book/link-test/` on the deployed preview (from your phone is fine).
  2. Tap each option, A to I.
  3. Note the one that opens Stayflexi with the dates and 3 guests already filled in.
  4. Set `stayflexiFormat` in `src/data/site.ts` to that letter.
- **If no option works:** ask Stayflexi support which URL parameters the booking engine accepts for check-in, check-out and adults, then add that format to `linkFormats`.
- **Shareable links:** `/book/?stay=goa-anjuna&in=2026-12-10&out=2026-12-17&adults=2` forwards straight to Stayflexi. Use these in Instagram bios, WhatsApp replies and ads.

## Community: profiles, RSVPs and messages

There are two modes, and the pages are the same in both:

- **Demo mode (default):** sign-in, your profile and your RSVPs are stored only in the visitor's browser. The directory also shows five sample members. This is useful for showing the flow to the team.
- **Live mode:**
  1. Create a free [Supabase](https://supabase.com) project.
  2. Run `supabase/schema.sql` in its SQL editor.
  3. Add your site URL under **Authentication → URL configuration**.
  4. Set the two `PUBLIC_SUPABASE_*` variables in GitHub and redeploy.

  Sign-in is by emailed link, with no passwords. Only emails listed in the `members` table can see or post anything. Fill that table from your bookings, for example with a nightly export or a Zapier step.

The security model is enforced by the database, not the browser:

- Row-level security on every table.
- Members can edit only their own profile and RSVPs.
- Stay dates are hidden when a member turns them off.
- Messages ("say hi") can be read only by the person they were sent to, and each member can send at most 20 a day.
- Profile pages are `noindex` and blocked in robots.txt.

## Security and SEO built in

- **Content-Security-Policy:**
  - Scripts load only from this site.
  - Fonts load only from Google Fonts.
  - Forms can post only to this site and the booking engine.
- **No inline scripts:** this is enforced in the build config.
- **Search markup:** canonical URLs, Open Graph tags and JSON-LD schema. The schema types are Organization, LodgingBusiness or Hostel, Event, BlogPosting, FAQPage and BreadcrumbList.
- **Feeds:** sitemap (when indexing is on), RSS at `/rss.xml` and an events calendar feed.
- **Accessibility:** a skip link, real buttons and labels, visible focus rings and reduced-motion support.
