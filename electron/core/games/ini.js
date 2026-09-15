'use strict';
/* ============================================================================
 * core/games/ini.js — tiny shared INI helper for the Potato Graphics game
 * profiles (core/games/*.js). Line-based editing that preserves comments,
 * blank lines, section order and casing of untouched lines:
 *   setKeys(text, [{ section, key, value }]) → { text, changed[], added[] }
 * Sections are created at EOF when missing; existing keys are replaced
 * in place wherever they currently live in the file.
 * ========================================================================== */

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSectionLine(ln, header) {
  return ln.trim().toLowerCase() === String(header).trim().toLowerCase();
}

/* Locate the [start, end) line span of a section header (case-insensitive).
 * Returns null when the section does not exist yet. */
function sectionSpan(lines, header) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isSectionLine(lines[i], header)) { start = i; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.*\]\s*$/.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

function setKeys(text, entries) {
  const lines = String(text || '').split(/\r?\n/);
  const changed = [];
  const added = [];
  for (const { section, key, value } of entries) {
    const re = new RegExp(`^(\\s*${escRe(key)}\\s*=).*$`, 'i');
    const span = sectionSpan(lines, section);
    let done = false;
    if (span) {
      for (let i = span.start + 1; i < span.end; i++) {
        if (re.test(lines[i])) {
          lines[i] = `${key}=${value}`;
          changed.push(key);
          done = true;
          break;
        }
      }
    }
    if (!done) {
      // Key not present: append under its section (creating it if needed).
      const fresh = sectionSpan(lines, section);
      const line = `${key}=${value}`;
      if (fresh) {
        lines.splice(fresh.end, 0, line);
      } else {
        if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(section, line);
      }
      added.push(key);
    }
  }
  return { text: lines.join('\n'), changed, added };
}

module.exports = { setKeys };
