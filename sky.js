(function () {
  var btn = document.getElementById('motion-toggle');
  if (!btn) return;
  var label = btn.querySelector('.motion-label');
  var storageKey = 'seishi-sky-paused';
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saved = null;
  try { saved = localStorage.getItem(storageKey); } catch (e) {}
  var paused = saved !== null ? saved === '1' : prefersReduced;

  function apply(state) {
    document.body.classList.toggle('motion-paused', state);
    btn.setAttribute('aria-pressed', String(state));
    if (label) label.textContent = state ? 'Play Sky' : 'Pause Sky';
  }

  apply(paused);
  btn.addEventListener('click', function () {
    paused = !paused;
    apply(paused);
    try { localStorage.setItem(storageKey, paused ? '1' : '0'); } catch (e) {}
  });
})();
