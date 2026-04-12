import { homedir } from 'os'
import { join } from 'path'

export function getAwsConfigPath(): string {
  return process.env.AWS_CONFIG_FILE || join(homedir(), '.aws', 'config')
}

export function getAwsCredentialsPath(): string {
  return process.env.AWS_SHARED_CREDENTIALS_FILE || join(homedir(), '.aws', 'credentials')
}

export function getSamlConfigPath(): string {
  return join(homedir(), '.saml2aws')
}

export function getSsoCacheDir(): string {
  return join(homedir(), '.aws', 'sso', 'cache')
}
