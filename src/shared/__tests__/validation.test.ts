import { describe, it, expect } from 'vitest'
import {
  PROFILE_NAME_PATTERN,
  isValidProfileName,
  assertValidProfileName,
  AWS_OVERRIDE_VARS,
  stripAwsOverrides
} from '../validation'

describe('PROFILE_NAME_PATTERN / isValidProfileName', () => {
  it('accepts plain ASCII alphanumerics', () => {
    expect(isValidProfileName('dev')).toBe(true)
    expect(isValidProfileName('Dev123')).toBe(true)
    expect(isValidProfileName('DEV')).toBe(true)
  })

  it('accepts common AWS-valid metacharacters: underscore, dash, dot, at, plus', () => {
    expect(isValidProfileName('dev_staging')).toBe(true)
    expect(isValidProfileName('dev-staging')).toBe(true)
    expect(isValidProfileName('dev.staging')).toBe(true)
    expect(isValidProfileName('team@prod')).toBe(true)
    expect(isValidProfileName('a+b')).toBe(true)
    expect(isValidProfileName('a.b-c_d@e+f')).toBe(true)
  })

  it('rejects INI-injection characters', () => {
    expect(isValidProfileName('default]\n[profile pwn')).toBe(false)
    expect(isValidProfileName('a[b')).toBe(false)
    expect(isValidProfileName('a]b')).toBe(false)
    expect(isValidProfileName('a=b')).toBe(false)
    expect(isValidProfileName('a\nb')).toBe(false)
    expect(isValidProfileName('a\rb')).toBe(false)
  })

  it('rejects shell-injection characters', () => {
    expect(isValidProfileName('a;b')).toBe(false)
    expect(isValidProfileName("a'b")).toBe(false)
    expect(isValidProfileName('a"b')).toBe(false)
    expect(isValidProfileName('a\\b')).toBe(false)
    expect(isValidProfileName('a$b')).toBe(false)
    expect(isValidProfileName('a`b')).toBe(false)
    expect(isValidProfileName('a b')).toBe(false)
    expect(isValidProfileName('a/b')).toBe(false)
  })

  it('rejects non-string and empty', () => {
    expect(isValidProfileName('')).toBe(false)
    expect(isValidProfileName(null)).toBe(false)
    expect(isValidProfileName(undefined)).toBe(false)
    expect(isValidProfileName(123)).toBe(false)
    expect(isValidProfileName({})).toBe(false)
  })
})

describe('assertValidProfileName', () => {
  it('is a no-op for valid names', () => {
    expect(() => assertValidProfileName('dev.staging')).not.toThrow()
  })

  it('throws for invalid names', () => {
    expect(() => assertValidProfileName('bad name')).toThrow(/Invalid profile name/)
    expect(() => assertValidProfileName('')).toThrow()
  })

  it('includes a custom label in the error', () => {
    expect(() => assertValidProfileName('bad name', 'SAML section')).toThrow(
      /Invalid SAML section/
    )
  })
})

describe('AWS_OVERRIDE_VARS / stripAwsOverrides', () => {
  it('includes the critical static-key vars', () => {
    for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
      expect(AWS_OVERRIDE_VARS).toContain(key)
    }
  })

  it('includes profile-selector vars', () => {
    expect(AWS_OVERRIDE_VARS).toContain('AWS_DEFAULT_PROFILE')
  })

  it('includes the file-redirect vars', () => {
    expect(AWS_OVERRIDE_VARS).toContain('AWS_CONFIG_FILE')
    expect(AWS_OVERRIDE_VARS).toContain('AWS_SHARED_CREDENTIALS_FILE')
  })

  it('strips all override vars plus AWS_PROFILE from env', () => {
    const dirty: NodeJS.ProcessEnv = {
      AWS_ACCESS_KEY_ID: 'AKIAOLD',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_SESSION_TOKEN: 'token',
      AWS_PROFILE: 'old-profile',
      AWS_CONFIG_FILE: '/tmp/bogus',
      PATH: '/usr/bin',
      HOME: '/home/user'
    }
    const clean = stripAwsOverrides(dirty)
    for (const key of AWS_OVERRIDE_VARS) {
      expect(clean[key]).toBeUndefined()
    }
    expect(clean.AWS_PROFILE).toBeUndefined()
    expect(clean.PATH).toBe('/usr/bin')
    expect(clean.HOME).toBe('/home/user')
  })

  it('does not mutate the input env', () => {
    const dirty: NodeJS.ProcessEnv = { AWS_ACCESS_KEY_ID: 'AKIA', PATH: '/bin' }
    stripAwsOverrides(dirty)
    expect(dirty.AWS_ACCESS_KEY_ID).toBe('AKIA')
  })
})
