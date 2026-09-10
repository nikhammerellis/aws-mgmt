import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockExecFileAsync, mockReadFile, mockGetProfileExpiries, mockReadAwsCredentials } =
  vi.hoisted(() => ({
    mockExecFileAsync: vi.fn(),
    mockReadFile: vi.fn(),
    mockGetProfileExpiries: vi.fn(),
    mockReadAwsCredentials: vi.fn()
  }))

vi.mock('child_process', () => ({ execFile: vi.fn() }))
vi.mock('util', () => ({ promisify: () => mockExecFileAsync }))
vi.mock('fs', () => ({
  promises: { readFile: mockReadFile, writeFile: vi.fn(), rename: vi.fn(), unlink: vi.fn() }
}))
vi.mock('../file-watcher', () => ({ setWriteLock: vi.fn() }))
vi.mock('../expiry-tracker', () => ({ getProfileExpiries: mockGetProfileExpiries }))
vi.mock('../aws-credentials', () => ({ readAwsCredentials: mockReadAwsCredentials }))
vi.mock('../../utils/paths', () => ({
  getNmdContextPath: () => '/fake/.aws/nmd-context.json'
}))

import { getActiveContext } from '../profile-switcher'

const FUTURE = new Date(Date.now() + 8 * 3600_000).toISOString()
const SOONER = new Date(Date.now() + 1 * 3600_000).toISOString()
const PAST = new Date(Date.now() - 3600_000).toISOString()

function expiry(profileName: string, expiresAt: string) {
  return { profileName, expiresAt, source: 'saml2aws' as const }
}

/** A long-lived IAM-key section: an access key, and no session token. */
function staticKeys(name: string) {
  return { name, aws_access_key_id: 'AKIA_TEST', aws_secret_access_key: 'secret' }
}

