# Mediahive AB — status

## Live
- Production: https://mediahiveab.com/ and https://mediahiveab.pages.dev/
- Latest deploy preview: https://02cfd80a.mediahiveab.pages.dev
- Cloudflare Pages project: `mediahiveab` (account 506c56e241cb44128e0d7d243e5a97ae)

## Done
- Single-page bilingual site (SV/EN toggle)
- BNI guest-visit card in Kontakt & BNI (mailto/tel → Kaj)
- Referenskortet featured product kept
- GitHub repo https://github.com/KKobraKai/mediahiveab (public)
- Pages project + wrangler deploy
- Repo secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set
- Custom domain mediahiveab.com attached and serving

## Pending
- GitHub Actions workflow file may lack `workflow` scope on push. Local copy at `.github/workflows/pages-deploy.yml`. Prefer direct `wrangler pages deploy` after edits.
