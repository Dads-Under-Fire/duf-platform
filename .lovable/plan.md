
# Case Intelligence V1 — Core Structure

Scope: replace placeholder `/case-intelligence` page with a real shell + 4 tabs (Evidence, Timeline, Patterns, Case Report), add a read-only Entry Details page, and introduce a case-level analysis state model. Reuse all Case Log mappings, formatters, and edit form. No UI redesign.

Note: I'll set the prior nav-active-paint work aside and revert the unfinished scope creep there if it conflicts; persistent shell + optimistic active state stay.

## Routes

- `/case-intelligence` → `CaseIntelligence` page (tabs container, case selector at top, persistent within shell)
- `/case-intelligence/entry/:entryId` → read-only `EntryDetails` page (Edit button routes back to `/` Case Log in edit mode for that entry)

Tab state lives in the URL via `?tab=evidence|timeline|patterns|report` (default timeline) so deep links work and switching is instant.

## New / changed files

### New components (`src/components/case-intelligence/`)
- `CaseIntelligenceHeader.tsx` — reuses existing `CaseSelector`, shows case totals (`X Case Logs`, `Last entry: MM/DD/YY`)
- `TabNav.tsx` — Evidence | Timeline | Patterns | Case Report (URL-driven, optimistic active styling)
- `EvidenceTab.tsx` — attachment-centric list, filter by entry type, sort, date range. Each row: entry type badge, event date, source entry context, filename, file size, evidence note, action `Open Case Log` (links to `/case-intelligence/entry/:id`). Empty state copy as specified.
- `TimelineTab.tsx` — case-log-centric list grouped by date. Entry type filter, sort, date range. Card: time, context/title, summary preview, type badge, attachment count, pattern status pill. Whole card clickable → entry details. No three-dot menu.
- `PatternsTab.tsx` — three states (never analyzed, analyzed+current, analyzed+stale). Pattern cards (name, explanation, related event count, first/last date, View Events). `Analyze Case` CTA. Calls placeholder mutation (no AI invocation yet — scaffolded result shape, real plumbing optional V1).
- `CaseReportTab.tsx` — `Generate Case Report` CTA. Scaffolded sections: overview counts, detected patterns summary, linked evidence references, AI summary slot.
- `PatternStatusBadge.tsx` — shared "Not yet analyzed" / "Awaiting case analysis" / pattern-name pill.
- `EntryTypeFilter.tsx`, `DateRangeFilter.tsx`, `SortControl.tsx` — shared filter primitives used by Evidence + Timeline.

### New page
- `src/pages/CaseIntelligence.tsx` — replaces existing `Evidence.tsx` placeholder content. Routes `Outlet` for entry details handled at App level instead.
- `src/pages/EntryDetails.tsx` — read-only entry view, sections rendered conditionally by `entry_type`. Actions: `Edit Case Log`, `Delete Log`, `Open attachment`.

### New hooks (`src/hooks/`)
- `useCaseEvidence.ts` — joins `case_log_attachments` + parent `case_log_entries` for selected case
- `useCaseTimeline.ts` — full `case_log_entries` for selected case with attachment counts (extends existing recent hook with no limit + filters)
- `useCaseEntry.ts` — single entry + its attachments
- `useCaseAnalysis.ts` — reads/creates a case-level analysis row; computes `staleness` by comparing `latest_analysis.created_at` vs max(`entries.updated_at`, `attachments.created_at`) within the case
- `useActiveCase.ts` — single source of selected case id, persisted to localStorage so Case Log and Case Intelligence stay in sync

### Routing/Edit handoff
- App route added: `/case-intelligence/entry/:entryId`
- `Edit Case Log` action navigates to `/?editEntry=:id`. `CaseLog.tsx` reads the query param, switches `activeCaseId` to the entry's case, and triggers existing `loadEntryForEdit` in `CaseLogEntryForm` (small prop addition: `initialEditEntryId`).

## Database

New tables (migration):

- `case_intelligence_analyses`
  - `id uuid pk`, `user_id uuid`, `case_id uuid fk → cases`, `created_at timestamptz default now()`, `status text` ('completed'|'failed'), `summary jsonb` (placeholder), `entries_snapshot_max_updated_at timestamptz` (used for staleness)
  - RLS: user can select/insert/delete own rows
- `case_intelligence_patterns`
  - `id uuid pk`, `analysis_id uuid fk → case_intelligence_analyses`, `case_id uuid`, `user_id uuid`, `name text`, `explanation text`, `related_entry_ids uuid[]`, `first_event_date date`, `last_event_date date`
  - RLS: scoped via analysis ownership

No edge function in V1 — `Analyze Case` inserts a stub analysis row + a couple of placeholder patterns derived from existing entries (e.g., grouping by entry_type with count ≥ 3) so the state machine is real even before the AI is wired.

## Stale/new-analysis state

```text
hasAnalysis = latest analysis row exists
maxEntryUpdate = max(entries.updated_at) ∪ max(attachments.created_at) for case
isStale = hasAnalysis && maxEntryUpdate > latest.created_at
newCount = count(entries where updated_at > latest.created_at)
```

UI mapping:
- `!hasAnalysis` → Patterns: "Not yet analyzed", Timeline cards show same
- `hasAnalysis && isStale` → Timeline cards for newer entries show "Awaiting case analysis"; Patterns tab shows banner "{newCount} new case logs are ready for analysis" above existing patterns
- `hasAnalysis && !isStale` → Timeline cards show pattern name(s) for that entry from `related_entry_ids`, or "No pattern assigned"

## Real vs scaffolded

- Real: routes, tab nav, case scoping, evidence list, timeline list with grouping/filters/click-through, entry details read-only view, edit handoff to Case Log, analysis state machine, pattern badge logic, DB tables + RLS, `Analyze Case` writes a real stub row that flips state.
- Scaffolded: AI-generated pattern detection (stub heuristic), Case Report content body (sections render with counts + linked evidence; AI narrative is a placeholder string).

## Out of scope for V1

- No mobile-specific layout pass (recommended next)
- No per-file analyze, no file processing states, no paste-evidence input
- No Summary tab (renamed Case Report)
- No edge function deploy yet

## Recommended next prompt

> "Adjust Case Intelligence layouts for mobile: collapse the case selector + tab nav into a sticky header, make Evidence/Timeline cards single-column, ensure filters open in a sheet, and verify Entry Details and Patterns tabs are usable at 375×812."
