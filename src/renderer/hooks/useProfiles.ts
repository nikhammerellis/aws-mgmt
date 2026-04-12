import { useState, useEffect, useCallback } from 'react'
import type { AwsProfile, NewProfileData, RenameImpact, RenameOptions } from '../types'

export function useProfiles() {
  const [profiles, setProfiles] = useState<AwsProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getProfiles()
      setProfiles(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  const switchProfile = useCallback(async (name: string) => {
    try {
      await window.api.switchProfile(name)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch profile')
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
    const unsub = window.api.onProfilesChanged(refresh)
    return unsub
  }, [refresh])

  return {
    profiles,
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
