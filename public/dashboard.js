// Dashboard: pick a deal without pressing Show, and filter table rows as you type.
(function () {
  var f = document.querySelector('form.dash-pick');
  if (f) {
    var btn = f.querySelector('button');
    if (btn) btn.style.display = 'none';
    f.querySelector('select').addEventListener('change', function () { f.submit(); });
  }
  Array.prototype.forEach.call(document.querySelectorAll('input[data-filter-for]'), function (input) {
    var table = document.getElementById(input.getAttribute('data-filter-for'));
    if (!table) return;
    input.hidden = false;
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      Array.prototype.forEach.call(table.tBodies[0].rows, function (tr) {
        tr.hidden = q !== '' && tr.textContent.toLowerCase().indexOf(q) === -1;
      });
    });
  });
})();
