import { useState, useEffect, useCallback } from 'react'
import type { SamlProfile } from '../types'

export function useSamlProfiles() {
  const [profiles, setProfiles] = useState<SamlProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.getSamlProfiles()
      setProfiles(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SAML profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  const addProfile = useCallback(async (data: SamlProfile) => {
    await window.api.addSamlProfile(data)
    await refresh()
  }, [refresh])

  const updateProfile = useCallback(async (name: string, data: SamlProfile) => {
    await window.api.updateSamlProfile(name, data)
    await refresh()
  }, [refresh])

  const deleteProfile = useCallback(async (name: string) => {
    await window.api.deleteSamlProfile(name)
    await refresh()
  }, [refresh])

  useEffect(() => {
    refresh()
    const unsub = window.api.onSamlChanged(refresh)
    return unsub
  }, [refresh])

  return { profiles, loading, error, refresh, addProfile, updateProfile, deleteProfile }
}
