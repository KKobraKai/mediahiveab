# Mediahive AB

Company website for Mediahive AB (org.nr 559493-6790) — practical AI for businesses.

## Live

- Cloudflare Pages: https://mediahiveab.pages.dev/
- Custom domain `mediahiveab.com` — not attached yet (purchase separately, then add in Pages → Custom domains)

## Local

Open `public/index.html` in a browser, or:

```bash
npx serve public
```

No build step. Swedish-first with EN toggle.

## Deploy

```bash
npm install
npx wrangler pages deploy public --project-name=mediahiveab
```

Deploys are manual: run `npm run deploy` (same command as above; it uploads `public/` only). There is no GitHub Actions workflow, and pushing to `main` does not deploy. The Pages project is Direct Upload (not Git-connected). Always deploy `public`, never `.`.

## Contents
- Hero + CTAs (email / phone)
- What I do (services)
- Featured product: [Referenskortet](https://referralcard.ai/)
- BNI Elit Västerås + contact
- Footer with org details

## Synergimotorn (Cloudflare Pages Function)

API: `functions/api/synergimotor.js` with helpers under `functions/_lib/`.

- Budget guardrails:
  - Pre-call reservation uses the real enforced caps: prompt total chars (`SYNERGI_MAX_PROMPT_CHARS`, default 16000 ≈ 4k tokens/call) and max output tokens (`SYNERGI_MAX_OUTPUT_TOKENS`). Worst-case is computed from the pricing table for the active `<provider>:<model>`. Unknown models are refused (fail closed).
  - On success and on failure, the pre-reservation is settled to actual usage observed from the upstream provider. Failures are not “fully refunded” — usage from partial calls is accounted for.
  - Set a provider-side monthly budget limit as a backstop (OpenAI billing portal). This is required operationally to guarantee the monthly cap cannot be exceeded due to any unforeseen bug or external change.
- Concurrency and counters:
  - Atomic counters (per-IP rate limit and monthly spend) use a Durable Object. This is required; runs refuse when unavailable. On Free plan, DOs must be SQLite-backed.
  - Deploy the counter as a separate Worker:
    - Worker source: `workers/counter/src/index.js` (class `SynergiCounter`)
    - `wrangler.toml` includes `new_sqlite_classes = ["SynergiCounter"]`
    - Publish the worker via `wrangler deploy` (manual; not in CI)
  - Bind the DO to Pages using a Durable Object namespace with `script_name` set to the deployed Worker (`synergi-counter`), binding name `SYNERGI_COUNTER`. Example Pages Env binding:
    - Name: `SYNERGI_COUNTER`, Class: `SynergiCounter`, Script name: `synergi-counter`
- SSRF protections for website fetch:
  - Allows only `http`/`https`.
  - Blocks `localhost`, `*.localhost`, trailing-dot hosts (`localhost.`), IPv4 private/link-local/loopback/CGNAT (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `127/8`), “this network” `0.0.0.0/8`, multicast `224/4`, benchmark `198.18/15`, and the metadata IP `169.254.169.254`.
  - Blocks IPv6 loopback/unspecified `::1`/`::`, ULA `fc00::/7`, link-local `fe80::/10`, site-local `fec0::/10`, multicast `ff00::/8`, and IPv4-mapped forms like `::ffff:127.0.0.1`.
  - Redirects are followed in manual mode with revalidation and a hop limit of 3. Streaming response bodies are hard-capped in bytes.
  - Note: DNS rebinding cannot be fully prevented in a generic fetcher. The production deployment must rely on Cloudflare’s resolver and egress to reduce risk; do not allow user-controlled target hosts beyond public websites.

### Configuration

- `SYNERGI_PROVIDER` (mock|openai|stdin)
- `SYNERGI_MODEL` (default `gpt-4o-mini`)
- `SYNERGI_PRICE_TABLE_JSON` — map of `"<provider>:<model>": { "inputPer1k": <SEK>, "outputPer1k": <SEK> }`. Unknown entries are refused.
- `SYNERGI_SPEND_CAP_SEK`, `SYNERGI_SPEND_REFUSE_AT_SEK` (or `SYNERGI_SPEND_REFUSE_RATIO`)
- `SYNERGI_MAX_INPUT_TOKENS`, `SYNERGI_MAX_OUTPUT_TOKENS`, `SYNERGI_MAX_PROMPT_CHARS` (prompt chars are enforced; tokens are used for worst-case math)
- `SYNERGI_FIELD_CAP_CHARS` (per-field truncation; defaults to 200)
- `SYNERGI_RATE_LIMIT_PER_IP_PER_DAY` (default 5)
- `SYNERGI_FETCH_CAP_BYTES` (default 120_000)
- `SYNERGI_MAX_B_COUNT` (default 5)
- Optional Durable Object binding: `SYNERGI_COUNTER` (class `SynergiCounter` in `functions/_lib/counter.js`)
  - For Pages, use the external Worker `synergi-counter` and bind by script_name as above.

