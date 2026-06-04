import os from "node:os";
import process from "node:process";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(input) {
  let text = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  const projectRoot = process.cwd();
  const home = os.homedir();

  for (const marker of [projectRoot, home]) {
    if (marker) {
      const replacement = marker === projectRoot ? "<PROJECT_ROOT>" : "<HOME>";
      for (const variant of [marker, marker.replace(/\\/g, "/"), marker.replace(/\\/g, "\\\\")]) {
        text = text.replace(new RegExp(escapeRegExp(variant), "gi"), replacement);
      }
    }
  }

  text = text.replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/gi, "<USER_PATH>");
  text = text.replace(/file:\/\/\/[A-Za-z]:\/Users\/[^/\s"']+/gi, "file:///<USER_PATH>");
  text = text.replace(/\/Users\/[^/\s"']+/g, "/<USER_PATH>");
  text = text.replace(/\/home\/[^/\s"']+/g, "/<USER_PATH>");
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "<EMAIL>");
  text = text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer <REDACTED>");
  text = text.replace(/("(?:api[_-]?key|token|secret|password|authorization)"\s*:\s*)"[^"]*"/gi, '$1"<REDACTED>"');
  text = text.replace(/('(?:api[_-]?key|token|secret|password|authorization)'\s*:\s*)'[^']*'/gi, "$1'<REDACTED>'");
  text = text.replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^"',}\s]+/gi, "$1=<REDACTED>");
  text = text.replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-<REDACTED>");

  return text;
}
