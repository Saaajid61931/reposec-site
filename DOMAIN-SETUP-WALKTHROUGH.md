# Domain Setup Walkthrough For `reposec.site`

Fill this in first:

```text
GitHub username: ____________________
GitHub repo name: reposec-site
Custom domain: reposec.site
www CNAME value: ____________________.github.io
```

## A. Upload The Site To GitHub

1. Open GitHub.
2. Click `+` -> `New repository`.
3. Repository name:

```text
reposec-site
```

4. Set visibility to `Public`.
5. Do not add README, license, or gitignore if GitHub asks. The site already has files.
6. Create repository.
7. Click `uploading an existing file`.
8. Open this local folder:

```text
C:\Users\sajid\Documents\Playground\reposec-site\_publish-domain
```

9. Drag/select all files inside `_publish-domain`, not the folder itself.
10. Commit message:

```text
Launch RepoSec audit landing page
```

11. Click `Commit changes`.

The repo root should show these files:

```text
index.html
CNAME
.nojekyll
LIVE-SEND-BOARD.html
repo-security-499-upi-qr.png
repo-security-499-share-card.png
```

## B. Turn On GitHub Pages

1. In the GitHub repo, open `Settings`.
2. In the left sidebar, open `Pages`.
3. Under `Build and deployment`, choose:

```text
Source: Deploy from a branch
Branch: main
Folder: /root
```

4. Click `Save`.
5. Under `Custom domain`, enter:

```text
reposec.site
```

6. Click `Save`.

Wait until GitHub shows a Pages URL or a DNS check message.

## C. Change DNS At The Registrar

Open the DNS records for `reposec.site`.

Delete these parking records if present:

```text
Type   Host   Value
A      @      44.227.65.245
A      @      44.227.76.166
CNAME  www    pixie.porkbun.com
```

Add these records:

```text
Type   Host   Value
A      @      185.199.108.153
A      @      185.199.109.153
A      @      185.199.110.153
A      @      185.199.111.153
CNAME  www    YOUR-GITHUB-USERNAME.github.io
```

Replace `YOUR-GITHUB-USERNAME` with your actual GitHub username.

Do not put:

```text
/reposec-site
https://
http://
```

inside the CNAME value.

## D. Verify DNS

Run in PowerShell:

```powershell
Resolve-DnsName reposec.site -Type A
Resolve-DnsName www.reposec.site -Type CNAME
```

Expected `reposec.site` A records:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Expected `www.reposec.site` CNAME:

```text
YOUR-GITHUB-USERNAME.github.io
```

## E. Finish

1. Go back to GitHub repo -> Settings -> Pages.
2. Wait for the domain check to pass.
3. Turn on `Enforce HTTPS` when GitHub allows it.
4. Open:

```text
https://reposec.site
```

5. Open:

```text
https://reposec.site/LIVE-SEND-BOARD.html
```

6. Send the first 15 warm leads.

