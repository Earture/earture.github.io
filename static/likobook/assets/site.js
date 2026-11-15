(function () {
  // front-page filter + sort: hide cards that do not contain the query, then
  // re-order the whole list by stream date or by generation time
  const input = document.getElementById('q');
  const sortSel = document.getElementById('sort');
  const count = document.getElementById('count');
  const list = document.querySelector('.reports');
  if (!input || !list) return;
  const cards = Array.from(list.querySelectorAll('.report-card'));
  function apply() {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const c of cards) {
      const hit = !q || (c.dataset.search || '').includes(q);
      c.hidden = !hit;
      if (hit) shown += 1;
    }
    if (count) count.textContent = '显示 ' + shown + ' / ' + cards.length + ' 份';
  }
  function sortCards() {
    const mode = sortSel ? sortSel.value : 'live';
    // dir = -1 sorts high values first (newest), +1 sorts low values first (oldest)
    const dir = mode === 'new' || mode === 'live' ? -1 : 1;
    const field = mode === 'new' || mode === 'old' ? 'ts' : 'livets';
    const byDate = field === 'livets';
    cards.sort((a, b) => {
      // a report whose title has no stream date has no known position: keep it at
      // the end of the list whatever the direction is
      if (byDate) {
        const unknownA = !Number(a.dataset.livets);
        const unknownB = !Number(b.dataset.livets);
        if (unknownA !== unknownB) return unknownA ? 1 : -1;
      }
      const d = dir * ((Number(a.dataset[field]) || 0) - (Number(b.dataset[field]) || 0));
      if (d) return d;
      // same date -> generation time, then id
      return dir * ((Number(a.dataset.ts) || 0) - (Number(b.dataset.ts) || 0)) ||
        (Number(b.dataset.id) || 0) - (Number(a.dataset.id) || 0);
    });
    for (const c of cards) list.appendChild(c);
  }
  input.addEventListener('input', apply);
  if (sortSel) sortSel.addEventListener('change', sortCards);
  apply();
})();
