import { describe, it, expect } from 'vitest'
import { getLoginAction } from '../login-action'
import type { AwsProfile, SamlProfile } from '../../types'

function profile(overrides: Partial<AwsProfile> = {}): AwsProfile {
  return { name: 'p', isActive: false, hasCredentials: false, ...overrides }
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
      samlSection: 'work-okta'
    })
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
})
