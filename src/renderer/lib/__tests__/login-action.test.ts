import { describe, it, expect } from 'vitest'
import { getLoginAction } from '../login-action'
import type { AwsProfile, SamlProfile } from '../../types'

function profile(overrides: Partial<AwsProfile> = {}): AwsProfile {
  return { name: 'p', isActive: false, isLive: false, hasCredentials: false, ...overrides }
}

describe('getLoginAction', () => {
  it('prefers saml2aws when a SAML source targets the profile', () => {
    const sources: SamlProfile[] = [{ name: 'work-okta', provider: 'Okta' }]
    const action = getLoginAction(
      profile({ name: 'dev', ssoStartUrl: 'https://example.awsapps.com/start' }),
      sources
    )
    expect(action.enabled).toBe(true)
    expect(action.label).toMatch(/saml2aws/)
    expect(action.payload).toEqual({
      kind: 'saml-target',
      profileName: 'dev',
      samlSection: 'work-okta',
      hasRoleArn: false
    })
  })

  it('sets hasRoleArn=true when the SAML source has role_arn configured', () => {
    const sources: SamlProfile[] = [
      { name: 'work-okta', provider: 'Okta', roleArn: 'arn:aws:iam::1:role/Admin' }
    ]
    const action = getLoginAction(profile({ name: 'dev' }), sources)
    expect(action.payload?.hasRoleArn).toBe(true)
  })

  it('treats an empty-string role_arn as unset (hasRoleArn=false)', () => {
    const sources: SamlProfile[] = [
      { name: 'work-okta', provider: 'Okta', roleArn: '   ' }
    ]
    const action = getLoginAction(profile({ name: 'dev' }), sources)
    expect(action.payload?.hasRoleArn).toBe(false)
  })

  it('returns an SSO payload when sso_start_url is set and no SAML source exists', () => {
    const action = getLoginAction(
      profile({ name: 'sso-dev', ssoStartUrl: 'https://example.awsapps.com/start' }),
      []
    )
    expect(action.enabled).toBe(true)
    expect(action.label).toMatch(/aws sso/)
    expect(action.payload).toEqual({ kind: 'sso', profileName: 'sso-dev' })
  })

  it('disables login for assume-role profiles with a hint to log in the source', () => {
    const action = getLoginAction(
      profile({ name: 'prod', roleArn: 'arn:aws:iam::1:role/X', sourceProfile: 'dev' }),
      []
    )
    expect(action.enabled).toBe(false)
    expect(action.hint).toMatch(/source profile/)
    expect(action.payload).toBeUndefined()
  })

  it('disables login for static IAM keys', () => {
    const action = getLoginAction(profile({ name: 'iam', accessKeyId: 'AKIA' }), [])
    expect(action.enabled).toBe(false)
    expect(action.hint).toMatch(/static/i)
  })

  it('uses the first SAML source when multiple target the same profile', () => {
    const sources: SamlProfile[] = [
      { name: 'work-okta', provider: 'Okta' },
      { name: 'work-google', provider: 'GoogleApps' }
    ]
    const action = getLoginAction(profile({ name: 'dev' }), sources)
    expect(action.payload?.samlSection).toBe('work-okta')
  })

  // A fan-out saml2aws login writes one credentials section per account. Those
  // profiles hold a session token and an expiry but declare no saml2aws or SSO
  // source, so they land on the final fallthrough — which used to tell the user
  // their keys were static while the same card showed an account, role and
  // expiry parsed out of x_principal_arn.
  describe('profiles with a session but no configured login source', () => {
    it('does not claim static keys for a profile holding a session token', () => {
      const action = getLoginAction(profile({ name: 'logistics', sessionToken: 'tok' }), [])

      expect(action.enabled).toBe(false)
      expect(action.hint).not.toMatch(/static/i)
      expect(action.hint).toMatch(/no identity provider configured/i)
    })

    it('does not claim static keys for a live profile', () => {
      const action = getLoginAction(profile({ name: 'vision', isLive: true }), [])

      expect(action.hint).toMatch(/no identity provider configured/i)
    })

    it('does not claim static keys when main reports the profile is not static', () => {
      const action = getLoginAction(profile({ name: 'media', isStatic: false }), [])

      expect(action.hint).toMatch(/no identity provider configured/i)
    })

    it('still says static keys for genuine long-lived IAM keys', () => {
      const action = getLoginAction(
        profile({ name: 'legacy-static', hasCredentials: true, isStatic: true }),
        []
      )

      expect(action.enabled).toBe(false)
      expect(action.hint).toMatch(/static/i)
    })
  })
})


