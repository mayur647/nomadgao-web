import { currentUser, myRsvps, rsvpCounts, setRsvp, toast, loginUrl } from './community';

async function init() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-rsvp]'));
  if (!buttons.length) return;
  const ids = [...new Set(buttons.map((b) => b.dataset.rsvp!))];
  const [user, mine, counts] = await Promise.all([currentUser(), myRsvps(), rsvpCounts(ids)]);
  const going = new Set(mine);

  const paint = () => {
    buttons.forEach((b) => {
      const id = b.dataset.rsvp!;
      const g = going.has(id);
      b.textContent = g ? 'Going ✓' : 'RSVP';
      b.classList.toggle('yellow', g);
      b.setAttribute('aria-pressed', String(g));
      const countEl = b.closest('[data-event]')?.querySelector('[data-count]');
      const n = counts[id] ?? 0;
      if (countEl) countEl.textContent = g ? (n > 1 ? `You + ${n - 1} going` : 'You are going') : n ? `${n} going` : 'Be the first';
    });
    const total = document.querySelector('[data-my-total]');
    if (total) total.textContent = String(going.size);
  };
  paint();

  buttons.forEach((b) =>
    b.addEventListener('click', async () => {
      if (!user) { location.href = loginUrl(); return; }
      const id = b.dataset.rsvp!;
      const next = !going.has(id);
      b.disabled = true;
      try {
        await setRsvp(id, next);
        next ? going.add(id) : going.delete(id);
        counts[id] = Math.max(0, (counts[id] ?? 0) + (next ? 1 : -1));
        paint();
        toast(next ? 'You are in. Add it to your calendar from the event page.' : 'RSVP removed.');
      } catch {
        toast('Could not save that. Try again.');
      } finally {
        b.disabled = false;
      }
    }),
  );
}
init();
