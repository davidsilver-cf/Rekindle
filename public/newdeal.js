// New deal: show "Billed to" only for Deal and Fund, and the new-company
// fields only when "New company…" is picked. Works without it (all shown).
(function () {
  var form = document.querySelector('form.newdeal');
  if (!form) return;
  var type = form.querySelector('select[name=billingType]');
  var cust = form.querySelector('select[name=customer]');
  var billedTo = document.getElementById('nd-billed-to');
  var company = document.getElementById('nd-new-company');
  function sync() {
    var t = type.value;
    billedTo.style.display = t === 'Deal' || t === 'Fund' ? '' : 'none';
    company.style.display = cust.value === 'new' ? '' : 'none';
    form.querySelector('input[name=companyName]').required = cust.value === 'new' && billedTo.style.display === '';
  }
  type.addEventListener('change', sync);
  cust.addEventListener('change', sync);
  sync();
})();
