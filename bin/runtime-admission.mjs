// Runtime admission — refuse an unsupported Node.js with a readable message
// instead of a module-linking stack trace from deep inside the server.
//
// The range is the package's own `engines.node`, so the shim, the installers
// and npm can't drift apart. Deliberately import-free: it must run before any
// dependency is resolved.

/** True when `version` (e.g. "24.1.0") satisfies `range` — clauses of the form
 *  `>=X.Y.Z` / `^X.Y.Z` joined by `||` (the only forms we publish). */
export function satisfiesNodeRange(range, version) {
  const v = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!v) return false;
  const [maj, min, pat] = v.slice(1).map(Number);
  return range.split("||").some((clause) => {
    const f = clause.trim().match(/^(>=|\^)\s*(\d+)\.(\d+)\.(\d+)$/);
    if (!f) return false;
    const op = f[1];
    const [fMaj, fMin, fPat] = f.slice(2).map(Number);
    if (maj !== fMaj) return op === ">=" && maj > fMaj;
    if (min !== fMin) return min > fMin;
    return pat >= fPat;
  });
}

function nodeHelp(platform) {
  switch (platform) {
    case "win32":
      return "  winget install --exact --id OpenJS.NodeJS.LTS   (then reopen PowerShell)";
    case "darwin":
      return "  brew install node   (or the .pkg from https://nodejs.org/en/download)";
    case "android":
      return "  pkg install nodejs-lts";
    default:
      return "  curl -fsSL https://fnm.vercel.app/install | bash && fnm install 24 && fnm default 24";
  }
}

/** undefined when admitted, otherwise the message to print. */
export function unsupportedRuntimeMessage(range, version = process.versions.node, platform = process.platform) {
  if (typeof range !== "string" || range.length === 0) return undefined;
  if (satisfiesNodeRange(range, version)) return undefined;
  return (
    `decompile requires Node.js ${range}; this process runs Node.js ${version}.\n` +
    `Install a supported release, then retry:\n${nodeHelp(platform)}\n` +
    `See https://github.com/1llu50ry/Decompile/wiki/Installation#1-prepare-your-computer`
  );
}
