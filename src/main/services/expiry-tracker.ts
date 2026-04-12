import { promises as fs } from 'fs'
import { join } from 'path'
import { readAwsConfig } from './aws-config'
import { readIniFile } from '../utils/ini-helpers'
import { getAwsCredentialsPath, getSsoCacheDir } from '../utils/paths'
import type { ProfileExpiry } from '../../renderer/types'

export type { ProfileExpiry }

interface SsoCacheEntry {
  startUrl?: string
  expiresAt?: string
}

async function readSsoCacheByStartUrl(): Promise<Map<string, string>> {
  const byUrl = new Map<string, string>()
  let entries: string[]
  try {
    entries = await fs.readdir(getSsoCacheDir())
  } catch {
    return byUrl
  }

  await Promise.all(
    entries
      .filter((e) => e.endsWith('.json'))
      .map(async (file) => {
        try {
          const raw = await fs.readFile(join(getSsoCacheDir(), file), 'utf-8')
          const parsed = JSON.parse(raw) as SsoCacheEntry
          if (parsed.startUrl && parsed.expiresAt) {
            // Latest write wins; we don't currently dedupe by timestamp.
            byUrl.set(parsed.startUrl, parsed.expiresAt)
          }
        } catch {
          // ignore unreadable/malformed cache entries
        }
      })
  )

  return byUrl
}

async function readSamlExpiries(): Promise<Map<string, string>> {
  const byName = new Map<string, string>()
  try {
    const data = await readIniFile(getAwsCredentialsPath())
    for (const [section, values] of Object.entries(data)) {
      const expires = values.x_security_token_expires
      if (typeof expires === 'string' && expires.length > 0) {
        byName.set(section, expires)
      }
    }
  } catch {
    // ignore
  }
  return byName
}

export async function getProfileExpiries(): Promise<ProfileExpiry[]> {
  const [awsConfig, ssoByUrl, samlByName] = await Promise.all([
    readAwsConfig(),
    readSsoCacheByStartUrl(),
    readSamlExpiries()
  ])

  const results: ProfileExpiry[] = []

  for (const profile of awsConfig) {
    // SSO: legacy inline sso_start_url matches a cache entry
    if (profile.sso_start_url) {
      const expiresAt = ssoByUrl.get(profile.sso_start_url)
      if (expiresAt) {
        results.push({ profileName: profile.name, expiresAt, source: 'sso' })
        continue
      }
    }
    // SAML2AWS (from credentials file)
    const samlExpiry = samlByName.get(profile.name)
    if (samlExpiry) {
      results.push({ profileName: profile.name, expiresAt: samlExpiry, source: 'saml2aws' })
    }
  }

  // Also surface credentials-only profiles (no config section) that have saml2aws expiry
  const configNames = new Set(awsConfig.map((p) => p.name))
  for (const [name, expiresAt] of samlByName) {
    if (!configNames.has(name)) {
      results.push({ profileName: name, expiresAt, source: 'saml2aws' })
    }
  }

  return results
}
