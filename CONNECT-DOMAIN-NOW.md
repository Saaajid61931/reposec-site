# Connect `reposec.site` To GitHub Pages

For click-by-click setup, use `DOMAIN-SETUP-WALKTHROUGH.md`.

Current DNS check showed the domain is still on parking:

```text
reposec.site      A      44.227.65.245
reposec.site      A      44.227.76.166
www.reposec.site  CNAME  pixie.porkbun.com
```

Those records need to be replaced with GitHub Pages records after the GitHub repo is published.

## 1. Create The GitHub Repo

1. Open GitHub and create a new public repo named `reposec-site`.
2. Upload the contents of this folder, not the folder itself and not a zip file:

```text
C:\Users\sajid\Documents\Playground\reposec-site\_publish-domain
```

3. Confirm the repo root contains:

```text
index.html
CNAME
.nojekyll
repo-security-499-upi-qr.png
repo-security-499-share-card.png
```

`CNAME` must contain exactly:

```text
reposec.site
```

## 2. Enable GitHub Pages

In the new repo:

1. Open Settings.
2. Open Pages.
3. Source: Deploy from a branch.
4. Branch: `main`.
5. Folder: `/root`.
6. Save.
7. In Custom domain, enter:

```text
reposec.site
```

8. Save.

Do this before changing DNS. GitHub warns that pointing DNS first can allow takeover risk if the custom domain is not attached to your repo.

## 3. Change DNS At The Domain Registrar

Delete parking/default records for `@` and `www`, including:

```text
A      @    44.227.65.245
A      @    44.227.76.166
CNAME  www  pixie.porkbun.com
```

Add these GitHub Pages records:

```text
Type  Host  Value
A     @     185.199.108.153
A     @     185.199.109.153
A     @     185.199.110.153
A     @     185.199.111.153
CNAME www   <your-github-username>.github.io
```

Do not include `/reposec-site` in the `www` CNAME value.

Optional IPv6 records:

```text
AAAA  @     2606:50c0:8000::153
AAAA  @     2606:50c0:8001::153
AAAA  @     2606:50c0:8002::153
AAAA  @     2606:50c0:8003::153
```

## 4. Verify From PowerShell

Run:

```powershell
Resolve-DnsName reposec.site -Type A
Resolve-DnsName www.reposec.site -Type CNAME
```

Expected `A` values:

```text
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

Expected `www` target:

```text
<your-github-username>.github.io
```

DNS can take up to 24 hours, but it often changes faster.

## 5. Finish In GitHub Pages

When GitHub shows the domain as configured:

1. Wait for the HTTPS certificate.
2. Turn on Enforce HTTPS.
3. Open:

```text
https://reposec.site
```

4. Open `LIVE-SEND-BOARD.html`, paste `https://reposec.site`, and start sending the first 15 warm leads.
