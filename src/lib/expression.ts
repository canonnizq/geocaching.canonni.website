/**
 * A small arithmetic evaluator for the expressions multi-cache formulas use.
 *
 * Cache formulas are written the way a person would write them, not the way a
 * programming language parses them: `(D-A)(A+B+C)` and `DEF` both mean
 * multiplication by juxtaposition. This handles that, and deliberately does not
 * use `eval`, since the expression comes from a third-party cache description.
 */

export type ExpressionFailure =
  | 'empty'
  | 'unknown-token'
  | 'unbalanced-parentheses'
  | 'unexpected-end'
  | 'division-by-zero'
  | 'missing-value'
  | 'not-a-number';

export type ExpressionResult =
  | { ok: true; value: number }
  | { ok: false; error: ExpressionFailure; detail?: string };

const VARIABLE = /[A-Z]/;

type Token =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'paren'; value: '(' | ')' };

class ExpressionError extends Error {
  readonly failure: ExpressionFailure;
  readonly detail: string | undefined;

  constructor(failure: ExpressionFailure, detail?: string) {
    super(detail ? `${failure}: ${detail}` : failure);
    this.failure = failure;
    this.detail = detail;
  }
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const character = input[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    const number = /^\d+(?:\.\d+)?/.exec(input.slice(index));
    if (number) {
      tokens.push({ type: 'number', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }

    if (VARIABLE.test(character)) {
      tokens.push({ type: 'variable', name: character });
      index += 1;
      continue;
    }

    if (character === '+' || character === '-' || character === '*' || character === '/') {
      tokens.push({ type: 'operator', value: character });
      index += 1;
      continue;
    }

    if (character === '(' || character === ')') {
      tokens.push({ type: 'paren', value: character });
      index += 1;
      continue;
    }

    return null;
  }

  return tokens;
}

function isValueEnd(token: Token | undefined): boolean {
  if (!token) return false;
  return (
    token.type === 'number' ||
    token.type === 'variable' ||
    (token.type === 'paren' && token.value === ')')
  );
}

function isValueStart(token: Token): boolean {
  return (
    token.type === 'number' ||
    token.type === 'variable' ||
    (token.type === 'paren' && token.value === '(')
  );
}

/** Makes juxtaposition explicit: `DEF` and `(A)(B)` become `D*E*F` and `(A)*(B)`. */
function withImplicitMultiplication(tokens: Token[]): Token[] {
  const result: Token[] = [];

  for (const token of tokens) {
    if (isValueEnd(result.at(-1)) && isValueStart(token)) {
      result.push({ type: 'operator', value: '*' });
    }
    result.push(token);
  }

  return result;
}

interface Cursor {
  tokens: Token[];
  index: number;
  values: Record<string, number>;
}

function parseSum(state: Cursor): number {
  let value = parseProduct(state);

  for (;;) {
    const token = state.tokens[state.index];
    if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) break;

    state.index += 1;
    const right = parseProduct(state);
    value = token.value === '+' ? value + right : value - right;
  }

  return value;
}

function parseProduct(state: Cursor): number {
  let value = parseUnary(state);

  for (;;) {
    const token = state.tokens[state.index];
    if (token?.type !== 'operator' || (token.value !== '*' && token.value !== '/')) break;

    state.index += 1;
    const right = parseUnary(state);

    if (token.value === '/') {
      if (right === 0) throw new ExpressionError('division-by-zero');
      value /= right;
    } else {
      value *= right;
    }
  }

  return value;
}

function parseUnary(state: Cursor): number {
  const token = state.tokens[state.index];

  if (token?.type === 'operator' && (token.value === '-' || token.value === '+')) {
    state.index += 1;
    const value = parseUnary(state);
    return token.value === '-' ? -value : value;
  }

  return parsePrimary(state);
}

function parsePrimary(state: Cursor): number {
  const token = state.tokens[state.index];
  if (!token) throw new ExpressionError('unexpected-end');

  if (token.type === 'number') {
    state.index += 1;
    return token.value;
  }

  if (token.type === 'variable') {
    state.index += 1;
    const value = state.values[token.name];
    if (value === undefined) throw new ExpressionError('missing-value', token.name);
    return value;
  }

  if (token.type === 'paren' && token.value === '(') {
    state.index += 1;
    const value = parseSum(state);

    const closing = state.tokens[state.index];
    if (closing?.type !== 'paren' || closing.value !== ')') {
      throw new ExpressionError('unbalanced-parentheses');
    }

    state.index += 1;
    return value;
  }

  throw new ExpressionError('unknown-token');
}

/** Evaluates `expression` with the given variable values. Never throws. */
export function evaluateExpression(
  expression: string,
  values: Record<string, number>,
): ExpressionResult {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return { ok: false, error: 'empty' };

  const state: Cursor = { tokens: withImplicitMultiplication(tokens), index: 0, values };

  try {
    const value = parseSum(state);
    if (state.index !== state.tokens.length) return { ok: false, error: 'unknown-token' };
    if (!Number.isFinite(value)) return { ok: false, error: 'not-a-number' };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof ExpressionError) {
      return { ok: false, error: error.failure, detail: error.detail };
    }
    throw error;
  }
}

/** Variables an expression needs, in the order they first appear. */
export function variablesIn(expression: string): string[] {
  return [...new Set([...expression].filter((character) => VARIABLE.test(character)))];
}
