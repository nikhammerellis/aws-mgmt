import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  ActiveContext,
  AwsProfile,
  NewProfileData,
  RenameImpact,
  RenameOptions,
  SwitchResult
} from '../types'

export function useProfiles() {
  const [profiles, setProfiles] = useState<AwsProfile[]>([])
  const [activeContext, setActiveContext] = useState<ActiveContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Only the very first load shows the loading state. Afterwards this hook is
  // driven by events — the 60s expiry tick and every credentials-file write —
  // and flipping `loading` on those unmounts the whole list, including the
  // search box, so anything the user was typing goes to a detached input.
  const hasLoaded = useRef(false)

  const refresh = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true)
      setError(null)
      // Fetched together so the header can never render a profile list and an
      // "active" label that disagree about which session is live.
      const [data, context] = await Promise.all([
        window.api.getProfiles(),
        window.api.getActiveContext()
      ])
      setProfiles(data)
      setActiveContext(context)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles')
    } finally {
      hasLoaded.current = true
      setLoading(false)
    }
  }, [])

  const switchProfile = useCallback(async (name: string): Promise<SwitchResult | null> => {
    try {
      const result = await window.api.switchProfile(name)
      await refresh()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch profile')
      return null
    }
  }, [refresh])

  const addProfile = useCallback(async (data: NewProfileData) => {
    try {
      await window.api.addProfile(data)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add profile')
    }
  }, [refresh])

  const updateProfile = useCallback(async (name: string, data: NewProfileData) => {
    try {
      await window.api.updateProfile(name, data)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    }
  }, [refresh])

  const deleteProfile = useCallback(async (name: string) => {
    try {
      await window.api.deleteProfile(name)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete profile')
    }
  }, [refresh])

  const getRenameImpact = useCallback(
    async (oldName: string, newName: string): Promise<RenameImpact> => {
      return window.api.getRenameImpact(oldName, newName)
    },
    []
  )

  const renameProfile = useCallback(
    async (oldName: string, newName: string, options: RenameOptions) => {
      try {
        await window.api.renameProfile(oldName, newName, options)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to rename profile')
        throw err
      }
    },
    [refresh]
  )

  useEffect(() => {
    refresh()
    // Credential expiry decides which profiles count as live, so the context
    // has to follow expiry events as well as profile-file changes.
    const unsubProfiles = window.api.onProfilesChanged(refresh)
    const unsubExpiries = window.api.onExpiriesChanged(refresh)
    return () => {
      unsubProfiles()
      unsubExpiries()
    }
  }, [refresh])

  return {
    profiles,
    activeContext,
    loading,
    error,
    refresh,
    switchProfile,
    addProfile,
    updateProfile,
    deleteProfile,
    getRenameImpact,
    renameProfile
  }
}
