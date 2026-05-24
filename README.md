# RepoSec Site

Small GitHub Pages site for selling the INR 499 Repo Security Mini-Audit.

## Offer

- Live page: `https://reposec.site`
- Public intake: `https://reposec.site/request.html`
- Passive review for one GitHub repo or app folder.
- Checks dependencies, secret patterns, GitHub Actions permissions, SECURITY.md, Dependabot, and five prioritized fixes.
- UPI payout: `sajidofaspire@oksbi`.
- Payment timing: after a useful preview is accepted, before the final report.

## Deploy

1. Create a new GitHub repo, for example `reposec-site`.
2. Push the contents of this folder as the repo root.
3. Enable GitHub Pages from the default branch root.
4. If using the free GitHub Pages URL, do not upload `CNAME`; see `FREE-GITHUB-PAGES.md`.
5. Buy `reposec.site` only if checkout is around USD 1-2.
6. If using the domain, add the DNS records described in `reposec-domain-setup.md`.
7. Since `reposec.site` is now bought, follow `CONNECT-DOMAIN-NOW.md`.
8. If you want click-by-click help, use `DOMAIN-SETUP-WALKTHROUGH.md`.

Do not upload unrelated workspace files. This folder is intentionally small so the sales site stays clean.

## Packages

Run `make-packages.ps1` from this folder to rebuild:

- `reposec-site-deploy-domain.zip` - includes `CNAME` for `reposec.site`.
- `reposec-site-deploy-free-github-pages.zip` - excludes `CNAME` for the free GitHub Pages URL.
- `reposec-site-deploy.zip` - compatibility copy of the domain zip.

GitHub Pages needs the extracted files at the repository root. Do not upload the zip file itself as the website.

## Publish Helper

Run `prepare-publish-folder.ps1` from this folder to create a clean upload folder:

- `-Mode Free` creates `_publish-free` without `CNAME`.
- `-Mode Domain` creates `_publish-domain` with `CNAME`.

See `PUBLISH-COMMANDS.md` for the exact GitHub commands to run after reviewing the folder.

## Sell

- Send `https://reposec.site` first.
- For public visitors who are not in your DMs, send `https://reposec.site/request.html`.
- The `.github/ISSUE_TEMPLATE` folder adds a structured mini-audit request form on GitHub.
- Use `OUTREACH.md` after the page is live.
- Use `LIVE-SEND-BOARD.html` to paste the live URL, copy outreach messages, open WhatsApp, and track the first 15 sends.
- Track sends and replies in `lead-tracker.csv`.
- Follow `LAUNCH-CHECKLIST.md` from domain purchase through first UPI close.
