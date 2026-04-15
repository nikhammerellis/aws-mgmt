import type { AwsProfile, LaunchLoginPayload, SamlProfile } from '../types'

export interface LoginAction {
  enabled: boolean
  label: string
  hint: string
  payload?: LaunchLoginPayload
}

/**
 * Decide what "Login" means for a given profile and return a payload the
 * caller can hand to `window.api.launchLogin`. Priority order:
 *
 *   1. SAML2AWS source — if any saml2aws section targets this profile, use it.
 *      This wins over inline SSO/keys because saml2aws would overwrite them.
 *   2. AWS SSO — if the profile has an `sso_start_url`.
 *   3. Assume role — disabled. The user should log in to the source profile.
 *   4. Static IAM keys — disabled. No login required.
 */
export function getLoginAction(profile: AwsProfile, samlSources: SamlProfile[]): LoginAction {
  if (samlSources.length > 0) {
    const saml = samlSources[0]
    // hasRoleArn drives whether the launcher appends --skip-prompt. Trim-
    // check rather than truthy-check so an explicit empty-string role_arn
    // (which some saml2aws setups leave in place) still counts as "unset"
    // and keeps the interactive role picker available.
    const hasRoleArn = !!(saml.roleArn && saml.roleArn.trim().length > 0)
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

  return {
    enabled: false,
    label: 'Login (not applicable)',
    hint: 'IAM keys are static — no login needed'
  }
}
