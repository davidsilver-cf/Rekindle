// Link my account: copy the link so it can be opened in a fresh browser tab
// (some browsers refuse sign-in pages in a tab opened from inside Campfire).
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy-link]');
  if (!btn) return;
  const field = document.getElementById(btn.getAttribute('data-copy-link'));
  field.select();
  let ok = false;
  try { await navigator.clipboard.writeText(field.value); ok = true; } catch { try { ok = document.execCommand('copy'); } catch { ok = false; } }
  btn.textContent = ok ? 'Copied' : 'Select and copy it';
});
