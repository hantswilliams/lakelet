# Application screenshot

`query.png` is an unedited capture of the real Lakelet React application in its browser
test harness, backed by the Python sidecar from commit `97ee6aa`. Captured September 16,
2026. This is application UI, not a mockup or a native Tauri window capture.

Only generated data from `examples/sample-data/make_sample.py` is shown: 5,000 orders
for a fictional lakeside shop. Query:

```sql
select region, round(sum(amount)) as revenue
from orders where status = 'paid'
group by 1 order by 2 desc;
```

Capture through the browser at the desktop breakpoint. No real customer records, storage
credentials, or sidecar bearer tokens appear in the image. Sample CSVs and the throwaway
project remain outside the repository. The displayed timing describes this run only.
