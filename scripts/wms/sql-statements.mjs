// Pure SQL statement scanner shared by the rehearsal and recovery builder.
const WORD_PART = /[A-Za-z0-9_$\u0080-\uFFFF]/;

function dollarTagAt(sql, offset) {
  // PostgreSQL consumes a dollar tag adjacent to an identifier as part of it.
  if (offset > 0 && WORD_PART.test(sql[offset - 1])) return null;
  return sql.slice(offset).match(/^\$(?:[A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/)?.[0] ?? null;
}

function consumeSingleQuoted(sql, offset, escapeBackslash = false) {
  let cursor = offset + 1;
  while (cursor < sql.length) {
    if (sql[cursor] === "'" && sql[cursor + 1] === "'") {
      cursor += 2;
      continue;
    }
    if (escapeBackslash && sql[cursor] === "\\") {
      cursor += Math.min(2, sql.length - cursor);
      continue;
    }
    if (sql[cursor] === "'") return cursor + 1;
    cursor += 1;
  }
  throw new SyntaxError(`Unterminated single-quoted SQL literal at offset ${offset}`);
}

function consumeDoubleQuoted(sql, offset) {
  let cursor = offset + 1;
  while (cursor < sql.length) {
    if (sql[cursor] === '"' && sql[cursor + 1] === '"') {
      cursor += 2;
      continue;
    }
    if (sql[cursor] === '"') return cursor + 1;
    cursor += 1;
  }
  throw new SyntaxError(`Unterminated quoted SQL identifier at offset ${offset}`);
}

function consumeDollarQuoted(sql, offset, tag) {
  const end = sql.indexOf(tag, offset + tag.length);
  if (end < 0) throw new SyntaxError(`Unterminated dollar-quoted SQL value at offset ${offset}`);
  return end + tag.length;
}

function consumeBlockComment(sql, offset) {
  let cursor = offset + 2;
  let depth = 1;
  while (cursor < sql.length && depth > 0) {
    if (sql[cursor] === "/" && sql[cursor + 1] === "*") {
      depth += 1;
      cursor += 2;
      continue;
    }
    if (sql[cursor] === "*" && sql[cursor + 1] === "/") {
      depth -= 1;
      cursor += 2;
      continue;
    }
    cursor += 1;
  }
  if (depth > 0) throw new SyntaxError(`Unterminated SQL block comment at offset ${offset}`);
  return cursor;
}

export function splitSqlStatements(sql) {
  const statements = [];
  let cursor = 0;
  let start = 0;
  let previousString = null;

  while (cursor < sql.length) {
    const character = sql[cursor];
    const next = sql[cursor + 1];

    if (character === "-" && next === "-") {
      cursor += 2;
      while (cursor < sql.length && !/[\r\n]/.test(sql[cursor])) cursor += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      cursor = consumeBlockComment(sql, cursor);
      continue;
    }
    if (character === "'") {
      const explicitEscape = cursor > 0 && /[eE]/.test(sql[cursor - 1])
        && (cursor === 1 || !WORD_PART.test(sql[cursor - 2]));
      const gap = previousString ? sql.slice(previousString.end, cursor) : "";
      // A newline continuation inherits E escaping even without another E.
      const continuedEscape = previousString?.escaped && /[\r\n]/.test(gap)
        && sqlStatementCommand(gap) === "";
      const escaped = Boolean(explicitEscape || continuedEscape);
      cursor = consumeSingleQuoted(sql, cursor, escaped);
      previousString = { end: cursor, escaped };
      continue;
    }
    if (character === '"') {
      cursor = consumeDoubleQuoted(sql, cursor);
      continue;
    }
    if (character === "$") {
      const tag = dollarTagAt(sql, cursor);
      if (tag) {
        cursor = consumeDollarQuoted(sql, cursor, tag);
        continue;
      }
    }
    if (character === ";") {
      statements.push(sql.slice(start, cursor));
      start = cursor + 1;
    }
    cursor += 1;
  }

  statements.push(sql.slice(start));
  return statements.filter((statement) => statement.trim().length > 0);
}

// Remove leading whitespace/comments only, preserving quoted text and bodies.
export function sqlStatementCommand(sql) {
  let cursor = 0;
  while (cursor < sql.length) {
    if (/\s/.test(sql[cursor])) { cursor += 1; continue; }
    if (sql.startsWith("--", cursor)) {
      while (cursor < sql.length && !/[\r\n]/.test(sql[cursor])) cursor += 1;
      continue;
    }
    if (sql.startsWith("/*", cursor)) { cursor = consumeBlockComment(sql, cursor); continue; }
    break;
  }
  return sql.slice(cursor).trim();
}
