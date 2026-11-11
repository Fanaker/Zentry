# AGENTS.md

- Paginate large Supabase fetches with `.range()` in pages of 1000: PostgREST silently truncates responses to 1000 rows, so a single `.limit(N > 1000)` drops older rows (this is what hid the 2025 transactions). `useTransactions` in `src/hooks/useFinanceData.ts` is the reference pattern; apply it to any table that can exceed 1000 rows.
- UI tables must not hard-cap visible rows (the old `filtered.slice(0, 500)` in Movimientos hid valid rows beyond the cap).
