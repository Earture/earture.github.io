(function () {
  // front-page filter + time sort: hide cards that do not contain the query,
  // and re-order the remaining ones by their generation time
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
    const dir = (sortSel && sortSel.value) === 'old' ? 1 : -1;
    cards.sort((a, b) => dir * ((Number(a.dataset.ts) || 0) - (Number(b.dataset.ts) || 0)));
    for (const c of cards) list.appendChild(c);
  }
  input.addEventListener('input', apply);
  if (sortSel) sortSel.addEventListener('change', sortCards);
  apply();
})();
