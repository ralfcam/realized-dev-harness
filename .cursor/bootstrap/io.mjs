import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export function writeFileAtomic(path, content, options = {}) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temporary, content, options)
  renameSync(temporary, path)
}

export function writeJsonAtomic(path, value) {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}
