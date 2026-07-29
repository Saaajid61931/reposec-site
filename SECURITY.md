# Security policy

## Reporting a vulnerability

Email `security@reposec.site` with a concise description, impact, and safe reproduction steps. Do not include customer repository contents, personal data, access tokens, or raw secret values. Do not open a public issue for an undisclosed vulnerability.

We aim to acknowledge a valid report within three business days and provide an initial assessment within seven business days. Timelines depend on severity and reproducibility. We will coordinate remediation and disclosure with the reporter.

## Supported versions

RepoSec currently supports only the latest deployed production version and the current default branch. Older deployments, forks, and intentionally modified installations are not supported unless covered by a separate agreement.

## Safe-harbor boundaries

Use test accounts and data you own. Avoid service degradation, automated exploitation, social engineering, persistence, destructive actions, and access to other customers' data. Stop testing and report immediately if you encounter sensitive data.

The public disclosure policy and security contact are also published at `/.well-known/security.txt` and `/security` in the deployed application.
