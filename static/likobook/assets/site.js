(function () {
  // front-page filter: hide report cards that do not contain the query
  const input = document.getElementById('q');
  const count = document.getElementById('count');
  if (!input) return;
  const cards = Array.from(document.querySelectorAll('.report-card'));
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
  input.addEventListener('input', apply);
  apply();
})();
