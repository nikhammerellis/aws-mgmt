import { promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import { dirname, basename, join } from 'path'
import { parse, stringify } from 'ini'

export type IniData = Record<string, Record<string, string>>

export interface WriteIniOptions {
  /**
   * Filesystem mode to apply to the written file. On POSIX this is
   * enforced via `fs.chmod` after the atomic rename; on Windows `mode`
   * is largely cosmetic and the value is ignored by the OS. Use `0o600`
   * for any file that contains secrets (credentials, saml2aws config).
   */
  mode?: number
}

export async function readIniFile(filePath: string): Promise<IniData> {
  try {
    await fs.access(filePath)
    const content = await fs.readFile(filePath, 'utf-8')
    return parse(content) as IniData
  } catch {
    return {}
  }
}

/**
 * Atomic INI write: writes to a random-named temp file in the same
 * directory, chmod's it, then renames over the target path. `rename()`
 * is atomic within a filesystem, so a crash mid-write leaves either the
 * old file intact or the new file complete — never a half-written mess.
 *
 * Also mitigates the symlink-write-through concern: `rename()` replaces
 * the directory entry rather than following it, so if an attacker
 * pre-plants a symlink at the target path pointing at `/etc/passwd`, we
 * do not write through the link.
 */
export async function writeIniFile(
  filePath: string,
  data: IniData,
  options: WriteIniOptions = {}
): Promise<void> {
  const content = stringify(data)
  const dir = dirname(filePath)
  const base = basename(filePath)
  const tmpName = `.${base}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const tmpPath = join(dir, tmpName)

  const mode = options.mode ?? 0o644

  try {
    // Write to temp file with the desired mode up front. `wx` refuses to
    // open an existing file, which protects against an attacker racing us
    // to pre-plant something at the tempfile path.
    await fs.writeFile(tmpPath, content, { encoding: 'utf-8', mode, flag: 'wx' })

    // On some filesystems the umask can strip bits even when the mode was
    // set on open. Re-apply defensively; ignored on Windows.
    if (process.platform !== 'win32') {
      await fs.chmod(tmpPath, mode)
    }

    await fs.rename(tmpPath, filePath)
  } catch (err) {
    // Best-effort cleanup of the tempfile on failure.
    try {
      await fs.unlink(tmpPath)
    } catch {
      /* already gone */
    }
    throw err
  }
}
