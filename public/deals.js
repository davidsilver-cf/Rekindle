// Deals screen: add owner rows, clear a row, show only the fields that apply
// to the chosen billing type, and a live total of active owners' shares.
// The form still works without this script (save to get more blank rows).
(function () {
  var form = document.querySelector('form.setup');
  if (!form) return;
  var type = form.querySelector('select[name=billingType]');
  var billedTo = document.getElementById('billed-to');
  var ownersSection = document.getElementById('owners-section');
  var body = document.getElementById('owner-rows');
  var add = document.getElementById('add-owner');
  var total = document.getElementById('owner-total');
  var max = Number(body && body.getAttribute('data-max')) || 20;

  function rows() { return Array.prototype.slice.call(body.querySelectorAll('tr')); }

  function clearRow(tr) {
    Array.prototype.forEach.call(tr.querySelectorAll('input, select'), function (el) { el.value = ''; });
    refreshTotal();
  }

  function wireRow(tr) {
    var btn = tr.querySelector('.remove-owner');
    if (btn) btn.addEventListener('click', function () { clearRow(tr); });
    Array.prototype.forEach.call(tr.querySelectorAll('input, select'), function (el) {
      el.addEventListener('input', refreshTotal);
      el.addEventListener('change', refreshTotal);
    });
  }

  function addRow() {
    var list = rows();
    if (list.length >= max) return;
    var i = list.length;
    var tr = list[list.length - 1].cloneNode(true);
    Array.prototype.forEach.call(tr.querySelectorAll('[name]'), function (el) {
      el.name = el.name.replace(/^owner_\d+_/, 'owner_' + i + '_');
      el.value = '';
    });
    Array.prototype.forEach.call(tr.querySelectorAll('[aria-label]'), function (el) {
      el.setAttribute('aria-label', el.getAttribute('aria-label').replace(/\d+/, String(i + 1)));
    });
    body.appendChild(tr);
    wireRow(tr);
    var first = tr.querySelector('select');
    if (first) first.focus();
    refreshAdd();
  }

  function refreshAdd() {
    var full = rows().length >= max;
    add.disabled = full;
    add.textContent = full ? 'Owner limit reached' : 'Add owner';
  }

  // Total of rows with no end date (the split in force going forward).
  function refreshTotal() {
    if (!total) return;
    var sum = 0, n = 0;
    rows().forEach(function (tr) {
      var pct = parseFloat((tr.querySelector('input[name$=_percent]') || {}).value);
      var end = (tr.querySelector('input[name$=_end]') || {}).value;
      if (pct > 0 && !end) { sum += pct; n++; }
    });
    sum = Math.round(sum * 10000) / 10000;
    total.textContent = n ? 'Active owners total ' + sum + '%' + (sum === 100 ? ' ✓' : ' (must be 100%)') : '';
    total.style.color = n && sum !== 100 ? '#991B1B' : '';
  }

  function refreshType() {
    var t = type.value;
    if (billedTo) billedTo.hidden = !(t === 'Deal' || t === 'Fund');
    if (ownersSection) ownersSection.hidden = t !== 'Allocation';
  }

  if (body && add) {
    rows().forEach(wireRow);
    add.addEventListener('click', addRow);
    refreshAdd();
    refreshTotal();
  }
  type.addEventListener('change', refreshType);
  refreshType();
})();
