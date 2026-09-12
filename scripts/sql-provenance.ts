export type SqlTokenKind =
  | "word"
  | "number"
  | "single_quoted"
  | "quoted_identifier"
  | "dollar_quoted"
  | "parameter"
  | "operator"
  | "punctuation";

export type SqlToken = {
  kind: SqlTokenKind;
  value: string;
};

export type SqlComparison = {
  equivalent: boolean;
  gitStatementCount: number;
  remoteStatementCount: number;
  matchedStatementCount: number;
  firstMismatch: null | {
    statement: number;
    gitTokenCount: number | null;
    remoteTokenCount: number | null;
    firstToken: null | {
      position: number;
      gitKind: SqlTokenKind | null;
      remoteKind: SqlTokenKind | null;
    };
  };
};

const WORD_START = /[A-Za-z_\u0080-\uFFFF]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-\uFFFF]/;
const OPERATOR = /[+\-*\/<>=~!@#%^&|`?]/;

function dollarTagAt(sql: string, offset: number): string | null {
  return sql.slice(offset).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0] ?? null;
}

function isEscapeStringPrefix(sql: string, quoteOffset: number): boolean {
  if (quoteOffset === 0 || !/[eE]/.test(sql[quoteOffset - 1])) return false;
  return quoteOffset === 1 || !WORD_PART.test(sql[quoteOffset - 2]);
}

function consumeSingleQuoted(
  sql: string,
  offset: number,
  escapeBackslash = isEscapeStringPrefix(sql, offset),
): number {
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

function consumeDoubleQuoted(sql: string, offset: number): number {
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

function consumeDollarQuoted(sql: string, offset: number, tag: string): number {
  const end = sql.indexOf(tag, offset + tag.length);
  if (end < 0) throw new SyntaxError(`Unterminated dollar-quoted SQL value at offset ${offset}`);
  return end + tag.length;
}

function consumeBlockComment(sql: string, offset: number): number {
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

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let cursor = 0;

  while (cursor < sql.length) {
    const character = sql[cursor];
    const next = sql[cursor + 1];

    if (/\s/.test(character)) {
      cursor += 1;
      continue;
    }
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
      const end = consumeSingleQuoted(sql, cursor);
      tokens.push({ kind: "single_quoted", value: sql.slice(cursor, end) });
      cursor = end;
      continue;
    }
    if (character === '"') {
      const end = consumeDoubleQuoted(sql, cursor);
      tokens.push({ kind: "quoted_identifier", value: sql.slice(cursor, end) });
      cursor = end;
      continue;
    }
    if (character === "$") {
      const tag = dollarTagAt(sql, cursor);
      if (tag) {
        const end = consumeDollarQuoted(sql, cursor, tag);
        tokens.push({ kind: "dollar_quoted", value: sql.slice(cursor, end) });
        cursor = end;
        continue;
      }
      const parameter = sql.slice(cursor).match(/^\$[0-9]+/)?.[0];
      if (parameter) {
        tokens.push({ kind: "parameter", value: parameter });
        cursor += parameter.length;
        continue;
      }
    }
    const stringPrefix = sql.slice(cursor).match(/^(?:[eEbBxXnN]|[uU]&)'/)?.[0];
    if (stringPrefix) {
      const quoteOffset = cursor + stringPrefix.length - 1;
      const end = consumeSingleQuoted(sql, quoteOffset, /^[eE]/.test(stringPrefix));
      tokens.push({
        kind: "single_quoted",
        value: stringPrefix.slice(0, -1).toLowerCase() + sql.slice(quoteOffset, end),
      });
      cursor = end;
      continue;
    }
    const identifierPrefix = sql.slice(cursor).match(/^[uU]&"/)?.[0];
    if (identifierPrefix) {
      const quoteOffset = cursor + identifierPrefix.length - 1;
      const end = consumeDoubleQuoted(sql, quoteOffset);
      tokens.push({
        kind: "quoted_identifier",
        value: identifierPrefix.slice(0, -1).toLowerCase() + sql.slice(quoteOffset, end),
      });
      cursor = end;
      continue;
    }
    if (WORD_START.test(character)) {
      const start = cursor;
      cursor += 1;
      while (cursor < sql.length && WORD_PART.test(sql[cursor])) cursor += 1;
      tokens.push({ kind: "word", value: sql.slice(start, cursor).toLowerCase() });
      continue;
    }
    if (/[0-9]/.test(character)) {
      const start = cursor;
      cursor += 1;
      while (cursor < sql.length && /[0-9A-Za-z_.]/.test(sql[cursor])) cursor += 1;
      tokens.push({ kind: "number", value: sql.slice(start, cursor).toLowerCase() });
      continue;
    }
    if (OPERATOR.test(character)) {
      const start = cursor;
      cursor += 1;
      while (cursor < sql.length && OPERATOR.test(sql[cursor])) cursor += 1;
      tokens.push({ kind: "operator", value: sql.slice(start, cursor) });
      continue;
    }

    tokens.push({ kind: "punctuation", value: character });
    cursor += 1;
  }

  return tokens;
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let cursor = 0;
  let start = 0;

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
      cursor = consumeSingleQuoted(sql, cursor);
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
  return statements.filter((statement) => tokenizeSql(statement).length > 0);
}

function tokenListsEqual(left: SqlToken[], right: SqlToken[]): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (token, index) => token.kind === right[index].kind && token.value === right[index].value,
  );
}

export function compareSqlSources(
  gitSql: string,
  remoteStatementGroups: readonly string[],
): SqlComparison {
  const gitStatements = splitSqlStatements(gitSql).map(tokenizeSql);
  const remoteStatements = remoteStatementGroups.flatMap((group) =>
    splitSqlStatements(group).map(tokenizeSql),
  );
  const statementCount = Math.max(gitStatements.length, remoteStatements.length);
  let matchedStatementCount = 0;
  let firstMismatch: SqlComparison["firstMismatch"] = null;

  for (let statementIndex = 0; statementIndex < statementCount; statementIndex += 1) {
    const gitTokens = gitStatements[statementIndex];
    const remoteTokens = remoteStatements[statementIndex];

    if (gitTokens && remoteTokens && tokenListsEqual(gitTokens, remoteTokens)) {
      matchedStatementCount += 1;
      continue;
    }
    if (firstMismatch) continue;

    let firstToken: NonNullable<SqlComparison["firstMismatch"]>["firstToken"] = null;
    if (gitTokens && remoteTokens) {
      const tokenCount = Math.max(gitTokens.length, remoteTokens.length);
      for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex += 1) {
        const gitToken = gitTokens[tokenIndex];
        const remoteToken = remoteTokens[tokenIndex];
        if (
          !gitToken ||
          !remoteToken ||
          gitToken.kind !== remoteToken.kind ||
          gitToken.value !== remoteToken.value
        ) {
          firstToken = {
            position: tokenIndex + 1,
            gitKind: gitToken?.kind ?? null,
            remoteKind: remoteToken?.kind ?? null,
          };
          break;
        }
      }
    }

    firstMismatch = {
      statement: statementIndex + 1,
      gitTokenCount: gitTokens?.length ?? null,
      remoteTokenCount: remoteTokens?.length ?? null,
      firstToken,
    };
  }

  return {
    equivalent:
      gitStatements.length === remoteStatements.length &&
      matchedStatementCount === gitStatements.length,
    gitStatementCount: gitStatements.length,
    remoteStatementCount: remoteStatements.length,
    matchedStatementCount,
    firstMismatch,
  };
}
