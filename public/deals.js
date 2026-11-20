// Billing group: save as soon as a different group is picked.
(function () {
  var f = document.querySelector('form.billing-group');
  if (!f) return;
  var sel = f.querySelector('select');
  var btn = f.querySelector('button');
  if (btn) btn.style.display = 'none';
  sel.addEventListener('change', function () { f.submit(); });
})();

// Owner rows (a deal's own split, a saved allocation, Change the split):
// add rows, clear a row, and work out each share % from $ amounts as they're
// typed. With $ on any row, % is filled in and read-only; with no $ at all,
// % is typed. The server works it out again on save, so this is a preview.
// Everything still works without this script.
(function () {
  function money(v) { var n = parseFloat(String(v || '').replace(/[$,\s]/g, '')); return n > 0 ? n : 0; }
  function round(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }
  function val(tr, suffix) { var el = tr.querySelector('[name$="_' + suffix + '"]'); return el ? el.value : ''; }

  // rows(): the <tr>s; dated: whether rows carry their own start/end dates.
  function wire(container, rowsSel, totalEl, dated) {
    function rows() { return Array.prototype.slice.call(container.querySelectorAll(rowsSel + ' > tr')); }
    function refresh() {
      var list = rows();
      var withAmt = list.filter(function (tr) { return String(val(tr, 'amount')).trim() !== ''; });
      var byAmount = withAmt.length > 0;
      list.forEach(function (tr) {
        var pct = tr.querySelector('[name$="_percent"]');
        if (pct) pct.readOnly = byAmount;
      });
      if (byAmount) {
        list.forEach(function (tr) {
          var pct = tr.querySelector('[name$="_percent"]');
          var a = money(val(tr, 'amount'));
          if (!pct) return;
          if (!a) { pct.value = ''; return; }
          var on = dated ? (val(tr, 'start') || '') : '';
          var total = 0;
          list.forEach(function (o) {
            var s = dated ? val(o, 'start') : '', e = dated ? val(o, 'end') : '';
            var active = on === '' ? !s : (!s || s <= on) && (!e || e >= on);
            if (active) total += money(val(o, 'amount'));
          });
          pct.value = total > 0 ? round((a / total) * 100, 4) : '';
        });
      }
      if (!totalEl) return;
      var sum = 0, n = 0, dollars = 0;
      list.forEach(function (tr) {
        var p = parseFloat(val(tr, 'percent'));
        var open = !dated || !val(tr, 'end');
        if (p > 0 && open) { sum += p; n++; dollars += money(val(tr, 'amount')); }
      });
      sum = round(sum, 2);
      var ok = Math.abs(sum - 100) < 0.01;
      var lead = dated ? 'Active owners total ' : 'Total ';
      totalEl.textContent = n ? lead + (byAmount ? '$' + dollars.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' = ' : '') + sum + '%' + (ok ? ' ✓' : ' (must be 100%)') : '';
      totalEl.style.color = n && !ok ? 'var(--bad)' : '';
    }
    function wireRow(tr) {
      var btn = tr.querySelector('.remove-owner');
      if (btn) btn.addEventListener('click', function () {
        Array.prototype.forEach.call(tr.querySelectorAll('input, select'), function (el) { el.value = ''; });
        refresh();
      });
      Array.prototype.forEach.call(tr.querySelectorAll('input, select'), function (el) {
        el.addEventListener('input', refresh);
        el.addEventListener('change', refresh);
      });
    }
    rows().forEach(wireRow);
    var add = container.querySelector('.add-owner');
    var body = container.querySelector(rowsSel);
    var max = Number(body && body.getAttribute('data-max')) || 20;
    if (add && body) {
      var refreshAdd = function () {
        var full = rows().length >= max;
        add.disabled = full;
        add.textContent = full ? 'Owner limit reached' : 'Add owner';
      };
      add.addEventListener('click', function () {
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
        refresh();
      });
      refreshAdd();
    }
    refresh();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.owners-editor'), function (ed) {
    wire(ed, '.owner-rows', ed.querySelector('.owner-total'), true);
  });
  Array.prototype.forEach.call(document.querySelectorAll('form.change-split'), function (f) {
    wire(f, '.split-rows', f.querySelector('.split-total'), false);
  });
})();

// Deal setup: show only the fields that apply to the chosen billing type, and
// hide the deal's own owners when it uses a saved allocation.
(function () {
  var form = document.querySelector('form.setup:not(.alloc-edit)');
  if (!form) return;
  var type = form.querySelector('select[name=billingType]');
  var billedTo = document.getElementById('billed-to');
  var ownersSection = document.getElementById('owners-section');
  var choice = form.querySelector('select.split-choice');
  var own = form.querySelector('.own-split');
  var note = form.querySelector('.saved-note');
  function refresh() {
    var t = type.value;
    if (billedTo) billedTo.hidden = !(t === 'Deal' || t === 'Fund');
    if (ownersSection) ownersSection.hidden = t !== 'Allocation';
    if (choice && own) { own.hidden = choice.value !== ''; if (note) note.hidden = choice.value === ''; }
  }
  type.addEventListener('change', refresh);
  if (choice) choice.addEventListener('change', refresh);
  refresh();
})();
