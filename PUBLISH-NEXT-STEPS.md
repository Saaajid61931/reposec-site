# Publish Folder Ready

Mode: Domain
Folder: C:\Users\sajid\Documents\Playground\reposec-site\_publish-domain

Suggested next commands, run from this folder after you review the files:

~~~powershell
cd "C:\Users\sajid\Documents\Playground\reposec-site\_publish-domain"
git init
git add .
git commit -m "Launch RepoSec audit landing page"
gh repo create reposec-site --public --source . --remote origin --push
~~~

Then enable GitHub Pages in repo Settings -> Pages.

Public URL to use in outreach:

https://reposec.site

