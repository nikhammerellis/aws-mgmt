/**
 * Minimal ambient declaration for `ini` (v5), which ships no types and has no
 * @types package. Declared locally rather than added as a dependency because
 * only two call sites are involved, both in src/main/utils/ini-helpers.ts.
 */
declare module 'ini' {
  /** Nested because AWS config files use `[sso-session name]` style blocks. */
  export type IniValue = string | number | boolean | IniObject
  export interface IniObject {
    [key: string]: IniValue
  }
  export function parse(text: string): IniObject
  export function decode(text: string): IniObject
  export function stringify(obj: unknown, options?: { section?: string; whitespace?: boolean }): string
  export function encode(obj: unknown, options?: { section?: string; whitespace?: boolean }): string
  export function safe(value: string): string
  export function unsafe(value: string): string
}
