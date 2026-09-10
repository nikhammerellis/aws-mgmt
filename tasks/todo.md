# UI cleanup — live-first ordering + SAML tab reframed for the awsgo model

Two asks, one session:

1. Live sessions and profiles carrying timers belong at the top of the profile
   list, not scattered alphabetically.
2. The SAML tab still models the pre-`awsgo` world — one `~/.saml2aws` block
   pinned to one AWS profile (`→ AWS: saml`). Reframe it around what
   `~/.saml2aws` actually holds (an identity provider) and the fan-out it now
   feeds, **without** encoding the user's private registry into the app.

## The generic hook

`aws-profiles.json` is proprietary and stays out of the app. But `saml2aws`
itself writes the account and role into `~/.aws/credentials` on every login:

```
[logistics]
x_principal_arn = arn:aws:sts::111111111111:assumed-role/Admin-Logistics/user
```

An assumed-role ARN maps back to the IAM role ARN mechanically
(`sts::A:assumed-role/R/session` → `iam::A:role/R`). So any profile that has
logged in once can be logged in again with a single click, in any saml2aws
setup, with no registry involved. That is the whole mechanism.

## Tasks

### Part 1 — ordering
- [x] `src/renderer/lib/profile-order.ts`: tier a profile into
      `live` / `expired` / `static` / `other`, with the active profile pinned to
      the top of its own tier. Live sorts by most time remaining (freshest
      login first); expired sorts by most-recently-expired first.
- [x] `ProfileList.tsx` renders labelled groups, keeping one flat visual order
      so arrow-key navigation still matches what is on screen.
- [x] Drop the `default`-pinned-first rule in `ipc-handlers.ts` — an empty
      `[default]` section outranked live sessions.
- [x] Group-header CSS.

### Part 2 — SAML
- [x] `shared/validation.ts`: `ROLE_ARN_PATTERN`, `assertValidRoleArn`,
      `iamRoleArnFromPrincipalArn()`.
- [x] `x_saml_role_arn` as a managed key in `~/.aws/config` — the editable
      override, using saml2aws's own `x_` convention.
- [x] `get-profiles` resolves `samlRoleArn` (config override, else derived) and
      reports which source it came from.
- [x] New `saml-role` login kind: `saml2aws login -a <idp> --profile <p>
      --role <arn> --region <r> --session-duration <n> --skip-prompt --force`.
- [x] `login-action.ts` prefers a pinned legacy SAML source, then `saml-role`,
      then SSO — so `awslogin`/`[saml]` behaviour is untouched.
- [x] `SamlSection.tsx` reframed: Identity Providers, each showing whether it is
      pinned to one profile (legacy) or fanning out to N, and which ones.
- [x] SAML Role ARN field in `ProfileWizard`.
- [x] Tests for all of the above; `npm test` + `npm run typecheck` green.

## Review

Verified against the real `~/.aws` on this machine, not only mocks. `config`,
`credentials`, `nmd-context.json` and `~/.saml2aws` all still carry their
pre-session mtimes — every path exercised here is a read.

**Ordering.** Probed with the actual files:

```
[Live sessions]     logistics, vision
[Expired sessions]  logistics-prod, saml, media, konnect
[Static keys]       analytics-keys, legacy-static, sync-middleware, billing-keys
[Not logged in]     default, learn-terraform, frontier
```

Two live sessions lead, expired sessions follow most-recent-first, and the
four permanent-key sections stop sitting between them. `default` — an empty
section the old main-process sort pinned to position one — now sits in the
band that describes it.

**Per-account SAML login.** Every derived role and region matched the registry
exactly, without the app reading the registry:

| Profile | Derived role | Region |
|---|---|---|
| logistics | `…::111111111111:role/Admin-Logistics` | us-west-2 |
| logistics-prod | `…::222222222222:role/AdministratorAccess-Prod` | us-west-2 |
| konnect | `…::333333333333:role/Admin-Konnect` | us-east-1 |
| vision | `…::444444444444:role/Admin-Vision` | us-east-1 |
| media | `…::555555555555:role/AdministratorAccess-Media` | us-east-2 |

`saml` still resolves to the legacy `saml2aws login -a default --profile saml`
with no `--role`, no `--force` and no `--skip-prompt`. The `awslogin` path is
byte-for-byte what it was.

**A defect the probe caught.** The first implementation fell back to the
identity provider's `aws_session_duration` when the profile set none, which
emitted `--session-duration 3600` for all five accounts — a one-hour session
where `awsgo` gives eight. Echoing a provider's own default back at saml2aws
changes nothing except to pin the request to it. Now only the profile's own
`session_duration` is sent, and the provider card displays its default
(`1h default`) so the low value is visible rather than silently applied.

**A second defect, caught by a test.** A profile with a resolved role but no
identity provider fell through to "IAM keys are static". A profile that knows
which role it assumes has authenticated by SAML at some point, so
`samlRoleArn` now counts as session evidence alongside `sessionToken`,
`isLive` and `isStatic === false`.

**Security.** `x_saml_role_arn` reaches a spawned command line, so it is
validated three times: in the wizard (UX), at the IPC boundary
(`assertValidRoleArn`), and again in the launcher, which owns the contract
that it performs no escaping. `ROLE_ARN_PATTERN` is deliberately narrower than
the ARN grammar and rejects every shell metacharacter; region and session
duration are pattern-checked at both boundaries too. A test confirms
`x_principal_arn` cannot be written through `writeAwsCredential` — it is
preserved, never managed, so a bad value cannot be planted and later derived
from.

**Tests: 362 passing** (was 303) — 220 main + 142 renderer. New coverage for
the four tiers and their intra-tier ordering, the ARN pattern and derivation
(including the path-loss caveat and injection payloads), the `saml-role`
command with and without optional flags, the fan-out login decision, the
`x_saml_role_arn` round trip, and the reframed provider card. `npm run
typecheck` and `npm run build` clean.

## Still open

- `~/.saml2aws` `aws_session_duration` is 3600 while the roles allow 28800.
  The app now shows this on the provider card and honours a per-profile
  `session_duration`, but neither file is edited automatically.
- No "log in to every profile at once" button. That is the fan-out model's
  headline benefit and remains `awsgo -All` territory for now.
- `get-profiles` still ships secret keys and session tokens to the renderer.
