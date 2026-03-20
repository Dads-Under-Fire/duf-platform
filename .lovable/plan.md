

## Plan: Activate v7, Deactivate v6

Two SQL UPDATE statements to swap the active prompt version:

1. **Deactivate v6**: `UPDATE ai_system_prompts SET is_active = false WHERE id = '48e89fca-ed37-46b9-a1a4-c880ff51cb47'`
2. **Activate v7**: `UPDATE ai_system_prompts SET is_active = true WHERE id = 'ef0e3e7f-7e76-4865-83d7-f750c2bd7eab'`

These are data updates (not schema changes), so they'll be executed via a migration tool call. The edge function (`communication-shield`) already queries for `is_active = true`, so the swap takes effect immediately after execution.

### Technical detail
- v6 ID: `48e89fca-ed37-46b9-a1a4-c880ff51cb47`
- v7 ID: `ef0e3e7f-7e76-4865-83d7-f750c2bd7eab`
- There's also a stale v1 (`163e18c1`) marked active — I'll leave it as-is unless you want it deactivated too.

