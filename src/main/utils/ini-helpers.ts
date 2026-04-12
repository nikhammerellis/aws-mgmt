import { readFile, writeFile, access } from 'fs/promises'
import { parse, stringify } from 'ini'

export type IniData = Record<string, Record<string, string>>

export async function readIniFile(filePath: string): Promise<IniData> {
  try {
    await access(filePath)
    const content = await readFile(filePath, 'utf-8')
    return parse(content) as IniData
  } catch {
    return {}
  }
}

export async function writeIniFile(filePath: string, data: IniData): Promise<void> {
  const content = stringify(data)
  await writeFile(filePath, content, 'utf-8')
}
