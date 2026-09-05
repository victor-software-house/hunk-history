/** Adapted from modem-dev/hunk; see README.md and LICENSE in this directory. */
export function normalizeDiffPath(path: string | undefined) {
  return path?.replace(/[\r\n]+$/u, "");
}

/** Render exact filesystem paths without letting controls alter terminal geometry. */
export function formatTerminalPath(path: string) {
  let formatted = "";
  for (const character of path) {
    const codePoint = character.codePointAt(0)!;
    if (character === "\\") formatted += "\\\\";
    else if (character === "\t") formatted += "\\t";
    else if (character === "\n") formatted += "\\n";
    else if (character === "\r") formatted += "\\r";
    else if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      formatted += `\\x${codePoint.toString(16).padStart(2, "0")}`;
    } else formatted += character;
  }
  return formatted;
}
