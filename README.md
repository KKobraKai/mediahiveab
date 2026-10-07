# Mediahive AB

Company website for Mediahive AB (org.nr 559493-6790) — practical AI for businesses.

## Live

- Cloudflare Pages: https://mediahiveab.pages.dev/
- Custom domain `mediahiveab.com` — not attached yet (purchase separately, then add in Pages → Custom domains)

## Local

Open `index.html` in a browser, or:

```bash
npx serve .
```

No build step. Swedish-first with EN toggle.

## Deploy

```bash
npm install
npx wrangler pages deploy . --project-name=mediahiveab
```

Or push to `main` — GitHub Actions deploys via wrangler (secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`).

## Contents

- Hero + CTAs (email / phone)
- What I do (services)
- Featured product: [Referenskortet](https://referralcard.ai/)
- BNI Elit Västerås + contact
- Footer with org details