describe('getActiveContext', () => {
  const originalEnv = process.env
  const originalPlatform = process.platform

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.AWS_PROFILE
    vi.clearAllMocks()
    // Default: no context file, no persisted machine default.
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockExecFileAsync.mockRejectedValue(new Error('not set'))
    mockGetProfileExpiries.mockResolvedValue([])
    mockReadAwsCredentials.mockResolvedValue([])
    Object.defineProperty(process, 'platform', { value: 'linux' })
  })

  afterEach(() => {
    process.env = originalEnv
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('reports only unexpired sessions as live, soonest-expiring first', async () => {
    mockGetProfileExpiries.mockResolvedValue([
      expiry('logistics', FUTURE),
      expiry('saml', PAST),
      expiry('vision', SOONER)
    ])

    const ctx = await getActiveContext()

    expect(ctx.liveProfiles).toEqual(['vision', 'logistics'])
  })

  it('treats a single live session as unambiguously effective', async () => {
    mockGetProfileExpiries.mockResolvedValue([expiry('media', FUTURE)])

    const ctx = await getActiveContext()

    expect(ctx.effective).toBe('media')
  })

  it('prefers the context file when it names a live profile', async () => {
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE), expiry('vision', FUTURE)])
    mockReadFile.mockResolvedValue(JSON.stringify({ profile: 'vision' }))
    process.env.AWS_PROFILE = 'logistics'

    const ctx = await getActiveContext()

    expect(ctx.contextProfile).toBe('vision')
    expect(ctx.effective).toBe('vision')
  })

  // The context file is the last EXPLICIT selection by either party — awsgo,
  // awsuse, or the app's own switchProfile. Redirecting to a live session the
  // user never chose is what left the badge pinned after a Switch click.
  it('honours a context file naming a profile that is not live, and says it is not live', async () => {
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE), expiry('media', FUTURE)])
    mockReadFile.mockResolvedValue(JSON.stringify({ profile: 'expired-thing' }))
    process.env.AWS_PROFILE = 'logistics'

    const ctx = await getActiveContext()

    expect(ctx.contextProfile).toBe('expired-thing')
    expect(ctx.effective).toBe('expired-thing')
    // The UI still has everything it needs to be honest about it.
    expect(ctx.liveProfiles).not.toContain('expired-thing')
    expect(ctx.liveProfiles).toEqual(['logistics', 'media'])
  })

  it('lets an explicit selection win over a single live session', async () => {
    // Exactly today's shape: one legacy [saml] session live, everything from
    // the fan-out expired, and the user picks one of the expired ones.
    mockGetProfileExpiries.mockResolvedValue([expiry('saml', FUTURE), expiry('logistics', PAST)])
    mockReadFile.mockResolvedValue(JSON.stringify({ profile: 'logistics' }))

    const ctx = await getActiveContext()

    expect(ctx.liveProfiles).toEqual(['saml'])
    expect(ctx.effective).toBe('logistics')
  })

  it('identifies long-lived IAM keys as static, never as live', async () => {
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE)])
    mockReadAwsCredentials.mockResolvedValue([
      staticKeys('legacy-static'),
      staticKeys('billing-keys'),
      // A saml2aws section: has a session token, so it is not static even
      // though its expiry has passed.
      { name: 'logistics', aws_access_key_id: 'ASIA_X', aws_session_token: 'tok' }
    ])

    const ctx = await getActiveContext()

    expect(ctx.staticProfiles).toEqual(['legacy-static', 'billing-keys'])
    expect(ctx.staticProfiles).not.toContain('logistics')
  })

  it('does not call a static-key machine default stale', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    mockExecFileAsync.mockResolvedValue({
      stdout: '    AWS_PROFILE    REG_SZ    legacy-static\r\n'
    })
    mockReadAwsCredentials.mockResolvedValue([staticKeys('legacy-static')])
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE)])

    const ctx = await getActiveContext()

    expect(ctx.machineDefault).toBe('legacy-static')
    // Permanent keys work indefinitely — calling them stale told the user to
    // run a login that does not exist for them.
    expect(ctx.machineDefaultStale).toBe(false)
  })

  it('survives an unreadable credentials file', async () => {
    mockReadAwsCredentials.mockRejectedValue(new Error('EACCES'))
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE)])

    const ctx = await getActiveContext()

    expect(ctx.staticProfiles).toEqual([])
    expect(ctx.effective).toBe('logistics')
  })

  it('survives a malformed context file', async () => {
    mockReadFile.mockResolvedValue('{ not json')
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE)])

    const ctx = await getActiveContext()

    expect(ctx.contextProfile).toBeNull()
    expect(ctx.effective).toBe('logistics')
  })

  it('flags a machine default that has no live credentials', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    mockExecFileAsync.mockResolvedValue({
      stdout: '    AWS_PROFILE    REG_SZ    default\r\n'
    })
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE)])

    const ctx = await getActiveContext()

    expect(ctx.machineDefault).toBe('default')
    expect(ctx.machineDefaultStale).toBe(true)
    // This is the exact bug the app used to have: it reported "default".
    expect(ctx.effective).toBe('logistics')
  })

  it('does not flag a machine default that is live', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    mockExecFileAsync.mockResolvedValue({
      stdout: '    AWS_PROFILE    REG_SZ    logistics\r\n'
    })
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE)])

    const ctx = await getActiveContext()

    expect(ctx.machineDefaultStale).toBe(false)
  })

  it('reports nothing live when no session exists, without throwing', async () => {
    mockGetProfileExpiries.mockRejectedValue(new Error('unreadable'))

    const ctx = await getActiveContext()

    expect(ctx.liveProfiles).toEqual([])
    expect(ctx.effective).toBeNull()
    expect(ctx.machineDefaultStale).toBe(false)
  })

  it('keeps shellProfile distinct from the live set', async () => {
    process.env.AWS_PROFILE = 'legacy-static'
    mockGetProfileExpiries.mockResolvedValue([expiry('logistics', FUTURE), expiry('vision', FUTURE)])

    const ctx = await getActiveContext()

    expect(ctx.shellProfile).toBe('legacy-static')
    expect(ctx.liveProfiles).not.toContain('legacy-static')
    expect(ctx.effective).toBe('legacy-static')
  })
})
