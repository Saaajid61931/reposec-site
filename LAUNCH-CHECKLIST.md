# RepoSec Launch Checklist

Goal: get one legal, ethical payment of at least INR 499 through UPI.

## Domain Buy Rule

Buy `reposec.site` only if the checkout total is around USD 1-2 for the first year. Skip upsells.

Domain bought: follow `CONNECT-DOMAIN-NOW.md` or the click-by-click `DOMAIN-SETUP-WALKTHROUGH.md`.

## Publish With Domain

1. Create a new public GitHub repo named `reposec-site`.
2. Upload only the files in this folder. If using `reposec-site-deploy-domain.zip`, extract it first and upload the extracted files, not the zip itself.
3. Enable GitHub Pages from the default branch root.
4. Add the custom domain from `CNAME`.
5. Configure DNS using `reposec-domain-setup.md`.
6. Open `https://reposec.site` on mobile and desktop.
7. Scan the QR and confirm it opens UPI for `sajidofaspire@oksbi`, amount `INR 499`.

## Publish Without Domain

1. Use `reposec-site-deploy-free-github-pages.zip` only as a transfer package; extract it before uploading files to GitHub.
2. Do not upload `CNAME`.
3. Enable GitHub Pages from the repo root.
4. Use the free URL GitHub shows, usually `https://<your-github-username>.github.io/reposec-site/`.
5. Replace `https://reposec.site` with the free URL in the outreach message before sending.

## Publish Helper

From the `reposec-site` folder, run:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\prepare-publish-folder.ps1 -Mode Free -Force
```

This creates `_publish-free`, a clean folder ready for a free GitHub Pages repo. For the domain version, use `-Mode Domain` to create `_publish-domain`.

See `PUBLISH-COMMANDS.md` for the `git` and `gh` commands to run after you review the generated folder.

## Sell

1. Open `LIVE-SEND-BOARD.html`.
2. Paste the live URL.
3. Send the warm WhatsApp/DM message to 15 permission-safe contacts.
4. Track every send in the board or `lead-tracker.csv`.
5. When someone replies `REPO`, confirm ownership/permission before reviewing.
6. Send a preview first.
7. Ask for UPI payment only after the preview is accepted.
8. Deliver the final report only after payment is credited.

## Completion

The earning goal is complete only after INR 499 or more is actually received and the transaction/reference is recorded.
