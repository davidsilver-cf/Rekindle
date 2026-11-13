// Billback queue: select-all, live selected count, and the Stamp selected button.
// The page works without this script; it only makes selecting easier.
(function () {
  var all = document.getElementById('select-all');
  var count = document.getElementById('sel-count');
  var stampSelected = document.getElementById('stamp-selected');
  var picks = Array.prototype.slice.call(document.querySelectorAll('input.pick'));
  if (!stampSelected) return;

  function refresh() {
    var n = picks.filter(function (p) { return p.checked; }).length;
    stampSelected.disabled = n === 0;
    stampSelected.textContent = n ? 'Stamp ' + n + ' selected' : 'Stamp selected';
    if (count) count.textContent = n ? n + ' selected' : '';
    if (all) {
      all.checked = picks.length > 0 && n === picks.length;
      all.indeterminate = n > 0 && n < picks.length;
      all.disabled = picks.length === 0;
    }
  }

  if (all) {
    all.addEventListener('change', function () {
      picks.forEach(function (p) { p.checked = all.checked; });
      refresh();
    });
  }
  picks.forEach(function (p) { p.addEventListener('change', refresh); });

  // Auto-apply filters when a dropdown changes.
  Array.prototype.forEach.call(document.querySelectorAll('form.filters select'), function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });

  refresh();
})();
