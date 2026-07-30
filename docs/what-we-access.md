# What we're asking for, exactly

*A plain-English note for restaurant owners considering the rewards app.*

Short version: you create a **read-only key** inside your own Toast account
and give it to us. It lets us see what was ordered and when. It cannot take
money, change anything, or touch your bank. You can switch it off in about
thirty seconds, whenever you like.

---

## What we are NOT asking for

- **Not your Toast login.** You never give us a username or password.
- **Not access to your bank or payouts.** Nothing we use touches money
  movement.
- **Not the ability to change anything.** The key we ask for is read-only.
  We cannot edit your menu, void a check, issue a refund, comp an item, or
  change a price.
- **Not your customers' payment details.** Card numbers are never exposed
  to us by Toast, and we do not ask for them.

## What the key does let us see

Three things, all read-only:

1. **Completed orders** — what was ordered, the prices, the time, and the
   guest's phone number *if they gave one at the till*
2. **Your menu** — item names and current prices, so the app shows the
   right thing
3. **Your restaurant details** — opening hours and your online-ordering
   link, so the app shows whether you're open

## What we actually read and keep

Of everything in an order, our software reads exactly two things: the
**item names and prices**, and the **guest's phone number**. That's what
turns a visit into points.

We store, per guest: their phone number, their points balance, and a short
list of recent orders (item names, time, location). Nothing else.

You do not have to take our word for this. The software is public and the
relevant code is a few dozen lines — the file is `backend/worker.js`, and
the function is `checksToOrders`. Any developer you trust can read it in
ten minutes.

## Who can see your numbers

Only you. Each restaurant's data is walled off with its own key and its own
storage. Your sales are never shown to another restaurant, and we do not
publish or resell them.

## Turning it off

Toast Web → **Integrations** → **Manage credentials** → delete the
credential. That's it. Everything stops immediately, and we cannot get it
back without you creating a new one.

## Setting it up

Toast Web → **Integrations** → **Manage credentials** → create a new
credential with read access to orders, menus and restaurant info. Toast
shows you a client ID and a secret. Send those to us **once**, privately —
not over text or email if you can avoid it — and we'll handle the rest.

If Toast asks who the integration is for, it's a custom integration for
your own restaurant.

---

## Fair questions people ask

**"Why do you need order history at all?"**
Because points have to be earned from something real. If the app just let
guests tap a button, anyone could give themselves a free meal. Reading the
actual tickets is what makes a reward mean something.

**"How far back do you look?"**
By default we start from the day you switch it on. If you want regulars to
get credit for past visits we can import up to 90 days, but that's your
call.

**"What if I want to stop?"**
Delete the credential (above). Your guests' balances stay frozen where they
are, and any vouchers already issued keep working at the counter so nobody
is left holding something worthless.

**"Does this slow down my POS?"**
No. We read from Toast's servers on a schedule, not from your terminals.
Nothing is installed on your hardware and nothing changes about how your
staff ring in an order.

**"How quickly do points show up?"**
About an hour and a half after a visit. That delay is deliberate — a check
sitting open mid-meal doesn't show its final total, and we'd rather be a
little slow than credit somebody the wrong amount.
