import { execFile } from 'child_process'
import { promisify } from 'util'
import { isValidProfileName, stripAwsOverrides } from '../../shared/validation'

const execFileAsync = promisify(execFile)

export interface ProfileTestSuccess {
  ok: true
  account: string
  arn: string
  userId: string
}

export interface ProfileTestFailure {
  ok: false
  error: string
  hint?: string
}

export type ProfileTestResult = ProfileTestSuccess | ProfileTestFailure

interface CallerIdentity {
  Account?: string
  Arn?: string
  UserId?: string
}

function classifyError(stderr: string, code: string | undefined): ProfileTestFailure {
  const trimmed = stderr.trim()
  if (code === 'ENOENT') {
    return {
      ok: false,
      error: 'AWS CLI not found',
      hint: 'Install the AWS CLI v2 and ensure `aws` is on your PATH.'
    }
  }
  if (/ExpiredToken|InvalidClientTokenId|TokenRefreshRequired/.test(trimmed)) {
    return {
      ok: false,
      error: 'Credentials expired or invalid',
      hint: 'Re-run your SSO/SAML login or refresh static keys.'
    }
  }
  if (/could not be found|profile.*not found/i.test(trimmed)) {
    return {
      ok: false,
      error: 'Profile not found',
      hint: 'The AWS CLI does not see this profile. Save first.'
    }
  }
  if (/Unable to locate credentials/i.test(trimmed)) {
    return {
      ok: false,
      error: 'No credentials available',
      hint: 'This profile has no resolvable credentials. Add keys, configure SSO, or run a saml2aws login.'
    }
  }
  return {
    ok: false,
    error: trimmed.split('\n')[0] || 'Unknown error'
  }
}

export async function testProfile(name: string): Promise<ProfileTestResult> {
  if (!isValidProfileName(name)) {
    return { ok: false, error: 'Invalid profile name' }
  }

  try {
    // Strip AWS_* env vars from the subprocess so `--profile name` actually
    // uses that profile, rather than silently being overridden by whatever
    // AWS_ACCESS_KEY_ID / AWS_PROFILE the app inherited from its launcher.
    const { stdout } = await execFileAsync(
      'aws',
      ['sts', 'get-caller-identity', '--profile', name, '--output', 'json'],
      { timeout: 15000, env: stripAwsOverrides(process.env) }
    )
    const parsed = JSON.parse(stdout) as CallerIdentity
    return {
      ok: true,
      account: parsed.Account ?? '',
      arn: parsed.Arn ?? '',
      userId: parsed.UserId ?? ''
    }
  } catch (err) {
    const e = err as { stderr?: string; code?: string; message?: string }
    return classifyError(e.stderr ?? e.message ?? '', e.code)
  }
}