describe('getLoginAction — fan-out via an identity provider', () => {
  const IDP: SamlProfile[] = [
    { name: 'default', provider: 'Browser', awsProfile: 'saml', awsSessionDuration: '3600' }
  ]
  const ROLE = 'arn:aws:iam::111111111111:role/Admin-Logistics'

  it('enables login for an account profile with a resolved role', () => {
    const action = getLoginAction(
      profile({
        name: 'logistics',
        region: 'us-west-2',
        sessionDuration: '28800',
        samlRoleArn: ROLE,
        samlRoleArnSource: 'derived'
      }),
      [],
      IDP
    )

    expect(action.enabled).toBe(true)
    expect(action.payload).toEqual({
      kind: 'saml-role',
      profileName: 'logistics',
      samlSection: 'default',
      roleArn: ROLE,
      region: 'us-west-2',
      sessionDuration: '28800'
    })
  })

  it('says where the role came from', () => {
    const derived = getLoginAction(
      profile({ name: 'logistics', samlRoleArn: ROLE, samlRoleArnSource: 'derived' }),
      [],
      IDP
    )
    expect(derived.hint).toMatch(/last used role/)

    const configured = getLoginAction(
      profile({ name: 'logistics', samlRoleArn: ROLE, samlRoleArnSource: 'config' }),
      [],
      IDP
    )
    expect(configured.hint).toMatch(/configured role/)
  })

  it("does not echo the provider's default duration back at saml2aws", () => {
    // The IdP block here says aws_session_duration = 3600. Passing that as
    // --session-duration changes nothing except to pin the request to an hour
    // on a role that may well allow eight.
    const action = getLoginAction(profile({ name: 'logistics', samlRoleArn: ROLE }), [], IDP)
    expect(action.payload?.sessionDuration).toBeUndefined()
  })

  it("uses the profile's own session_duration when it has one", () => {
    const action = getLoginAction(
      profile({ name: 'logistics', samlRoleArn: ROLE, sessionDuration: '28800' }),
      [],
      IDP
    )
    expect(action.payload?.sessionDuration).toBe('28800')
  })

  it('leaves the legacy pinned path untouched when one targets the profile', () => {
    // ~/.saml2aws [default] has aws_profile = saml, so the `saml` profile keeps
    // its old one-slot behaviour even though a role is resolvable for it.
    const action = getLoginAction(
      profile({ name: 'saml', samlRoleArn: ROLE, samlRoleArnSource: 'derived' }),
      IDP,
      IDP
    )
    expect(action.payload?.kind).toBe('saml-target')
  })

  it('prefers a provider with no role of its own over a pinned one', () => {
    const providers: SamlProfile[] = [
      { name: 'pinned', roleArn: 'arn:aws:iam::111111111111:role/Fixed' },
      { name: 'fanout' }
    ]
    const action = getLoginAction(
      profile({ name: 'logistics', samlRoleArn: ROLE }),
      [],
      providers
    )
    expect(action.payload?.samlSection).toBe('fanout')
  })

  it('stays disabled when no identity provider exists to authenticate through', () => {
    const action = getLoginAction(profile({ name: 'logistics', samlRoleArn: ROLE }), [], [])
    expect(action.enabled).toBe(false)
    expect(action.hint).toMatch(/no identity provider/i)
  })

  it('stays disabled when the profile has no resolvable role', () => {
    const action = getLoginAction(profile({ name: 'logistics', isLive: true }), [], IDP)
    expect(action.enabled).toBe(false)
    expect(action.hint).toMatch(/set a saml role arn/i)
    expect(action.hint).not.toMatch(/static/i)
  })

  it('does not hijack an SSO profile that has no SAML role', () => {
    const action = getLoginAction(
      profile({ name: 'sso-prof', ssoStartUrl: 'https://x.awsapps.com/start' }),
      [],
      IDP
    )
    expect(action.payload?.kind).toBe('sso')
  })

  it('still reports genuine static keys as needing no login', () => {
    const action = getLoginAction(
      profile({ name: 'legacy-static', hasCredentials: true, isStatic: true }),
      [],
      IDP
    )
    expect(action.hint).toMatch(/static/i)
  })
})
