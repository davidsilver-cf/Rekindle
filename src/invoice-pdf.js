// Rekindle invoice PDF: page 1 is the invoice (one line per recharge
// category), followed by supporting detail listing every source bill line,
// its share and the amount billed. Drafts carry a DRAFT watermark.
import { Pdf, PAGE, wrap, fit } from './pdf.js';

const M = 54; // margin
const RIGHT = PAGE.width - M;
const BOTTOM = 712; // last usable top position before the footer
const INK = '#1C1B19';
const QUIET = '#5F5B55';
const RULE = '#E6E2DC';
const TINT = '#F7F5F2';

const usd = (cents) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const longDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
};
const shortDate = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y ? `${m}/${d}/${y}` : '';
};
const addDays = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export function invoiceData({ customer, plan, branding = {}, invoice = {} }) {
  const linesById = new Map(plan.lines.map((l) => [l.lineId, l]));
  const sources = customer.sources.map((s) => ({ ...s, line: linesById.get(s.lineId) }));
  // Group by deal, then recharge category. Both alphabetical, so recurring
  // invoices read the same way each time; within a category, oldest bill first.
  const order = (a, b) => String(a.line?.billDate).localeCompare(String(b.line?.billDate))
    || String(a.line?.billNumber).localeCompare(String(b.line?.billNumber)) || a.lineId - b.lineId;
  const groupByCategory = (list) => {
    const m = new Map();
    for (const s of list) {
      const cat = s.line?.rechargeCategory || 'Other';
      if (!m.has(cat)) m.set(cat, { category: cat, cents: 0, count: 0, sources: [] });
      const c = m.get(cat);
      c.cents += s.cents;
      c.count += 1;
      c.sources.push(s);
    }
    const out = [...m.values()].sort((a, b) => a.category.localeCompare(b.category));
    for (const c of out) c.sources.sort(order);
    return out;
  };
  const byDeal = new Map();
  for (const s of sources) {
    const deal = s.line?.dealsTag || 'Other';
    if (!byDeal.has(deal)) byDeal.set(deal, []);
    byDeal.get(deal).push(s);
  }
  const deals = [...byDeal.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([deal, list]) => ({ deal, cents: list.reduce((t, x) => t + x.cents, 0), categories: groupByCategory(list) }));
  const categories = groupByCategory(sources);
  const date = invoice.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const termsDays = Number.isInteger(branding.termsDays) ? branding.termsDays : null;
  return {
    from: branding.fromName || sources[0]?.line?.entityName || '',
    fromLines: branding.fromAddress || [],
    remitTo: branding.remitTo || [],
    footer: branding.footer || '',
    accent: branding.accentColor || '#C2410C',
    customer: customer.customer,
    number: invoice.number || null,
    draft: invoice.draft !== false,
    date,
    terms: branding.terms || null,
    due: termsDays !== null ? addDays(date, termsDays) : null,
    deals,
    multiDeal: deals.length > 1,
    categories,
    sources: deals.flatMap((g) => g.categories.flatMap((c) => c.sources)),
    totalCents: customer.cents,
  };
}

