import { readIniFile, writeIniFile } from '../utils/ini-helpers'
import { getAwsCredentialsPath } from '../utils/paths'
import { backupFile } from './backup'

export interface CredentialEntry {
  name: string
  aws_access_key_id?: string
  aws_secret_access_key?: string
  aws_session_token?: string
}

/**
 * Keys the UI owns. Other keys in each section — notably saml2aws's
 * `x_security_token_expires` and `x_principal_arn` — are preserved across
 * edits so a UI save doesn't wipe saml2aws metadata.
 */
const MANAGED_CREDENTIAL_KEYS = [
  'aws_access_key_id',
  'aws_secret_access_key',
  'aws_session_token'
] as const

export async function readAwsCredentials(): Promise<CredentialEntry[]> {
  const data = await readIniFile(getAwsCredentialsPath())
  const entries: CredentialEntry[] = []

  for (const [section, values] of Object.entries(data)) {
    entries.push({
      name: section,
      aws_access_key_id: values.aws_access_key_id,
      aws_secret_access_key: values.aws_secret_access_key,
      aws_session_token: values.aws_session_token
    })
  }

  return entries
}

export async function writeAwsCredential(entry: CredentialEntry): Promise<void> {
  await backupFile(getAwsCredentialsPath())
  const data = await readIniFile(getAwsCredentialsPath())

  const existing = data[entry.name] ?? {}
  const merged: Record<string, string> = { ...existing }

  for (const key of MANAGED_CREDENTIAL_KEYS) {
    const value = entry[key]
    if (value && value.length > 0) {
      merged[key] = value
    } else {
      delete merged[key]
    }
  }

  data[entry.name] = merged
  await writeIniFile(getAwsCredentialsPath(), data, { mode: 0o600 })
}

export async function deleteAwsCredential(name: string): Promise<void> {
  await backupFile(getAwsCredentialsPath())
  const data = await readIniFile(getAwsCredentialsPath())
  delete data[name]
  await writeIniFile(getAwsCredentialsPath(), data, { mode: 0o600 })
}
