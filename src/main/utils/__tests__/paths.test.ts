import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getAwsConfigPath, getAwsCredentialsPath, getSamlConfigPath } from '../paths'

vi.mock('os', () => ({
  homedir: () => '/home/testuser'
}))

describe('paths', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getAwsConfigPath', () => {
    it('returns default path when AWS_CONFIG_FILE is not set', () => {
      delete process.env.AWS_CONFIG_FILE
      const result = getAwsConfigPath()
      expect(result).toMatch(/\.aws[/\\]config$/)
      expect(result).toContain('testuser')
    })

    it('returns custom path when AWS_CONFIG_FILE is set', () => {
      process.env.AWS_CONFIG_FILE = '/custom/config'
      expect(getAwsConfigPath()).toBe('/custom/config')
    })
  })

  describe('getAwsCredentialsPath', () => {
    it('returns default path when AWS_SHARED_CREDENTIALS_FILE is not set', () => {
      delete process.env.AWS_SHARED_CREDENTIALS_FILE
      const result = getAwsCredentialsPath()
      expect(result).toMatch(/\.aws[/\\]credentials$/)
      expect(result).toContain('testuser')
    })

    it('returns custom path when AWS_SHARED_CREDENTIALS_FILE is set', () => {
      process.env.AWS_SHARED_CREDENTIALS_FILE = '/custom/credentials'
      expect(getAwsCredentialsPath()).toBe('/custom/credentials')
    })
  })

  describe('getSamlConfigPath', () => {
    it('returns path under home directory', () => {
      const result = getSamlConfigPath()
      expect(result).toContain('testuser')
      expect(result).toMatch(/\.saml2aws$/)
    })
  })
})
