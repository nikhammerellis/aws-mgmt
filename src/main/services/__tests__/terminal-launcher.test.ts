import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('child_process', () => ({
  spawn: vi.fn()
}))

import { spawn } from 'child_process'
import {
  detectShellHint,
  launchTerminalWithProfile,
  launchLoginInTerminal,
  exportLineTemplateFor
} from '../terminal-launcher'

const mockSpawn = vi.mocked(spawn)

class FakeChild extends EventEmitter {
  unref = vi.fn()
}

function makeChild(): FakeChild {
  return new FakeChild()
}

const originalPlatform = process.platform
const originalEnv = { ...process.env }

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  process.env = { ...originalEnv }
})

describe('detectShellHint', () => {
  it('returns pwsh on Windows when PSModulePath is set', () => {
    setPlatform('win32')
    process.env.PSModulePath = 'C:\\Modules'

    const hint = detectShellHint()
    expect(hint.flavor).toBe('pwsh')
    expect(hint.exportLineTemplate).toBe('$env:AWS_PROFILE = "__PROFILE__"')
  })

  it('returns cmd on Windows without PSModulePath', () => {
    setPlatform('win32')
    delete process.env.PSModulePath

    expect(detectShellHint().flavor).toBe('cmd')
    expect(detectShellHint().exportLineTemplate).toBe('set AWS_PROFILE=__PROFILE__')
  })

  it('returns zsh when SHELL contains zsh', () => {
    setPlatform('linux')
    process.env.SHELL = '/usr/bin/zsh'

    expect(detectShellHint().flavor).toBe('zsh')
    expect(detectShellHint().exportLineTemplate).toBe('export AWS_PROFILE=__PROFILE__')
  })

  it('returns fish and produces a fish-flavored export line', () => {
    setPlatform('linux')
    process.env.SHELL = '/usr/local/bin/fish'

    const hint = detectShellHint()
    expect(hint.flavor).toBe('fish')
    expect(hint.exportLineTemplate).toBe('set -x AWS_PROFILE __PROFILE__')
  })

  it('falls back to bash on unknown SHELL', () => {
    setPlatform('linux')
    process.env.SHELL = '/bin/sh'

    expect(detectShellHint().flavor).toBe('bash')
  })

  it('exportLineTemplateFor returns POSIX format for bash and zsh', () => {
    expect(exportLineTemplateFor('bash')).toBe('export AWS_PROFILE=__PROFILE__')
    expect(exportLineTemplateFor('zsh')).toBe('export AWS_PROFILE=__PROFILE__')
  })
})

describe('launchTerminalWithProfile', () => {
  it('rejects names with invalid characters', async () => {
    setPlatform('linux')
    await expect(launchTerminalWithProfile('has spaces')).rejects.toThrow(/Invalid profile name/)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('spawns wt.exe with AWS_PROFILE injected on Windows', async () => {
    setPlatform('win32')
    mockSpawn.mockReturnValue(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchTerminalWithProfile('dev')

    const [cmd, args, options] = mockSpawn.mock.calls[0]
    expect(cmd).toBe('wt.exe')
    expect(args).toEqual([])
    expect((options as { env: NodeJS.ProcessEnv }).env.AWS_PROFILE).toBe('dev')
  })

  it('falls back to cmd.exe when wt.exe is not available', async () => {
    setPlatform('win32')
    mockSpawn.mockImplementationOnce(() => {
      const child = makeChild()
      // emit ENOENT asynchronously
      setImmediate(() => child.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' })))
      return child as unknown as ReturnType<typeof spawn>
    })
    mockSpawn.mockReturnValueOnce(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchTerminalWithProfile('dev')

    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(mockSpawn.mock.calls[0][0]).toBe('wt.exe')
    expect(mockSpawn.mock.calls[1][0]).toBe('cmd.exe')
  })

  it('calls osascript on darwin with the AppleScript export', async () => {
    setPlatform('darwin')
    mockSpawn.mockReturnValue(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchTerminalWithProfile('dev')

    const [cmd, args] = mockSpawn.mock.calls[0]
    expect(cmd).toBe('osascript')
    expect((args as string[])[0]).toBe('-e')
    expect((args as string[])[1]).toContain('export AWS_PROFILE=dev')
  })

  it('tries multiple Linux terminals in sequence until one spawns', async () => {
    setPlatform('linux')
    mockSpawn.mockImplementationOnce(() => {
      const child = makeChild()
      setImmediate(() => child.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' })))
      return child as unknown as ReturnType<typeof spawn>
    })
    mockSpawn.mockReturnValueOnce(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchTerminalWithProfile('dev')

    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(mockSpawn.mock.calls[0][0]).toBe('x-terminal-emulator')
    expect(mockSpawn.mock.calls[1][0]).toBe('gnome-terminal')
  })
})

describe('launchLoginInTerminal', () => {
  it('rejects invalid profile names', async () => {
    await expect(
      launchLoginInTerminal({ kind: 'sso', profileName: 'has spaces' })
    ).rejects.toThrow(/Invalid profile name/)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('rejects SAML payload with missing or invalid section', async () => {
    setPlatform('win32')
    await expect(
      launchLoginInTerminal({ kind: 'saml-target', profileName: 'dev' })
    ).rejects.toThrow(/saml2aws section/)
    await expect(
      launchLoginInTerminal({ kind: 'saml-target', profileName: 'dev', samlSection: 'bad name' })
    ).rejects.toThrow(/saml2aws section/)
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('spawns wt.exe with cmd.exe /K and the aws sso login command on Windows', async () => {
    setPlatform('win32')
    mockSpawn.mockReturnValue(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchLoginInTerminal({ kind: 'sso', profileName: 'dev' })

    const [cmd, args] = mockSpawn.mock.calls[0]
    expect(cmd).toBe('wt.exe')
    expect(args).toEqual(['cmd.exe', '/K', 'aws sso login --profile dev'])
  })

  it('builds the saml2aws command with the SAML section name', async () => {
    setPlatform('win32')
    mockSpawn.mockReturnValue(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchLoginInTerminal({
      kind: 'saml-target',
      profileName: 'dev',
      samlSection: 'work-okta'
    })

    const [, args] = mockSpawn.mock.calls[0]
    expect((args as string[]).join(' ')).toContain('saml2aws login -a work-okta')
  })

  it('uses osascript on macOS', async () => {
    setPlatform('darwin')
    mockSpawn.mockReturnValue(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchLoginInTerminal({ kind: 'sso', profileName: 'dev' })

    const [cmd, args] = mockSpawn.mock.calls[0]
    expect(cmd).toBe('osascript')
    expect((args as string[])[1]).toContain('aws sso login --profile dev')
  })

  it('falls back from wt.exe to cmd.exe on Windows', async () => {
    setPlatform('win32')
    mockSpawn.mockImplementationOnce(() => {
      const child = makeChild()
      setImmediate(() => child.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' })))
      return child as unknown as ReturnType<typeof spawn>
    })
    mockSpawn.mockReturnValueOnce(makeChild() as unknown as ReturnType<typeof spawn>)

    await launchLoginInTerminal({ kind: 'sso', profileName: 'dev' })

    expect(mockSpawn).toHaveBeenCalledTimes(2)
    expect(mockSpawn.mock.calls[0][0]).toBe('wt.exe')
    expect(mockSpawn.mock.calls[1][0]).toBe('cmd.exe')
  })
})
