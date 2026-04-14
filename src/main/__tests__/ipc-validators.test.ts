import { describe, it, expect, vi } from 'vitest'

// Electron's ipcMain is imported but never used in the validators themselves.
// Stub it so the module loads under Node without an Electron runtime.
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] }
}))

import {
  assertSafeIniValue,
  validateProfileData,
  validateSamlProfile
} from '../ipc-handlers'

describe('assertSafeIniValue', () => {
  it('accepts ordinary strings and null/undefined', () => {
    expect(() => assertSafeIniValue('hello', 'field')).not.toThrow()
    expect(() => assertSafeIniValue('us-east-1', 'region')).not.toThrow()
    expect(() => assertSafeIniValue(undefined, 'field')).not.toThrow()
    expect(() => assertSafeIniValue(null, 'field')).not.toThrow()
  })

  it('rejects values containing newlines (INI section injection)', () => {
    expect(() =>
      assertSafeIniValue('https://evil.example.com\n[default]\naws_access_key_id=AKIAEVIL', 'url')
    ).toThrow(/Invalid url/)
    expect(() => assertSafeIniValue('a\rb', 'field')).toThrow()
  })

  it('rejects values containing [ or ]', () => {
    expect(() => assertSafeIniValue('has[bracket', 'field')).toThrow()
    expect(() => assertSafeIniValue('has]bracket', 'field')).toThrow()
  })

  it('rejects values containing =', () => {
    expect(() => assertSafeIniValue('has=equals', 'field')).toThrow()
  })

  it('rejects non-string types', () => {
    expect(() => assertSafeIniValue(42, 'field')).toThrow(/must be a string/)
    expect(() => assertSafeIniValue({}, 'field')).toThrow(/must be a string/)
  })
})

describe('validateProfileData', () => {
  it('accepts a well-formed payload with AWS-valid name', () => {
    expect(() =>
      validateProfileData({ name: 'dev.staging', region: 'us-east-1', output: 'json' })
    ).not.toThrow()
  })

  it('rejects a name with shell metacharacters', () => {
    expect(() =>
      validateProfileData({ name: "dev'; rm -rf /", region: 'us-east-1' })
    ).toThrow(/Invalid profile name/)
  })

  it('rejects a name with INI-injection payload', () => {
    expect(() =>
      validateProfileData({ name: 'evil]\n[profile pwn\ncredential_process=calc.exe' })
    ).toThrow(/Invalid profile name/)
  })

  it('rejects any field with a newline in the value', () => {
    expect(() =>
      validateProfileData({
        name: 'dev',
        roleArn: 'arn:aws:iam::123:role/X\n[profile pwn]\ncredential_process = calc.exe'
      })
    ).toThrow(/Invalid profile field/)
  })
})

describe('validateSamlProfile', () => {
  it('accepts a well-formed SAML payload', () => {
    expect(() =>
      validateSamlProfile({
        name: 'corp',
        url: 'https://idp.example.com',
        provider: 'Okta',
        username: 'user@corp.com',
        awsProfile: 'corp-target',
        skipVerify: false
      })
    ).not.toThrow()
  })

  it('rejects a bad SAML profile name', () => {
    expect(() =>
      validateSamlProfile({ name: 'bad name', provider: 'Okta' })
    ).toThrow(/Invalid SAML profile name/)
  })

  it('rejects a bad aws_profile target', () => {
    expect(() =>
      validateSamlProfile({ name: 'corp', awsProfile: 'has spaces' })
    ).toThrow(/Invalid SAML aws_profile target/)
  })

  it('rejects fields with control chars', () => {
    expect(() =>
      validateSamlProfile({
        name: 'corp',
        url: 'https://idp.example.com\n[default]\naws_access_key_id=AKIAPWN'
      })
    ).toThrow(/Invalid SAML field/)
  })

  it('ignores an undefined aws_profile', () => {
    expect(() =>
      validateSamlProfile({ name: 'corp', provider: 'Okta' })
    ).not.toThrow()
  })
})
