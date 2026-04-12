import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProfiles } from '../useProfiles'
import type { AwsProfile } from '../../types'

const mockProfiles: AwsProfile[] = [
  { name: 'default', isActive: true, region: 'us-east-1', hasCredentials: true },
  { name: 'dev', isActive: false, region: 'us-west-2', hasCredentials: true },
  { name: 'staging', isActive: false, region: 'eu-west-1', hasCredentials: false }
]

beforeEach(() => {
  vi.clearAllMocks()
  window.api.getProfiles = vi.fn().mockResolvedValue(mockProfiles)
  window.api.switchProfile = vi.fn().mockResolvedValue(undefined)
  window.api.addProfile = vi.fn().mockResolvedValue(undefined)
  window.api.updateProfile = vi.fn().mockResolvedValue(undefined)
  window.api.deleteProfile = vi.fn().mockResolvedValue(undefined)
  window.api.onProfilesChanged = vi.fn().mockReturnValue(() => {})
})

describe('useProfiles', () => {
  it('loads profiles on mount', async () => {
    const { result } = renderHook(() => useProfiles())

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.profiles).toEqual(mockProfiles)
    expect(result.current.error).toBeNull()
    expect(window.api.getProfiles).toHaveBeenCalledOnce()
  })

  it('subscribes to file change events', async () => {
    renderHook(() => useProfiles())

    await waitFor(() => {
      expect(window.api.onProfilesChanged).toHaveBeenCalledOnce()
    })
  })

  it('handles load error gracefully', async () => {
    window.api.getProfiles = vi.fn().mockRejectedValue(new Error('Read failed'))

    const { result } = renderHook(() => useProfiles())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Read failed')
    expect(result.current.profiles).toEqual([])
  })

  it('switches profile and refreshes', async () => {
    const { result } = renderHook(() => useProfiles())

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.switchProfile('dev')
    })

    expect(window.api.switchProfile).toHaveBeenCalledWith('dev')
    // getProfiles called twice: initial load + refresh after switch
    expect(window.api.getProfiles).toHaveBeenCalledTimes(2)
  })

  it('adds a profile and refreshes', async () => {
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const newProfile = { name: 'new-profile', region: 'us-east-2' }
    await act(async () => {
      await result.current.addProfile(newProfile)
    })

    expect(window.api.addProfile).toHaveBeenCalledWith(newProfile)
    expect(window.api.getProfiles).toHaveBeenCalledTimes(2)
  })

  it('updates a profile and refreshes', async () => {
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const changes = { name: 'dev', region: 'ap-southeast-1' }
    await act(async () => {
      await result.current.updateProfile('dev', changes)
    })

    expect(window.api.updateProfile).toHaveBeenCalledWith('dev', changes)
  })

  it('deletes a profile and refreshes', async () => {
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteProfile('staging')
    })

    expect(window.api.deleteProfile).toHaveBeenCalledWith('staging')
    expect(window.api.getProfiles).toHaveBeenCalledTimes(2)
  })

  it('sets error on switch failure', async () => {
    window.api.switchProfile = vi.fn().mockRejectedValue(new Error('Switch failed'))

    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.switchProfile('bad')
    })

    expect(result.current.error).toBe('Switch failed')
  })
})
