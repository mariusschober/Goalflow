# Historical credential actions

Status captured 2026-09-03. This is a release-blocking security ledger, not a
place to paste credentials. Record only non-secret identifiers and hashes.

## Historical Firebase / Google API key

**Status: OWNER ACTION REQUIRED. Do not ignore this finding yet.**

Forensic evidence:

- Commit `84bd036ba25d825b5fae36cb780842d9221ed097` contains
  `firebase-applet-config.json` with a syntactically valid Google API key and a
  coherent Firebase client configuration for project `upheld-flow-201513`.
- Commit `7fa5a17e2b8892df91c2b23c4e551b67031731db` deletes the file. It is absent
  from the current candidate tree but remains recoverable from public history.
- The value is therefore treated as a real Firebase client API key. Firebase
  client keys are not equivalent to a server credential, but an unrestricted
  key can still be abused for enabled Google APIs or quota consumption.
- Full-history Gitleaks intentionally continues to fail on the exact historical
  finding. No broad rule/path allowlist and no history rewrite has been added.

Required owner action in the Google Cloud/Firebase console:

1. Locate the API key belonging to project `upheld-flow-201513` without copying
   it into an issue, commit, chat, or CI log.
2. If Goalflow no longer uses that Firebase project, delete/revoke the key and
   disable unused APIs. If it is still required, rotate it when exposure or
   usage is uncertain, restrict it to the exact required APIs, and add the
   narrowest valid application/referrer restrictions.
3. Review recent key usage and quotas for unexpected traffic.
4. Record below the action date, operator, disposition, restriction scope, and
   a one-way fingerprint only. Never record the key itself.
5. Only after that evidence exists, add the one exact Gitleaks finding
   fingerprint to `.gitleaksignore` with a reference to this ledger and rerun
   the complete-history scan.

Completion record:

```text
Date: NOT COMPLETED
Operator: NOT RECORDED
Disposition (revoked / rotated / restricted): NOT RECORDED
Allowed APIs / application restrictions: NOT RECORDED
One-way key fingerprint: NOT RECORDED
Usage review result: NOT RECORDED
```

## Synthetic Telegram fixtures

**Status: VERIFIED SYNTHETIC; exact fingerprints ignored.**

The remaining two `generic-api-key` findings originate only from hard-coded
`TELEGRAM_WEBHOOK_SECRET` values in test files on the archived Telegram branch:

- commit `04aa5b4d97de0f626bd824c6b1c51c651cc14a1d`,
  `server/telegram/bot.adversarial.test.ts`, line 90;
- commit `bb5c7af0908dde92913795cd149a1c3ab6e3df06`,
  `server/telegram/bot.test.ts`, line 139.

They are test-only invented strings, are not present in the canonical tree,
and cannot authenticate to a Telegram bot or deployed Goalflow service. Their
two exact Gitleaks fingerprints are listed in `.gitleaksignore`; the Telegram
rule, file paths, commits, and other findings remain scanned. When Telegram is
ported, fixtures must use conspicuously synthetic low-entropy construction so
new commits do not require additional ignores.

## History-rewrite decision

History is not rewritten at this stage. Every branch head has already been
audited and tagged, the Firebase value is a client configuration identifier
rather than a service-role credential, and rewriting all published branches
would invalidate the existing provenance. Reconsider coordinated history
rewriting only if the owner confirms the historical value grants materially
privileged access that cannot be neutralized by revocation or restriction.
