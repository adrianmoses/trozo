// JSON log lines on stdout/stderr, read in production with `fly logs` (009).
// Callers pass an allowlist of fields: never the input phrase, tokens, JWTs
// or connection strings.

export type LogLevel = 'info' | 'warn' | 'error'
export type LogFields = Record<
  string,
  string | number | boolean | null | undefined
>
export type LogWriter = (line: string, level: LogLevel) => void

const defaultWriter: LogWriter = (line, level) => {
  if (level === 'info') console.log(line)
  else console.error(line)
}

export function formatLog(
  level: LogLevel,
  fields: LogFields,
  now: Date = new Date(),
): string {
  return JSON.stringify({ ts: now.toISOString(), level, ...fields })
}

export function logJson(
  level: LogLevel,
  fields: LogFields,
  write: LogWriter = defaultWriter,
): void {
  write(formatLog(level, fields), level)
}
