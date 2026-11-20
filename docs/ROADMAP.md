<img src="images/rekindle-icon.png" alt="Rekindle logo" width="96">

# Rekindle Roadmap

November 15, 2026 · David Silver

What's planned for Rekindle, what we need from Campfire, and what still needs checking in a live workspace. See also the [Implementation Guide](IMPLEMENTATION.md).

## Planned

### Import splits

Load allocation splits from a file instead of typing them on the Deals page, for onboarding a firm with many allocation deals or a new split schedule.

**Why:** splits live in Rekindle's own database, not in Campfire, so Ember can't load them, and Claude has no way in other than typing them through a browser. An import gives both a door: Claude (or an Ember CSV export) turns the firm's schedule into the template, and an admin uploads it.

**Scope:**

- **Admins only**, on the Deals page or Settings.
- **Upload** a CSV or Excel file with columns: Deal, Billback customer, %, Effective from, Effective to (blank = open-ended).
- **Template download** with the right columns and an example row.
- **Preview before saving**, flagging: deals not found; customers not found (with the same name matching as invoice links); periods whose open rows don't total 100%; overlapping periods; bad dates or percentages.
- **Save on confirm:** each deal in the file has its splits replaced, and each change goes to the audit log.

**Status:** not started; wait for the go-ahead.

### Rename the billback customer with the deal

On **Rename**, an option "Also rename its billback customer" that renames the Campfire customer and its Billback Customer tag along with the Deals tag.

**Why:** a deal created with **New company** is effectively one thing with its customer; renaming the deal today leaves the customer (and the invoice's "Bill to") on the old name.

**Scope:** shown only for a Deal or Fund deal whose billback customer no other deal bills, so a shared fund customer can't be renamed by accident.

**Status:** not started; worth it if the prospect creates many deals with New company. Until then, rename the customer and its Billback Customer tag in Campfire.

## Asks of Campfire

Platform limits Rekindle works around today, to raise with Campfire's team.

| Ask | Workaround today |
| --- | --- |
| Let the app's Tags permission reach the tags API (`/coa/api/tag`) | Rekindle uses `CAMPFIRE_API_KEY` for that call |
| Include the user's email in `cf_ctx` | Users link their account once (Link my account, or an admin assigns them) |
| Allow apps the openid, email and profile scopes | Sign in with Campfire is hidden; people sign in to Rekindle directly |
| Custom app icons, including in the page header | Campfire's default icon shows |
| Use the app's name in the browser tab title (it says "App \| Campfire") | None |

## To verify in a live workspace

Built and tested against a stand-in Campfire, not yet confirmed against the real one.

- [ ] Reclass: the journal entry posts, and the source lines are marked Expensed
- [ ] New deal: creates the Deals tag, and for a new company the Campfire customer and its Billback Customer tag
- [ ] Invoice and journal entry links open the record from inside Campfire
- [ ] Payment Information box: Rekindle can read the entity's Invoice Message
