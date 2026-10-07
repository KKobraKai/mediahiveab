# Mediahive AB — status

## Live
- Production: https://mediahiveab.pages.dev/
- Preview (this deploy): https://6a76c349.mediahiveab.pages.dev
- Cloudflare Pages project: `mediahiveab` (account 506c56e241cb44128e0d7d243e5a97ae)
- Domain mediahiveab.com: available, NOT purchased / NOT attached

## Done
- Single-page bilingual site (SV/EN toggle)
- GitHub repo https://github.com/KKobraKai/mediahiveab (public)
- Pages project + wrangler deploy
- Repo secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID set

## Pending
- GitHub Actions workflow file could not be pushed (OAuth token lacks `workflow` scope). Local copy at `.github/workflows/pages-deploy.yml`. Push with a token that has `workflow` scope, or add the file in the GitHub UI.

## Next (domain)
1. Purchase mediahiveab.com when ready (do not auto-buy)
2. Cloudflare Pages → mediahiveab → Custom domains → Add `mediahiveab.com` (+ www if wanted)
3. Follow DNS instructions Pages shows (or use Cloudflare Registrar DNS)
4. Optional: mailbox @mediahiveab.com, then update contact email on the site
