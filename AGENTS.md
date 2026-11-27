# CS Sessions Hub

## Performance profile
- Tier: S for UI/caching/images; M for submissions/grading database path (decided 2026-11-27)
- Expected users (6 months): under 100
- Biggest growing tables: submissions / grading_jobs (~100k-1M rows/year)
- Freshness needs: instant for grading/submission status
- Images: barely any (avatars, logos, session materials)
- Infra budget: free tier baseline; no Redis/CDN/queues unless measured need
- Always use the `speed-engineer` skill when touching DB queries/schema, lists, data fetching, images or loading states.
