import { spawn } from 'child_process'
import type { ShellHint, ShellFlavor } from '../../renderer/types'
import { PROFILE_NAME_PATTERN, AWS_OVERRIDE_VARS } from '../../shared/validation'

export type { ShellHint }

const NAME_PATTERN = PROFILE_NAME_PATTERN
const PROFILE_TOKEN = '__PROFILE__'

export function exportLineTemplateFor(flavor: ShellFlavor): string {
  switch (flavor) {
    case 'pwsh':
      return `$env:AWS_PROFILE = "${PROFILE_TOKEN}"`
    case 'cmd':
      return `set AWS_PROFILE=${PROFILE_TOKEN}`
    case 'fish':
      return `set -x AWS_PROFILE ${PROFILE_TOKEN}`
    case 'bash':
    case 'zsh':
    default:
      return `export AWS_PROFILE=${PROFILE_TOKEN}`
  }
}

export function detectShellHint(): ShellHint {
  let flavor: ShellFlavor

  if (process.platform === 'win32') {
    flavor = process.env.PSModulePath ? 'pwsh' : 'cmd'
  } else {
    const shell = process.env.SHELL ?? ''
    if (shell.includes('fish')) flavor = 'fish'
    else if (shell.includes('zsh')) flavor = 'zsh'
    else flavor = 'bash'
  }

  return {
    flavor,
    exportLineTemplate: exportLineTemplateFor(flavor)
  }
}

function spawnDetached(cmd: string, args: readonly string[], envExtras: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...envExtras },
      detached: true,
      stdio: 'ignore',
      shell: false
    })
    child.once('error', reject)
    // Detach so the parent doesn't keep it alive.
    child.unref()
    // Successful spawn fires no event we need to wait on; resolve next tick.
    setImmediate(resolve)
  })
}

/**
 * Escape a string for embedding inside an AppleScript string literal.
 * AppleScript uses `"..."` with `\"` and `\\` escapes. We already enforce
 * NAME_PATTERN at the IPC boundary so a `"` or `\` can't actually reach
 * here today — this is defense-in-depth so that a future widening of the
 * regex or a new caller that forgets to validate cannot produce code
 * injection via `do script`.
 */
export function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

async function tryLaunchSequence(
  candidates: ReadonlyArray<{ cmd: string; args: readonly string[] }>,
  envExtras: NodeJS.ProcessEnv
): Promise<void> {
  let lastErr: unknown = null
  for (const candidate of candidates) {
    try {
      await spawnDetached(candidate.cmd, candidate.args, envExtras)
      return
    } catch (err) {
      lastErr = err
      // ENOENT or similar — try the next candidate
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No terminal emulator found')
}

function buildSetProfileCommand(name: string): string {
  if (process.platform === 'win32') {
    // PowerShell: Remove-Item with SilentlyContinue in case the var isn't set.
    const clears = AWS_OVERRIDE_VARS.map(
      (v) => `Remove-Item Env:${v} -ErrorAction SilentlyContinue`
    ).join('; ')
    return `${clears}; $env:AWS_PROFILE = '${name}'; Write-Host "AWS_PROFILE set to ${name}"`
  }
  // POSIX: unset handles multiple vars in a single call.
  const unsetLine = `unset ${AWS_OVERRIDE_VARS.join(' ')}`
  return `${unsetLine} && export AWS_PROFILE=${name} && echo AWS_PROFILE set to ${name}`
}

export async function launchTerminalWithProfile(name: string): Promise<void> {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`Invalid profile name: ${name}`)
  }

  // Don't rely on spawn env inheritance — Windows Terminal (wt.exe) is a UWP
  // bridge that doesn't propagate the parent's env to its child shell. Instead,
  // explicitly set the variable via a shell command in the new session. Also
  // clear any stale AWS_* vars that would otherwise override AWS_PROFILE.
  await launchTerminalWithCommand(buildSetProfileCommand(name))
}

/**
 * Launch a new terminal that runs `commandLine` and stays open after it
 * finishes. Used for one-shot login flows so the user can complete an
 * interactive auth dance (browser device code, MFA prompts) in the shell they
 * already know.
 *
 * Caller MUST validate any user-provided values inside `commandLine` against
 * NAME_PATTERN before calling — this function does no escaping itself.
 */
export async function launchTerminalWithCommand(commandLine: string): Promise<void> {
  if (process.platform === 'win32') {
    // Use -EncodedCommand (base64 UTF-16LE) so that wt.exe cannot misparse
    // the command string — it splits on raw `;` as a tab separator, which
    // breaks PowerShell multi-statement commands passed via -Command.
    //
    // Use powershell.exe (Windows PowerShell 5.1) instead of pwsh (PowerShell
    // 7+) because pwsh is a separate install and isn't guaranteed to exist.
    // Note: wt.exe spawn always "succeeds" from our perspective even if the
    // inner shell is missing — the error shows up inside the terminal window.
    // So we can't fall back on a missing inner shell; we have to pick one
    // that's guaranteed to be installed.
    const encoded = Buffer.from(commandLine, 'utf16le').toString('base64')
    await tryLaunchSequence(
      [
        { cmd: 'wt.exe', args: ['powershell.exe', '-NoExit', '-EncodedCommand', encoded] },
        { cmd: 'powershell.exe', args: ['-NoExit', '-EncodedCommand', encoded] }
      ],
      {}
    )
    return
  }

  if (process.platform === 'darwin') {
    const escaped = escapeAppleScriptString(commandLine)
    const script = `tell application "Terminal" to do script "${escaped}"`
    await spawnDetached('osascript', ['-e', script], {})
    return
  }

  // Linux + others. `; exec bash` keeps the shell open after the command
  // completes so the user can review output.
  const tail = `${commandLine}; exec bash`
  await tryLaunchSequence(
    [
      { cmd: 'x-terminal-emulator', args: ['-e', 'bash', '-c', tail] },
      { cmd: 'gnome-terminal', args: ['--', 'bash', '-c', tail] },
      { cmd: 'konsole', args: ['-e', 'bash', '-c', tail] },
      { cmd: 'xterm', args: ['-e', 'bash', '-c', tail] }
    ],
    {}
  )
}

export interface LaunchLoginPayload {
  kind: 'sso' | 'saml-target'
  profileName: string
  samlSection?: string
}

export async function launchLoginInTerminal(payload: LaunchLoginPayload): Promise<void> {
  if (!NAME_PATTERN.test(payload.profileName)) {
    throw new Error(`Invalid profile name: ${payload.profileName}`)
  }

  let commandLine: string
  if (payload.kind === 'sso') {
    commandLine = `aws sso login --profile ${payload.profileName}`
  } else if (payload.kind === 'saml-target') {
    if (!payload.samlSection || !NAME_PATTERN.test(payload.samlSection)) {
      throw new Error('Invalid saml2aws section name')
    }
    commandLine = `saml2aws login -a ${payload.samlSection}`
  } else {
    throw new Error(`Unsupported login kind: ${payload.kind}`)
  }

  await launchTerminalWithCommand(commandLine)
}
