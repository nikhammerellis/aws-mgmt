import type { AwsProfile, LaunchLoginPayload, SamlProfile } from '../types'

export interface LoginAction {
  enabled: boolean
  label: string
  hint: string
  payload?: LaunchLoginPayload
}

/**
 * A ~/.saml2aws block counts as an identity provider the app can log in
 * *through* — as opposed to one pinned to a single AWS profile — when it names
 * no role of its own. saml2aws then takes the role from `--role`, which is
 * what lets one authentication mint sessions in several accounts.
 */
export function isFanOutProvider(saml: SamlProfile): boolean {
  return !saml.roleArn || saml.roleArn.trim().length === 0
}

/** Prefer a provider with no pinned role; otherwise just take the first. */
export function pickIdentityProvider(providers: SamlProfile[]): SamlProfile | null {
  if (providers.length === 0) return null
  return providers.find(isFanOutProvider) ?? providers[0]
}

/**
 * Decide what "Login" means for a given profile and return a payload the
 * caller can hand to `window.api.launchLogin`. Priority order:
 *
 *   1. SAML2AWS pinned source — a ~/.saml2aws section that targets this
 *      profile by name. This is the legacy one-slot shape and wins outright,
 *      because saml2aws would overwrite whatever else we chose.
 *   2. SAML2AWS fan-out — this profile knows which role it authenticates as,
 *      and an identity provider exists to authenticate through. One login per
 *      account, one browser prompt for all of them.
 *   3. AWS SSO — if the profile has an `sso_start_url`.
 *   4. Assume role — disabled. The user should log in to the source profile.
 *   5. Static IAM keys — disabled. No login required.
 *
 * @param samlSources ~/.saml2aws sections pinned to this profile by name.
 * @param providers   every ~/.saml2aws section, as candidate assertion sources.
 */
export function getLoginAction(
  profile: AwsProfile,
  samlSources: SamlProfile[],
  providers: SamlProfile[] = samlSources
): LoginAction {
  if (samlSources.length > 0) {
    const saml = samlSources[0]
    // hasRoleArn drives whether the launcher appends --skip-prompt. Trim-
    // check rather than truthy-check so an explicit empty-string role_arn
    // (which some saml2aws setups leave in place) still counts as "unset"
    // and keeps the interactive role picker available.
    const hasRoleArn = !isFanOutProvider(saml)
    return {
      enabled: true,
      label: 'Login via saml2aws',
      hint: saml.name,
      payload: {
        kind: 'saml-target',
        profileName: profile.name,
        samlSection: saml.name,
        hasRoleArn
      }
    }
  }

  // The fan-out path. `samlRoleArn` is resolved in the main process: either an
  // explicit override, or recovered from the assumed-role ARN saml2aws wrote
  // on the last successful login. Either way it is this profile's own role,
  // not a guess.
  const provider = pickIdentityProvider(providers)
  if (profile.samlRoleArn && provider) {
    return {
      enabled: true,
      label: 'Login via saml2aws',
      hint:
        profile.samlRoleArnSource === 'config'
          ? `${provider.name} · configured role`
          : `${provider.name} · last used role`,
      payload: {
        kind: 'saml-role',
        profileName: profile.name,
        samlSection: provider.name,
        roleArn: profile.samlRoleArn,
        region: profile.region,
        // Only the profile's own `session_duration`. Echoing the identity
        // provider's `aws_session_duration` back at saml2aws changes nothing —
        // that is already its default — but it would pin the request to that
        // number, which is commonly still 3600 even where the role allows
        // eight hours. Omitting it lets the provider default apply and leaves
        // this field as a genuine per-profile override.
        sessionDuration: profile.sessionDuration
      }
    }
  }

  if (profile.ssoStartUrl) {
    return {
      enabled: true,
      label: 'Login via aws sso',
      hint: 'browser device flow',
      payload: { kind: 'sso', profileName: profile.name }
    }
  }

  if (profile.roleArn || profile.sourceProfile) {
    return {
      enabled: false,
      label: 'Login (not applicable)',
      hint: 'Log in to the source profile instead'
    }
  }

  // No pinned SAML section, no resolvable role, no SSO block. That is NOT the
  // same as "it uses static keys": a profile written by a fan-out saml2aws
  // login holds a session token and an expiry but may still have no role we
  // can recover. Claiming its keys are static would be plainly false to
  // anyone looking at the same card's account, role and expiry.
  // `samlRoleArn` belongs in this test as much as the session evidence does:
  // a profile that knows which role it assumes has authenticated by SAML at
  // some point, whatever its credentials look like right now.
  if (profile.samlRoleArn || profile.sessionToken || profile.isLive || profile.isStatic === false) {
    return {
      enabled: false,
      label: 'Login (not applicable)',
      hint:
        providers.length === 0
          ? 'No identity provider configured in ~/.saml2aws'
          : 'Set a SAML role ARN on this profile to enable login'
    }
  }

  return {
    enabled: false,
    label: 'Login (not applicable)',
    hint: 'IAM keys are static — no login needed'
  }
}
