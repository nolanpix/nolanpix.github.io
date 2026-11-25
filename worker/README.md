# nolanpix-counter -- deploy guide

A tiny Cloudflare Worker that counts page views + daily visitors for
nolanpix.github.io and feeds the on-page status bar. Free tier, **no custom
domain required**. Pick ONE of the two deploy paths.

After it is deployed you get a URL like
`https://nolanpix-counter.<your-subdomain>.workers.dev` -- send that URL to the
site owner (or set it in `assets/stats.js`, constant `STATS_ENDPOINT`) and the
status bar lights up.

---

## Path A -- Dashboard, no CLI (easiest)

1. Create a free account at <https://dash.cloudflare.com> and log in.
2. Left sidebar -> **Storage & Databases -> KV** -> **Create a namespace**,
   name it `nolanpix_counter`. (It is now listed with an ID.)
3. Left sidebar -> **Compute (Workers) -> Workers & Pages** -> **Create** ->
   **Create Worker**. Name it `nolanpix-counter`, click **Deploy** (deploys a
   hello-world), then **Edit code**.
4. Delete the sample, paste the entire contents of `counter.js`, click
   **Deploy**.
5. Back on the Worker's page -> **Settings -> Bindings -> Add -> KV namespace**.
   Variable name **must be** `COUNTER`; namespace = `nolanpix_counter`. Save.
6. Copy the Worker URL at the top (`https://nolanpix-counter.<sub>.workers.dev`).
   Open it in a browser -- you should see `{"ok":true,"service":"nolanpix-counter"}`.

Done. Give that URL to wire the site.

---

## Path B -- Wrangler CLI (for developers)

```bash
npm install -g wrangler          # or: npm i -D wrangler
cd worker
wrangler login                   # opens a browser to authorize
wrangler kv namespace create COUNTER
#   -> prints: id = "xxxxxxxx...". Paste that id into wrangler.toml.
wrangler deploy
#   -> prints: https://nolanpix-counter.<your-subdomain>.workers.dev
```

(Older wrangler versions use `wrangler kv:namespace create COUNTER` with a colon.)

---

## Test it

```bash
URL=https://nolanpix-counter.<sub>.workers.dev
# a hit from the site origin (counts one view):
curl -s -X POST "$URL/hit" -H 'Origin: https://nolanpix.github.io' \
  -H 'Content-Type: application/json' --data '{"path":"/"}'
# -> {"ok":true,"path":"/","pv":1,"dau":1}
# read-only stats:
curl -s "$URL/stats?path=/"
```

A request **without** the site Origin header is rejected (403) -- that is the
anti-abuse guard.

## Limits & upgrade path (honest notes)

- KV free tier: **100k reads/day, 1,000 writes/day, 1 write/sec per key.** Page
  views write to a per-path key and DAU writes only on a visitor's first daily
  hit, so a normal personal-blog day stays well under budget.
- KV has **no atomic increment**, so under heavy concurrency a few counts can be
  lost. Negligible at blog scale. If this site ever gets large, port the same
  logic to **Durable Objects** (atomic) or **D1** (100k writes/day) -- the client
  and endpoints do not change.
