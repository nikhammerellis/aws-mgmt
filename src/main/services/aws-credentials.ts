import { readIniFile, writeIniFile } from '../utils/ini-helpers'
import { getAwsCredentialsPath } from '../utils/paths'
import { backupFile } from './backup'

export interface CredentialEntry {
  name: string
  aws_access_key_id?: string
  aws_secret_access_key?: string
  aws_session_token?: string
}

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

  const values: Record<string, string> = {}
  if (entry.aws_access_key_id) values.aws_access_key_id = entry.aws_access_key_id
  if (entry.aws_secret_access_key) values.aws_secret_access_key = entry.aws_secret_access_key
  if (entry.aws_session_token) values.aws_session_token = entry.aws_session_token

  data[entry.name] = values
  await writeIniFile(getAwsCredentialsPath(), data)
}

export async function deleteAwsCredential(name: string): Promise<void> {
  await backupFile(getAwsCredentialsPath())
  const data = await readIniFile(getAwsCredentialsPath())
  delete data[name]
  await writeIniFile(getAwsCredentialsPath(), data)
}
