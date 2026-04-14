import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock window.api (the preload bridge)
const mockApi = {
  getAppVersion: vi.fn().mockResolvedValue('0.0.0-test'),
  getProfiles: vi.fn().mockResolvedValue([]),
  getActiveProfile: vi.fn().mockResolvedValue(null),
  switchProfile: vi.fn().mockResolvedValue({ persisted: true, mechanism: 'setx' }),
  addProfile: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  deleteProfile: vi.fn().mockResolvedValue(undefined),
  getRenameImpact: vi.fn().mockResolvedValue({
    oldName: '',
    newName: '',
    isDefault: false,
    configExists: false,
    credentialsExists: false,
    isActive: false,
    sourceProfileDependents: [],
    samlDependents: [],
    cliCacheFiles: [],
    conflict: false,
    validationError: 'empty'
  }),
  renameProfile: vi.fn().mockResolvedValue(undefined),
  getShellHint: vi.fn().mockResolvedValue({
    flavor: 'bash',
    exportLineTemplate: 'export AWS_PROFILE=__PROFILE__'
  }),
  launchTerminal: vi.fn().mockResolvedValue(undefined),
  launchLogin: vi.fn().mockResolvedValue(undefined),
  testProfile: vi.fn().mockResolvedValue({ ok: false, error: 'mock' }),
  getProfileExpiries: vi.fn().mockResolvedValue([]),
  trackPendingLogin: vi.fn().mockResolvedValue(undefined),
  getSamlProfiles: vi.fn().mockResolvedValue([]),
  addSamlProfile: vi.fn().mockResolvedValue(undefined),
  updateSamlProfile: vi.fn().mockResolvedValue(undefined),
  deleteSamlProfile: vi.fn().mockResolvedValue(undefined),
  onProfilesChanged: vi.fn().mockReturnValue(() => {}),
  onSamlChanged: vi.fn().mockReturnValue(() => {}),
  onLoginVerified: vi.fn().mockReturnValue(() => {}),
  onExpiriesChanged: vi.fn().mockReturnValue(() => {})
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true
})