export function buildInvoicePdf(args) {
  const d = invoiceData(args);
  const pdf = new Pdf({ title: `Invoice · ${d.customer.name}${d.draft ? ' (draft)' : ''}`, author: d.from });
  const pages = [];

  const newPage = () => {
    const p = pdf.addPage();
    if (d.draft) p.rotatedText(PAGE.width / 2, PAGE.height / 2, 'DRAFT', { size: 120, color: '#F3EFEA' });
    p.rect(0, 0, PAGE.width, 6, { fill: d.accent });
    pages.push(p);
    return p;
  };

  // ---- Page 1: the invoice
  let p = newPage();
  p.text(M, 64, fit(d.from, 300, 16, 'bold'), { size: 16, font: 'bold' });
  let top = 82;
  for (const l of d.fromLines) { p.text(M, top, fit(l, 300, 9.5), { size: 9.5, color: QUIET }); top += 13; }

  p.text(RIGHT, 70, 'INVOICE', { size: 26, font: 'bold', align: 'right', color: d.accent });
  const meta = [
    ['Invoice no.', d.number || 'Draft · not yet issued'],
    ['Invoice date', longDate(d.date)],
    ...(d.terms ? [['Terms', d.terms]] : []),
    ...(d.due ? [['Due date', longDate(d.due)]] : []),
  ];
  top = 96;
  for (const [label, value] of meta) {
    p.text(380, top, label, { size: 9, color: QUIET });
    p.text(RIGHT, top, value, { size: 9.5, font: label === 'Invoice no.' && !d.number ? 'regular' : 'bold', align: 'right', color: label === 'Invoice no.' && !d.number ? QUIET : INK });
    top += 15;
  }

  // Bill to
  top = Math.max(top, 96 + 13 * d.fromLines.length) + 22;
  p.rect(M, top, 504, 64, { fill: TINT });
  p.text(M + 14, top + 18, 'BILL TO', { size: 8, font: 'bold', color: QUIET });
  p.text(M + 14, top + 36, fit(d.customer.name, 300, 13, 'bold'), { size: 13, font: 'bold' });
  if (d.customer.campfireId) p.text(M + 14, top + 52, `Customer ${d.customer.campfireId}`, { size: 9, color: QUIET });
  if (d.remitTo.length) {
    p.text(330, top + 18, 'REMIT TO', { size: 8, font: 'bold', color: QUIET });
    d.remitTo.slice(0, 3).forEach((l, i) => p.text(330, top + 34 + i * 12, fit(l, 214, 9), { size: 9 }));
  }

  // Invoice lines: one per recharge category, grouped by deal when the
  // invoice covers more than one deal.
  top += 92;
  p.rect(M, top, 504, 24, { fill: TINT });
  p.text(M + 10, top + 16, d.multiDeal ? 'Deal and category' : 'Description', { size: 9, font: 'bold', color: QUIET });
  p.text(RIGHT - 10, top + 16, 'Amount', { size: 9, font: 'bold', color: QUIET, align: 'right' });
  top += 24;
  const room = (h) => {
    if (top + h > BOTTOM) {
      p = newPage();
      p.text(M, 60, 'Invoice lines (continued)', { size: 11, font: 'bold' });
      top = 76;
    }
  };
  const TOTAL_ROOM = 70;
  if (d.multiDeal) {
    d.deals.forEach((g, gi) => {
      const lastDeal = gi === d.deals.length - 1;
      const groupH = 26 + 20 * g.categories.length + 6;
      // Keep a deal's lines together when they fit on a page; the last deal
      // also keeps the total with it.
      if (groupH + TOTAL_ROOM < BOTTOM - 76) room(groupH + (lastDeal ? TOTAL_ROOM : 0));
      else room(26 + 20);
      p.text(M + 10, top + 18, fit(g.deal, 360, 10.5, 'bold'), { size: 10.5, font: 'bold' });
      p.text(RIGHT - 10, top + 18, usd(g.cents), { size: 10.5, font: 'bold', align: 'right' });
      top += 26;
      g.categories.forEach((c, ci) => {
        room(20 + (lastDeal && ci === g.categories.length - 1 ? TOTAL_ROOM : 0));
        p.text(M + 26, top + 13, `${c.category} — reimbursable expenses`, { size: 9.5 });
        p.text(M + 300, top + 13, `${c.count} line${c.count === 1 ? '' : 's'}`, { size: 8.5, color: QUIET });
        p.text(RIGHT - 10, top + 13, usd(c.cents), { size: 9.5, align: 'right' });
        top += 20;
      });
      top += 6;
      p.line(M, top, RIGHT, top, { color: RULE });
    });
  } else {
    for (const [ci, c] of d.categories.entries()) {
      room(40 + (ci === d.categories.length - 1 ? TOTAL_ROOM : 0));
      p.text(M + 10, top + 18, `${c.category} — reimbursable expenses`, { size: 10.5 });
      p.text(M + 10, top + 32, `${c.count} source line${c.count === 1 ? '' : 's'}${d.deals[0] ? ` · ${d.deals[0].deal}` : ''}, detail attached`, { size: 8.5, color: QUIET });
      p.text(RIGHT - 10, top + 18, usd(c.cents), { size: 10.5, align: 'right' });
      top += 40;
      p.line(M, top, RIGHT, top, { color: RULE });
    }
  }
  if (top + 70 > BOTTOM) { p = newPage(); top = 60; }
  top += 26;
  p.text(380, top, 'Total due', { size: 11, font: 'bold' });
  p.text(RIGHT - 10, top, usd(d.totalCents), { size: 14, font: 'bold', align: 'right' });
  top += 10;
  p.line(380, top, RIGHT, top, { color: INK, width: 1 });

  top += 30;
  p.text(M, top, 'Expenses are billed at cost. Each amount is traced to its source bill below.', { size: 9, color: QUIET });

  // ---- Supporting detail
  const cols = [
    { key: 'bill', label: 'Bill', x: M, w: 66 },
    { key: 'vendor', label: 'Vendor', x: M + 70, w: 86 },
    { key: 'date', label: 'Bill date', x: M + 160, w: 52 },
    { key: 'desc', label: 'Description', x: M + 216, w: 128 },
    { key: 'line', label: 'Line amount', x: M + 402, align: 'right' },
    { key: 'share', label: 'Share', x: M + 438, align: 'right' },
    { key: 'billed', label: 'Billed', x: RIGHT, align: 'right' },
  ];
  const tableHead = (pg, at) => {
    pg.rect(M, at, 504, 22, { fill: TINT });
    for (const c of cols) pg.text(c.align === 'right' ? c.x - (c.key === 'billed' ? 6 : 0) : c.x + (c.key === 'bill' ? 6 : 0), at + 15, c.label, { size: 8, font: 'bold', color: QUIET, align: c.align || 'left' });
    return at + 22;
  };

  top += 40;
  if (top > BOTTOM - 120) { p = newPage(); top = 60; }
  p.text(M, top, 'Supporting detail', { size: 13, font: 'bold' });
  top = tableHead(p, top + 12);

  const ensure = (h) => {
    if (top + h > BOTTOM) {
      p = newPage();
      p.text(M, 60, 'Supporting detail (continued)', { size: 11, font: 'bold' });
      top = tableHead(p, 72);
    }
  };

  const sourceRow = (s) => {
    const l = s.line || {};
    const descLines = wrap(l.description || '', 128, 8.5).slice(0, 2);
    const how = s.percent < 100 ? `${s.percent}% allocation` : 'direct';
    const dealLine = fit(d.multiDeal ? how : `${l.dealsTag || ''} · ${how}`, 128, 7.5);
    const h = 12 + descLines.length * 11 + 11 + 4;
    ensure(h);
    const base = top + 14;
    p.text(M + 6, base, fit(l.billNumber, 60, 8.5), { size: 8.5 });
    p.text(M + 6, base + 11, `Line ${l.lineId}`, { size: 7.5, color: QUIET });
    p.text(M + 70, base, fit(l.vendorName || '', 86, 8.5), { size: 8.5 });
    p.text(M + 160, base, shortDate(l.billDate), { size: 8.5 });
    descLines.forEach((t, i) => p.text(M + 216, base + i * 11, t, { size: 8.5 }));
    p.text(M + 216, base + descLines.length * 11, dealLine, { size: 7.5, color: QUIET });
    p.text(M + 402, base, usd(l.amountCents || 0), { size: 8.5, align: 'right' });
    p.text(M + 438, base, `${s.percent}%`, { size: 8.5, align: 'right' });
    p.text(RIGHT - 6, base, usd(s.cents), { size: 8.5, align: 'right' });
    top += h;
    p.line(M + 6, top, RIGHT, top, { color: RULE, width: 0.5 });
  };

  for (const g of d.deals) {
    if (d.multiDeal) {
      ensure(34 + 24 + 50);
      p.rect(M, top + 6, 504, 24, { fill: '#FBF4EF' });
      p.text(M + 6, top + 22, fit(g.deal, 380, 10.5, 'bold'), { size: 10.5, font: 'bold' });
      top += 34;
    }
    for (const c of g.categories) {
      ensure(24 + 50);
      p.text(M + 6, top + 17, c.category, { size: 9.5, font: 'bold', color: d.accent });
      top += 24;
      for (const s of c.sources) sourceRow(s);
      ensure(24);
      p.text(M + 412, top + 15, `${c.category} subtotal`, { size: 8.5, font: 'bold', align: 'right' });
      p.text(RIGHT - 6, top + 15, usd(c.cents), { size: 8.5, font: 'bold', align: 'right' });
      top += 24;
    }
    if (d.multiDeal) {
      ensure(28);
      p.line(M + 300, top + 2, RIGHT, top + 2, { color: INK, width: 0.75 });
      p.text(M + 412, top + 18, fit(`${g.deal} total`, 230, 9, 'bold'), { size: 9, font: 'bold', align: 'right' });
      p.text(RIGHT - 6, top + 18, usd(g.cents), { size: 9.5, font: 'bold', align: 'right' });
      top += 28;
    }
    p.line(M, top, RIGHT, top, { color: RULE });
  }
  ensure(30);
  p.text(M + 6, top + 18, `${d.sources.length} line${d.sources.length === 1 ? '' : 's'} · ${d.deals.length} deal${d.deals.length === 1 ? '' : 's'} · ${d.categories.length} categor${d.categories.length === 1 ? 'y' : 'ies'}`, { size: 8.5, color: QUIET });
  p.text(M + 412, top + 18, 'Total billed', { size: 9, font: 'bold', align: 'right' });
  p.text(RIGHT - 6, top + 18, usd(d.totalCents), { size: 10, font: 'bold', align: 'right' });

  // ---- Footers, now that the page count is known
  pages.forEach((pg, i) => {
    pg.line(M, 744, RIGHT, 744, { color: RULE });
    pg.text(M, 760, fit(d.footer || `${d.from} · Invoice to ${d.customer.name}`, 400, 8), { size: 8, color: QUIET });
    pg.text(RIGHT, 760, `Page ${i + 1} of ${pages.length}`, { size: 8, color: QUIET, align: 'right' });
  });

  return pdf.toBuffer();
}

export const invoiceFilename = (customerName, draft = true) =>
  `Invoice-${String(customerName).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}${draft ? '-DRAFT' : ''}.pdf`;
