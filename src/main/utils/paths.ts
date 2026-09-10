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

/**
 * The context file written by the awsgo/awsuse PowerShell commands
 * (~/.aws/nmd-context.json). It records which profile the operator last
 * switched to, which is information no environment variable can carry
 * across process boundaries.
 */
export function getNmdContextPath(): string {
  return process.env.NMD_AWS_CONTEXT_FILE || join(homedir(), '.aws', 'nmd-context.json')
}
