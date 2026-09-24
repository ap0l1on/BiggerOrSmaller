# Security Policy

## Supported versions

Outweigh is a static game site. The latest `main` branch is the supported
version; older deploys receive no updates.

## Reporting a vulnerability

Please open a **private** report via GitHub's
[private vulnerability reporting](../../security/advisories/new)
on this repository. Include:

- what you found and where (URL, file, commit),
- steps to reproduce,
- what you think the impact is.

We aim to acknowledge reports within 5 days and to fix confirmed issues
within 30 days. Please do not open public issues for vulnerabilities.

## Scope notes

- The site has no backend, accounts, or cookies. The only third-party script
  is Cloudflare Web Analytics (page views only).
- Company names are rendered as text (no `innerHTML`); there is no `eval`.
- Market data ships as static JSON refreshed by a pinned GitHub Action.
- `npm audit` must show no high or critical advisories before launch.
