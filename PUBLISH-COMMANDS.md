# Publish Commands

These commands are for you to run locally when you are ready. They create a public GitHub repo and push the prepared static site. Do not run them until you have reviewed the publish folder.

## Free GitHub Pages First

Prepare a folder without `CNAME`:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\prepare-publish-folder.ps1 -Mode Free -Force
```

Then review `.\_publish-free`.
The helper updates files in place and does not recursively delete folders.

From that publish folder:

```powershell
cd .\_publish-free
git init
git add .
git commit -m "Launch RepoSec audit landing page"
gh repo create reposec-site --public --source . --remote origin --push
```

After pushing, open GitHub repo Settings -> Pages and enable Pages from the default branch root. Use the URL GitHub shows, usually:

```text
https://<your-github-username>.github.io/reposec-site/
```

Before sending outreach, replace `https://reposec.site` in `OUTREACH.md` with the GitHub Pages URL.

## Domain Version

Prepare a folder with `CNAME`:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\prepare-publish-folder.ps1 -Mode Domain -Force
```

Then review `.\_publish-domain`.
The helper updates files in place and does not recursively delete folders.

From that publish folder:

```powershell
cd .\_publish-domain
git init
git add .
git commit -m "Launch RepoSec audit landing page"
gh repo create reposec-site --public --source . --remote origin --push
```

After pushing, configure GitHub Pages custom domain and DNS using `reposec-domain-setup.md`.

## Safety

- Publish only the generated publish folder, not the full `Playground` folder.
- Do not share private keys, passwords, OTPs, UPI PINs, or private repo contents.
- Ask for payment only after a useful preview is accepted.
