import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSamlProfiles } from '../useSamlProfiles'
import type { SamlProfile } from '../../types'

const mockSamlProfiles: SamlProfile[] = [
  { name: 'uncharted', provider: 'GoogleApps', username: 'user@example.com', url: 'https://idp.example.com' }
]

beforeEach(() => {
  vi.clearAllMocks()
  window.api.getSamlProfiles = vi.fn().mockResolvedValue(mockSamlProfiles)
  window.api.addSamlProfile = vi.fn().mockResolvedValue(undefined)
  window.api.updateSamlProfile = vi.fn().mockResolvedValue(undefined)
  window.api.deleteSamlProfile = vi.fn().mockResolvedValue(undefined)
  window.api.onSamlChanged = vi.fn().mockReturnValue(() => {})
})

describe('useSamlProfiles', () => {
  it('loads SAML profiles on mount', async () => {
    const { result } = renderHook(() => useSamlProfiles())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.profiles).toEqual(mockSamlProfiles)
    expect(result.current.error).toBeNull()
  })

  it('subscribes to SAML change events', async () => {
    renderHook(() => useSamlProfiles())

    await waitFor(() => {
      expect(window.api.onSamlChanged).toHaveBeenCalledOnce()
    })
  })

  it('adds a SAML profile and refreshes', async () => {
    const { result } = renderHook(() => useSamlProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const newProfile: SamlProfile = { name: 'new-saml', provider: 'Okta', username: 'admin@test.com' }
    await act(async () => {
      await result.current.addProfile(newProfile)
    })

    expect(window.api.addSamlProfile).toHaveBeenCalledWith(newProfile)
    expect(window.api.getSamlProfiles).toHaveBeenCalledTimes(2)
  })

  it('updates a SAML profile and refreshes', async () => {
    const { result } = renderHook(() => useSamlProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const updated: SamlProfile = { name: 'uncharted', provider: 'Okta', username: 'new@test.com' }
    await act(async () => {
      await result.current.updateProfile('uncharted', updated)
    })

    expect(window.api.updateSamlProfile).toHaveBeenCalledWith('uncharted', updated)
  })

  it('deletes a SAML profile and refreshes', async () => {
    const { result } = renderHook(() => useSamlProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteProfile('uncharted')
    })

    expect(window.api.deleteSamlProfile).toHaveBeenCalledWith('uncharted')
    expect(window.api.getSamlProfiles).toHaveBeenCalledTimes(2)
  })

  it('handles load error', async () => {
    window.api.getSamlProfiles = vi.fn().mockRejectedValue(new Error('File not found'))

    const { result } = renderHook(() => useSamlProfiles())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('File not found')
  })
})
