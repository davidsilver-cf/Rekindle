// Creating a deal from Rekindle, in one pass:
//   1. (New company) the Campfire customer, then its Billback Customer tag,
//      linked to the customer.
//   2. The Deals tag.
//   3. The deal's setup (billing type, who it bills) and approver.
// Each Campfire record is looked up by name first and reused if it exists, so
// running it again after a failure part-way never makes duplicates.
import { BILLING_TYPES } from './setup.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function validateNewDeal(form, config) {
  const errors = [];
  const name = String(form.name || '').trim();
  const billingType = form.billingType;
  if (!name) errors.push('Enter the deal name.');
  else if (name.length > 250) errors.push('Deal names can be at most 250 characters.');
  else if (config.deals.some((d) => same(d.dealsTag, name))) errors.push(`There's already a deal called "${name}".`);
  if (!BILLING_TYPES.includes(billingType)) errors.push('Choose a billing type.');
  let customer = null;
  let newCompany = null;
  if (billingType === 'Deal' || billingType === 'Fund') {
    if (form.customer === 'new') {
      const company = String(form.companyName || '').trim();
      if (!company) errors.push('Enter the new company\'s name.');
      else if (config.billbackCustomers.some((c) => same(c.name, company))) errors.push(`"${company}" is already a billback customer; pick it from the list.`);
      if (form.companyEmail && !EMAIL_RE.test(form.companyEmail)) errors.push('The company email isn\'t a valid address.');
      newCompany = { name: company, email: String(form.companyEmail || '').trim() || null };
    } else {
      customer = config.billbackCustomers.find((c) => c.billbackTagId === Number(form.customer)) || null;
      if (!customer) errors.push(`A ${billingType} deal needs the billback customer it bills.`);
    }
  }
  const approver = String(form.approver || '').trim().toLowerCase();
  if (approver && !EMAIL_RE.test(approver)) errors.push('The approver email isn\'t a valid address.');
  return { errors, name, billingType, customer, newCompany, approver: approver || null };
}

// api = { createTag, createCustomer, findCustomerByName, listTags }
export async function createDeal(plan, { config, store, api, user, log = () => {} }) {
  const done = [];
  const say = (event, extra = {}) => log(JSON.stringify({ event, deal: plan.name, ...extra }));
  let customer = plan.customer;

  if (plan.newCompany) {
    // The Campfire customer.
    let cf = await api.findCustomerByName(plan.newCompany.name).catch(() => null);
    if (cf) done.push(`Used the existing Campfire customer ${plan.newCompany.name}`);
    else {
      cf = await api.createCustomer(plan.newCompany);
      done.push(`Created the Campfire customer ${plan.newCompany.name}`);
      say('customer_created', { customerId: cf.id });
    }
    // Its Billback Customer tag.
    const existing = (await api.listTags(config.tagGroups.billbackCustomer)).find((t) => same(t.name, plan.newCompany.name));
    const tag = existing || (await api.createTag({ name: plan.newCompany.name, group: config.tagGroups.billbackCustomer, customer: cf.id }));
    if (!existing) { done.push(`Created the Billback Customer tag ${plan.newCompany.name}`); say('billback_tag_created', { tagId: tag.id }); }
    await store.saveCustomerLink(tag.id, cf.id, user.email);
    customer = { name: plan.newCompany.name, billbackTagId: tag.id, customerId: cf.id, campfireId: null };
  }

  // The Deals tag.
  const existingDeal = (await api.listTags(config.tagGroups.deals)).find((t) => same(t.name, plan.name));
  const dealTag = existingDeal || (await api.createTag({ name: plan.name, group: config.tagGroups.deals }));
  if (!existingDeal) { done.push(`Created the Deals tag ${plan.name}`); say('deal_tag_created', { tagId: dealTag.id }); }

  // Setup and approver.
  await store.saveDealSetup(dealTag.id, plan.name, { billingType: plan.billingType, customer: plan.billingType === 'Deal' || plan.billingType === 'Fund' ? customer : null }, [], user.email);
  if (plan.approver) await store.setApprover(dealTag.id, plan.approver, user.email);
  await store.audit(user.email, 'deal_created', { name: plan.name, dealsTagId: dealTag.id, billingType: plan.billingType, customer: customer?.name ?? null, newCompany: Boolean(plan.newCompany) });
  return { dealTagId: dealTag.id, done };
}
