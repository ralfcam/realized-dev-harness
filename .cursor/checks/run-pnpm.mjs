import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"

/**
 * Run `pnpm <args>` in a way that works on Windows and on Linux Cloud Agents.
 *
 * Cloud Agents are Linux (see `.cursor/environment.json`: corepack + `pnpm`).
 * Do not spawn the Windows Corepack PATH shim: it points at a Unix
 * placeholder cmd cannot execute. After `pnpm install`, `pnpm exec prettier`
 * is the local `node_modules/prettier` CLI on every OS — call that directly.
 * Other `pnpm` verbs fall back to PATH `pnpm` (Linux Cloud / a healthy Corepack).
 */
export function runPnpm(args, options = {}) {
  const { cwd = process.cwd(), ...rest } = options
  if (args[0] === "exec" && args[1] === "prettier") {
    const prettierBin = join(
      cwd,
      "node_modules",
      "prettier",
      "bin",
      "prettier.cjs",
    )
    if (existsSync(prettierBin)) {
      return spawnSync(process.execPath, [prettierBin, ...args.slice(2)], {
        encoding: "utf8",
        cwd,
        ...rest,
      })
    }
  }
  const corepackJs = join(
    dirname(process.execPath),
    "node_modules",
    "corepack",
    "dist",
    "corepack.js",
  )
  if (existsSync(corepackJs)) {
    return spawnSync(process.execPath, [corepackJs, "pnpm", ...args], {
      encoding: "utf8",
      cwd,
      ...rest,
    })
  }
  return spawnSync("pnpm", args, { encoding: "utf8", cwd, ...rest })
}
