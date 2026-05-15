## Problem

When a downgrade is scheduled at period end via the Stripe Customer Portal, the app immediately shows the scheduled future plan (e.g. Core) as the current plan, even though Stripe still treats the existing plan (e.g. Case Builder) as live until the next billing date.

## Root cause

`supabase/functions/stripe-webhook/index.ts → syncSubscriptionFromStripe` derives the current plan from `stripeSub.items.data[0].price.id` unconditionally. When the Customer Portal schedules a plan switch at period end, the resulting `customer.subscription.updated` event can already carry the **future** price on `items.data[0]` (Portal-driven schedule changes often advance the subscription's item to the next-phase price while billing is deferred via the attached `subscription_schedule`). The code then writes that future price to `subscriptions.plan`, overwriting the live plan.

A secondary issue: the schedule reader detects a "future phase" but never extracts what the **current** phase's price actually is, so there is no authoritative "current live plan" signal when a schedule is attached.

## Fix overview

Treat `stripeSub.schedule` as the source of truth whenever it is attached:

- **Current plan / interval** = the phase where `start_date <= now < end_date` (or `now < end_date` if `start_date` is null on phase 0).
- **Pending plan / interval / effective_at** = the next phase whose `start_date >= currentPhase.end_date`.
- Only fall back to `items.data[0].price.id` when no schedule is attached.

This makes a scheduled downgrade visible without ever overwriting the live plan early. Once the effective date passes and Stripe transitions phases (firing another `customer.subscription.updated`), the new "current phase" naturally becomes the live plan and `pending_*` clears.

## Changes

### 1. `supabase/functions/stripe-webhook/index.ts`

Replace the current plan/pending derivation in `syncSubscriptionFromStripe` with schedule-aware logic:

```text
1. Read scheduleId = stripeSub.schedule
2. If scheduleId present:
     schedule = stripe.subscriptionSchedules.retrieve(scheduleId, { expand: ["phases.items.price"] })
     currentPhase = phases.find(p => (!p.start_date || p.start_date <= nowUnix) && (!p.end_date || nowUnix < p.end_date))
     futurePhase  = phases.find(p => p.start_date && p.start_date > nowUnix)

     currentPriceId    = currentPhase?.items?.[0]?.price (handle string | Stripe.Price)
     currentInterval   = currentPhase?.items?.[0]?.price?.recurring?.interval (when expanded)
     pendingPriceId    = futurePhase?.items?.[0]?.price
     pendingInterval   = futurePhase?.items?.[0]?.price?.recurring?.interval
     pendingEffectiveAt= futurePhase?.start_date

3. else:
     currentPriceId  = items.data[0].price.id
     currentInterval = items.data[0].price.recurring.interval
     pending* = null

4. plan = PRICE_TO_PLAN[currentPriceId] (only update DB plan when known; otherwise leave existing)
   billingInterval = currentInterval ?? "month"
   pendingPlan = pendingPriceId ? PRICE_TO_PLAN[pendingPriceId] ?? null : null
```

Also subscribe to `customer.subscription_schedule.updated`, `.created`, `.canceled`, `.released`, `.aborted` and re-sync the underlying subscription so changes to the schedule itself (cancel scheduled change, change scheduled next plan again, schedule completes) flow through immediately.

Period start/end continue to come from `items.data[0].current_period_start/end` (these correctly reflect the **current** billing window even when a schedule is attached — that is exactly the window we want the live plan and credits to use).

### 2. `src/pages/Account.tsx` (small clarifications, no redesign)

- The "Plan" row already renders `plan` + `billing_interval` from `subscription`. Once the webhook stops overwriting these, this row is correct on its own.
- The existing pending-change banner already reads `subscription.pending_plan / pending_interval / pending_effective_at`. Tighten the copy slightly so it reads as a scheduled change rather than an alert (still uses existing tokens, no layout change):
  - "Scheduled change: **Core** — billed monthly · effective Jun 14, 2026"
- Add a one-line helper under the "Change plan" link when `pending_plan` is set, so a user clicking it again knows what they're modifying:
  - "You have a scheduled change. Opening the portal will let you modify or cancel it."

No new buttons, no layout reshuffling, no changes to `useProfile` (the columns it reads already exist).

### 3. No DB migration needed

`subscriptions.pending_plan`, `pending_interval`, `pending_effective_at`, `billing_interval`, `cancel_at_period_end` already exist (visible in `<supabase-tables>`). The fix is purely in how we **populate** these columns from Stripe.

## Testing

After deploy, walk through these in Stripe test mode and confirm both the Account page and the `subscriptions` row:

1. Paid plan, no schedule → `plan` matches live, `pending_*` null.
2. Schedule downgrade Case Builder → Core at period end → `plan` stays `case_builder`, `pending_plan = core`, `pending_effective_at` = period end. Account page shows Case Builder as Plan and the scheduled-change line.
3. While (2) is active, schedule a different next plan (Core → Pro) via Portal → `plan` still `case_builder`, `pending_plan` updates to `pro`.
4. Cancel the scheduled change in Portal → `pending_*` clears, `plan` unchanged.
5. Immediate upgrade (mid-cycle) → `plan` flips immediately, `pending_*` null, `billing_period_*` reflect new cycle.
6. Let the effective date pass (or simulate via Stripe CLI advancing the clock) → next `customer.subscription.updated` flips `plan` to the previously-pending plan and clears `pending_*`.

## Final report (after implementation)

Will return:
1. What was overwriting current plan state (schedule-driven `customer.subscription.updated` events whose `items.data[0].price` already carried the next-phase price).
2. New storage/display split (current = live phase from schedule or items; pending = next phase only).
3. Confirmation that Account shows live current plan during scheduled downgrades.
4. Behavior when re-opening Change plan with a pending schedule (Portal sees correct live sub; UI hint added; webhook re-syncs on schedule updates).
5. Remaining edge cases (multi-phase schedules beyond next, schedule `released` mid-cycle, Stripe test-clock skew, unmapped price IDs leaving plan unchanged rather than silent-downgrading).
