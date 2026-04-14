import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { readIniFile, writeIniFile } from '../utils/ini-helpers'
import {
  getAwsConfigPath,
  getAwsCredentialsPath,
  getSamlConfigPath
} from '../utils/paths'
import { readAwsConfig } from './aws-config'
import { readSamlConfig } from './saml-config'
import { getActiveProfile, switchProfile } from './profile-switcher'
import { setWriteLock } from './file-watcher'
import { PROFILE_NAME_PATTERN } from '../../shared/validation'
import type { RenameImpact, RenameOptions } from '../../renderer/types'

export type { RenameImpact, RenameOptions }

const NAME_PATTERN = PROFILE_NAME_PATTERN
const CLI_CACHE_DIR = join(homedir(), '.aws', 'cli', 'cache')

function profileSection(name: string): string {
  return name === 'default' ? 'default' : `profile ${name}`
}

async function listCliCacheFiles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(CLI_CACHE_DIR)
    return entries.filter((e) => e.endsWith('.json')).map((e) => join(CLI_CACHE_DIR, e))
  } catch {
    return []
  }
}

export async function getRenameImpact(
  oldName: string,
  newName: string
): Promise<RenameImpact> {
  const trimmed = newName.trim()
  const isDefault = oldName === 'default'

  const [awsConfig, credsData, samlEntries, activeProfile, cacheFiles] = await Promise.all([
    readAwsConfig(),
    readIniFile(getAwsCredentialsPath()),
    readSamlConfig(),
    getActiveProfile(),
    listCliCacheFiles()
  ])

  const configExists = awsConfig.some((p) => p.name === oldName)
  const credentialsExists = Object.prototype.hasOwnProperty.call(credsData, oldName)

  const sourceProfileDependents = awsConfig
    .filter((p) => p.name !== oldName && p.source_profile === oldName)
    .map((p) => p.name)

  const samlDependents = samlEntries
    .filter((e) => e.aws_profile === oldName)
    .map((e) => e.name)

  const newConfigExists = trimmed.length > 0 && awsConfig.some((p) => p.name === trimmed)
  const newCredsExists = trimmed.length > 0 && Object.prototype.hasOwnProperty.call(credsData, trimmed)
  const conflict = trimmed.length > 0 && trimmed !== oldName && (newConfigExists || newCredsExists)

  let validationError: RenameImpact['validationError'] = null
  if (!trimmed) validationError = 'empty'
  else if (trimmed === oldName) validationError = 'same'
  else if (!NAME_PATTERN.test(trimmed)) validationError = 'invalid-chars'
  else if (conflict) validationError = 'conflict'
  else if (!configExists && !credentialsExists) validationError = 'not-found'

  return {
    oldName,
    newName: trimmed,
    isDefault,
    configExists,
    credentialsExists,
    isActive: activeProfile === oldName,
    sourceProfileDependents,
    samlDependents,
    cliCacheFiles: cacheFiles,
    conflict,
    validationError
  }
}

export async function renameProfile(
  oldName: string,
  newName: string,
  options: RenameOptions
): Promise<void> {
  const impact = await getRenameImpact(oldName, newName)

  if (impact.validationError) {
    throw new Error(`Rename blocked: ${impact.validationError}`)
  }
  if (impact.isDefault && !options.allowDefault) {
    throw new Error('Rename blocked: default-disallowed')
  }

  const target = impact.newName

  // Move the [profile X] section in ~/.aws/config and rewrite source_profile
  // dependents in the same write so file-watcher only sees one change.
  if (impact.configExists || impact.sourceProfileDependents.length > 0) {
    setWriteLock()
    const configData = await readIniFile(getAwsConfigPath())

    if (impact.configExists) {
      const oldSection = profileSection(oldName)
      const newSection = profileSection(target)
      if (configData[oldSection]) {
        configData[newSection] = configData[oldSection]
        delete configData[oldSection]
      }
    }

    if (options.rewriteSourceProfileDependents) {
      for (const depName of impact.sourceProfileDependents) {
        const depSection = profileSection(depName)
        if (configData[depSection] && configData[depSection].source_profile === oldName) {
          configData[depSection].source_profile = target
        }
      }
    }

    await writeIniFile(getAwsConfigPath(), configData)
  }

  // Move the [X] section in ~/.aws/credentials.
  if (impact.credentialsExists) {
    setWriteLock()
    const credsData = await readIniFile(getAwsCredentialsPath())
    if (credsData[oldName]) {
      credsData[target] = credsData[oldName]
      delete credsData[oldName]
    }
    await writeIniFile(getAwsCredentialsPath(), credsData)
  }

  // Rewrite saml2aws aws_profile references.
  if (options.rewriteSamlDependents && impact.samlDependents.length > 0) {
    setWriteLock()
    const samlData = await readIniFile(getSamlConfigPath())
    for (const depName of impact.samlDependents) {
      if (samlData[depName] && samlData[depName].aws_profile === oldName) {
        samlData[depName].aws_profile = target
      }
    }
    await writeIniFile(getSamlConfigPath(), samlData)
  }

  // Re-point the OS-level AWS_PROFILE if this profile was active.
  if (impact.isActive) {
    await switchProfile(target)
  }

  // Drop stale assume-role cache files (SSO cache is keyed by start URL, not
  // by profile name, so it is intentionally untouched).
  if (options.clearCliCache && impact.cliCacheFiles.length > 0) {
    await Promise.all(
      impact.cliCacheFiles.map(async (file) => {
        try {
          await fs.unlink(file)
        } catch {
          // ENOENT or already gone
        }
      })
    )
  }
}
