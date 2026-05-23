# reposec.site Domain Setup

Use this only after buying `reposec.site` or replacing it with the domain you actually buy.

## Files Added

- `index.html` - public sales page for the INR 499 Repo Security Mini-Audit.
- `CNAME` - GitHub Pages custom domain file set to `reposec.site`.
- `.nojekyll` - keeps GitHub Pages from applying Jekyll processing.

## GitHub Pages Setup

1. Push this repo to GitHub.
2. In the repo, open Settings -> Pages.
3. Set source to the branch and root folder that contains `index.html`.
4. Set the custom domain to `reposec.site`.
5. Keep HTTPS enabled after GitHub finishes DNS verification.

## DNS Setup

If this is a user or organization Pages site, add these apex `A` records at the registrar:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

For `www.reposec.site`, add a `CNAME` record pointing to your GitHub Pages host, for example:

```text
<your-github-username>.github.io
```

If this repo is served as a project page instead of a user/organization page, GitHub Pages may show a different target host. Use the exact target GitHub shows in Settings -> Pages.

## Before Sharing

- Confirm the domain opens the landing page.
- Confirm the UPI button opens a payment app on mobile.
- Confirm `repo-security-499-upi-qr.png` scans to `sajidofaspire@oksbi` with amount `INR 499`.
- Send the domain in warm outreach with `repo-security-499-share-card.png` and `repo-security-499-share-card-caption.txt`.
