/**
 * Capture-plan parser: every append/sharpen [slug] in PHASE 5 Execution Todos
 * needs a Validation Summary row **[slug]** with a verdict: line.
 *
 * Not wired into repo-wide harness-lint.mjs — there are no committed Capture
 * Plans to scan. Proven via fixtures under .cursor/checks/fixtures/.
 */
export function checkCapturePlan(markdown) {
  if (typeof markdown !== "string") {
    return ["capture-plan: input is not markdown"]
  }
  const phase5 = sectionAfter(markdown, /^## PHASE 5 Execution Todos\b/m)
  const summary = sectionAfter(markdown, /^## Validation Summary\b/m)
  const slugs = []
  const seen = new Set()
  const slugRe = /\b(?:append|sharpen)\s+\[([^\]]+)\]/gi
  let m
  while ((m = slugRe.exec(phase5))) {
    const slug = m[1].trim()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    slugs.push(slug)
  }
  const violations = []
  for (const slug of slugs) {
    const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const row = new RegExp(`\\*\\*\\[${esc}\\][^\\n]*verdict:`)
    if (!row.test(summary)) {
      violations.push(`capture-plan: slug ${slug} has no validator row`)
    }
  }
  return violations
}

function sectionAfter(text, headingRe) {
  const m = text.match(headingRe)
  if (!m) return ""
  const rest = text.slice(m.index)
  const next = rest.search(/\n## /)
  return next === -1 ? rest : rest.slice(0, next)
}
