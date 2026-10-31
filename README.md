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
