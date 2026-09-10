import { describe, it, expect } from 'vitest'
import {
  PROFILE_NAME_PATTERN,
  isValidProfileName,
  assertValidProfileName,
  AWS_OVERRIDE_VARS,
  stripAwsOverrides,
  isValidRoleArn,
  assertValidRoleArn,
  iamRoleArnFromPrincipalArn
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

describe('ROLE_ARN_PATTERN / assertValidRoleArn', () => {
  it('accepts a plain IAM role ARN', () => {
    expect(isValidRoleArn('arn:aws:iam::111111111111:role/Admin-Logistics')).toBe(true)
  })

  it('accepts role paths and the punctuation IAM actually allows', () => {
    expect(isValidRoleArn('arn:aws:iam::123456789012:role/team/sub/My_Role.v2+x=y,z@ok')).toBe(
      true
    )
  })

  it('accepts non-commercial partitions', () => {
    expect(isValidRoleArn('arn:aws-us-gov:iam::123456789012:role/GovRole')).toBe(true)
    expect(isValidRoleArn('arn:aws-cn:iam::123456789012:role/CnRole')).toBe(true)
  })

  it('rejects an assumed-role ARN — that is not what --role takes', () => {
    expect(isValidRoleArn('arn:aws:sts::123456789012:assumed-role/MyRole/user@example.com')).toBe(
      false
    )
  })

  it('rejects a malformed account id', () => {
    expect(isValidRoleArn('arn:aws:iam::12345:role/MyRole')).toBe(false)
  })

  it('rejects shell metacharacters — this value reaches a command line', () => {
    for (const payload of [
      'arn:aws:iam::123456789012:role/My Role',
      'arn:aws:iam::123456789012:role/x; rm -rf /',
      'arn:aws:iam::123456789012:role/x`whoami`',
      'arn:aws:iam::123456789012:role/x$(id)',
      'arn:aws:iam::123456789012:role/x&&calc',
      "arn:aws:iam::123456789012:role/x'y",
      'arn:aws:iam::123456789012:role/x"y',
      'arn:aws:iam::123456789012:role/x\ny'
    ]) {
      expect(isValidRoleArn(payload)).toBe(false)
    }
  })

  it('rejects non-strings and empty input', () => {
    expect(isValidRoleArn(undefined)).toBe(false)
    expect(isValidRoleArn(null)).toBe(false)
    expect(isValidRoleArn('')).toBe(false)
    expect(isValidRoleArn({ toString: () => 'arn:aws:iam::123456789012:role/X' })).toBe(false)
  })

  it('throws with a usable message', () => {
    expect(() => assertValidRoleArn('nope')).toThrow(/arn:aws:iam/)
    expect(() => assertValidRoleArn('arn:aws:iam::123456789012:role/Ok')).not.toThrow()
  })
})

describe('iamRoleArnFromPrincipalArn', () => {
  it('recovers the role ARN saml2aws would need from what it wrote', () => {
    expect(
      iamRoleArnFromPrincipalArn(
        'arn:aws:sts::111111111111:assumed-role/Admin-Logistics/user@example.com'
      )
    ).toBe('arn:aws:iam::111111111111:role/Admin-Logistics')
  })

  it('preserves the partition', () => {
    expect(
      iamRoleArnFromPrincipalArn('arn:aws-us-gov:sts::123456789012:assumed-role/GovRole/u')
    ).toBe('arn:aws-us-gov:iam::123456789012:role/GovRole')
  })

  it('handles a session name containing the separator', () => {
    // Session names routinely contain @ and . — the role name ends at the
    // FIRST slash after assumed-role/, and everything after is the session.
    expect(
      iamRoleArnFromPrincipalArn(
        'arn:aws:sts::123456789012:assumed-role/MyRole/first.last@example.com/extra'
      )
    ).toBe('arn:aws:iam::123456789012:role/MyRole')
  })

  it('returns null for an ARN that is not an assumed role', () => {
    expect(iamRoleArnFromPrincipalArn('arn:aws:iam::123456789012:user/nik')).toBeNull()
    expect(iamRoleArnFromPrincipalArn('arn:aws:sts::123456789012:federated-user/nik')).toBeNull()
  })

  it('returns null when there is no session segment to delimit the role', () => {
    expect(iamRoleArnFromPrincipalArn('arn:aws:sts::123456789012:assumed-role/MyRole')).toBeNull()
  })

  it('returns null rather than throwing on junk', () => {
    expect(iamRoleArnFromPrincipalArn(undefined)).toBeNull()
    expect(iamRoleArnFromPrincipalArn(null)).toBeNull()
    expect(iamRoleArnFromPrincipalArn('')).toBeNull()
    expect(iamRoleArnFromPrincipalArn(12345)).toBeNull()
  })

  it('never emits a value its own validator would reject', () => {
    const derived = iamRoleArnFromPrincipalArn(
      'arn:aws:sts::123456789012:assumed-role/Role_With.Odd+Chars@x/session'
    )
    expect(derived).not.toBeNull()
    expect(isValidRoleArn(derived)).toBe(true)
  })
})
