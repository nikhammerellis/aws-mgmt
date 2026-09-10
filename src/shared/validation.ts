/**
 * Shared validation constants used by both main and renderer processes.
 *
 * The main process imports directly; the renderer imports from here too
 * (the bundler inlines the tiny module). Single source of truth for what
 * a "valid AWS profile name" means.
 */

/**
 * Profile name character class. Matches AWS CLI's real-world tolerance
 * (alphanum plus `_`, `-`, `.`, `@`, `+`) while rejecting everything that
 * could cause INI section injection (`[`, `]`, `\n`, `\r`, `=`) or shell
 * metacharacter abuse (`'`, `"`, `\`, `;`, `$`, backtick, space, `/`, `\\`).
 *
 * This is both a correctness gate (users with names like `dev.staging` or
 * `team@prod` need to function) and a security gate (renderer input must
 * be re-validated at every IPC boundary — the UI validator is UX only).
 */
export const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_.@+\-]+$/

export function isValidProfileName(name: unknown): name is string {
  return typeof name === 'string' && PROFILE_NAME_PATTERN.test(name)
}

/**
 * Throws if the name is invalid. Use at IPC handler boundaries where the
 * renderer is considered untrusted input. Callers should treat a thrown
 * error as a hard rejection — never silently coerce.
 */
export function assertValidProfileName(name: unknown, label: string = 'profile name'): asserts name is string {
  if (!isValidProfileName(name)) {
    throw new Error(
      `Invalid ${label}: must be non-empty and contain only letters, digits, and the characters _ . - @ +`
    )
  }
}

/**
 * AWS CLI environment variables that override profile resolution. When
 * launching a terminal for a specific profile — or running an STS probe
 * against a specific profile — these must be cleared, or they will
 * silently take precedence over AWS_PROFILE / `--profile` per the CLI's
 * credential-resolution precedence rules.
 *
 * Covers:
 * - Static key vars (AWS_ACCESS_KEY_ID et al.) which beat AWS_PROFILE.
 * - AWS_DEFAULT_PROFILE / AWS_PROFILE — the selector itself.
 * - AWS_ROLE_ARN / AWS_ROLE_SESSION_NAME / AWS_WEB_IDENTITY_TOKEN_FILE —
 *   web-identity / OIDC flows.
 * - AWS_CONFIG_FILE / AWS_SHARED_CREDENTIALS_FILE — redirects the CLI to
 *   a completely different set of files.
 * - Region/endpoint overrides that would silently change behavior.
 */
export const AWS_OVERRIDE_VARS = [
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SECURITY_TOKEN',
  'AWS_DEFAULT_REGION',
  'AWS_REGION',
  'AWS_DEFAULT_PROFILE',
  'AWS_ROLE_ARN',
  'AWS_ROLE_SESSION_NAME',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'AWS_CONFIG_FILE',
  'AWS_SHARED_CREDENTIALS_FILE'
] as const

/**
 * Returns a shallow copy of `env` with all AWS override vars removed.
 * `AWS_PROFILE` is intentionally NOT stripped because callers that want
 * to set it will do so explicitly after.
 */
export function stripAwsOverrides(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const clean = { ...env }
  for (const key of AWS_OVERRIDE_VARS) {
    delete clean[key]
  }
  // Always strip AWS_PROFILE too — any caller that wants it will re-set it.
  delete clean.AWS_PROFILE
  return clean
}

/**
 * An IAM role ARN, as `saml2aws login --role` expects it.
 *
 * Deliberately narrower than the ARN grammar: partition and account are
 * fixed-shape, and the role name uses IAM's documented character class
 * (`\w+=,.@-`) plus `/` for role paths. That excludes every shell
 * metacharacter and every INI-injection character, which matters because
 * this value is interpolated into a command line handed to a terminal.
 *
 * PROFILE_NAME_PATTERN cannot be reused here — it rejects `:` and `/`, which
 * every ARN contains.
 */
export const ROLE_ARN_PATTERN =
  /^arn:aws(-cn|-us-gov|-iso[a-z-]*)?:iam::\d{12}:role\/[\w+=,.@-]+(\/[\w+=,.@-]+)*$/

export function isValidRoleArn(arn: unknown): arn is string {
  return typeof arn === 'string' && arn.length <= 2048 && ROLE_ARN_PATTERN.test(arn)
}

/**
 * Throws unless `arn` is an IAM role ARN. Use at IPC boundaries — the renderer
 * is untrusted, and this value reaches a spawned terminal command.
 */
export function assertValidRoleArn(arn: unknown, label: string = 'role ARN'): asserts arn is string {
  if (!isValidRoleArn(arn)) {
    throw new Error(
      `Invalid ${label}: expected an IAM role ARN such as arn:aws:iam::123456789012:role/MyRole`
    )
  }
}

/**
 * Recover the IAM role ARN from the assumed-role ARN that saml2aws records as
 * `x_principal_arn` in ~/.aws/credentials after a successful login:
 *
 *   arn:aws:sts::123456789012:assumed-role/MyRole/user@example.com
 *   → arn:aws:iam::123456789012:role/MyRole
 *
 * This is what lets the app offer a one-click re-login for any profile that
 * has authenticated once, in any saml2aws setup, without knowing anything
 * about how the user names or organises their accounts.
 *
 * Caveat worth knowing: STS drops the role's *path* from an assumed-role ARN,
 * so a role at `/team/MyRole` round-trips to `/MyRole`. That case needs the
 * explicit override rather than the derived value — which is why the override
 * exists.
 */
export function iamRoleArnFromPrincipalArn(principalArn: unknown): string | null {
  if (typeof principalArn !== 'string') return null
  const match =
    /^arn:(aws(?:-cn|-us-gov|-iso[a-z-]*)?):sts::(\d{12}):assumed-role\/([\w+=,.@-]+)\//.exec(
      principalArn
    )
  if (!match) return null
  const [, partition, account, roleName] = match
  const derived = `arn:${partition}:iam::${account}:role/${roleName}`
  return isValidRoleArn(derived) ? derived : null
}
