/* Applies a saved Light or Dark choice before the first paint, so the page
   never flashes the other theme. Keep in step with src/app/theme.ts. */
(function () {
  try {
    var choice = localStorage.getItem('farview.theme');
    if (choice !== 'light' && choice !== 'dark') return;
    document.documentElement.setAttribute('data-theme', choice);
    var color = choice === 'dark' ? '#1b1a1e' : '#ffffff';
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute('data-system', metas[i].getAttribute('content') || '');
      metas[i].setAttribute('content', color);
    }
  } catch (e) {
    /* storage blocked: follow the system */
  }
})();
