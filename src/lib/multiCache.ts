import { evaluateExpression, variablesIn } from './expression';
import type {
  CoordinateExpression,
  CoordinateSolution,
  MultiCacheStep,
  ParsedMultiCache,
} from '../types/tool';

/**
 * Pulls a workable multi-cache out of a cache's description.
 *
 * Owners write these by hand, so what follows are conventions rather than a
 * spec. Two layouts turn up in practice and both are handled here:
 *
 *   Announcement: ... prose ... A is the sum of      <- label and prose in one
 *   digits in its code.                                 paragraph, variable first
 *
 *   Stage 2: Tongbai Road Bridge                     <- heading line, with the
 *                                                       prose in the next one
 *   Originally Meiyuan Bridge, ... is B.                and the variable last
 *
 * Coordinates vary too:
 *
 *   N31°11.((D-A)(A+B+C)+DEF+D+G)    whole minutes, arithmetic after the point
 *   E 121° (D+E+4).(B-C)(B+C+D+E)    an expression for the minutes themselves
 *
 * Anything that does not match is left alone, so a description that only partly
 * follows the convention still yields whatever could be read from it.
 */

/** A paragraph opening with a short label, e.g. "Stage 2: Tongbai Road Bridge". */
const LABELLED = /^([A-Z][A-Za-z0-9 '-]{0,24}):\s*([\s\S]+)$/;

/** "A is the sum of digits in its code." — the variable leads. */
const VARIABLE_FIRST = /\b([A-Z])\s+is\s+(?:the\s+)?([^.]*?)\./;

/** "The year inscribed on the bridge fence is A." — the variable trails. */
const VARIABLE_LAST = /\b([^.]*?)\bis\s+([A-Z])\s*\./g;

/** "N31°11.(...)" or "E 121° (D+E+4).(...)", possibly several per paragraph. */
const COORDINATE =
  /([NSEW])\s*(\d{1,3})\s*[°º]\s*(.+?)\.\s*(.+?)(?=\s+[NSEW]\s*\d{1,3}\s*[°º]|\s*$)/g;

/** A heading line is short; prose that happens to contain a colon is not. */
const MAX_HEADING_LENGTH = 120;

function paragraphsOf(description: string): string[] {
  return description
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph !== '');
}

function coordinatesIn(paragraph: string): CoordinateExpression[] {
  return [...paragraph.matchAll(COORDINATE)].map((match) => ({
    hemisphere: match[1].toUpperCase(),
    degrees: match[2],
    minutes: match[3].trim(),
    expression: match[4].trim(),
  }));
}

interface Assignment {
  letter: string;
  hint: string;
  /** Range covering the sentence that named the variable. */
  start: number;
  end: number;
}

/** Hints read as labelled fragments, so drop the article and capitalise. */
function normaliseHint(hint: string): string {
  const trimmed = hint.replace(/^the\s+/i, '').replace(/\s+/g, ' ').trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function findAssignment(text: string): Assignment | null {
  const leading = VARIABLE_FIRST.exec(text);
  if (leading?.index !== undefined) {
    return {
      letter: leading[1],
      hint: normaliseHint(leading[2]),
      start: leading.index,
      end: leading.index + leading[0].length,
    };
  }

  // Take the last trailing match: the variable is named in the final sentence,
  // so an earlier "... is unknown." must not win.
  const trailing = [...text.matchAll(VARIABLE_LAST)];
  if (trailing.length === 0) return null;

  const last = trailing[trailing.length - 1];
  const start = last.index ?? 0;

  return {
    letter: last[2],
    hint: normaliseHint(last[1]),
    start,
    end: start + last[0].length,
  };
}

/** Drops the sentence naming the variable, since it becomes the input hint. */
function proseWithoutAssignment(text: string, assignment: Assignment): string {
  const prose = `${text.slice(0, assignment.start)} ${text.slice(assignment.end)}`;
  return prose.replace(/\s{2,}/g, ' ').trim();
}

export function parseMultiCache(description: string): ParsedMultiCache {
  const paragraphs = paragraphsOf(description);
  const steps: MultiCacheStep[] = [];
  const expressions: CoordinateExpression[] = [];
  const consumed = new Set<number>();

  const addStep = (label: string, title: string | null, text: string): boolean => {
    const assignment = findAssignment(text);
    if (!assignment) return false;

    steps.push({
      index: steps.length + 1,
      label,
      title,
      letter: assignment.letter,
      description: proseWithoutAssignment(text, assignment),
      valueHint: assignment.hint,
    });

    return true;
  };

  for (let index = 0; index < paragraphs.length; index += 1) {
    if (consumed.has(index)) continue;

    const paragraph = paragraphs[index];

    const coordinates = coordinatesIn(paragraph);
    if (coordinates.length > 0) {
      expressions.push(...coordinates);
      continue;
    }

    const labelled = LABELLED.exec(paragraph);

    // Label and prose together: "Bamboo: ... B is the number of pieces."
    if (labelled && addStep(labelled[1].trim(), null, paragraph)) continue;

    // Heading line: "Stage 2: Tongbai Road Bridge", with the prose following.
    const next = paragraphs[index + 1];
    const isHeading =
      labelled !== null &&
      paragraph.length <= MAX_HEADING_LENGTH &&
      labelled[2].length <= MAX_HEADING_LENGTH;

    if (isHeading && next !== undefined && coordinatesIn(next).length === 0) {
      if (addStep(labelled[1].trim(), labelled[2].trim(), next)) {
        consumed.add(index + 1);
      }
    }
  }

  return { steps, expressions };
}

function lettersOfCoordinate(coordinate: CoordinateExpression): string[] {
  return [...new Set([...variablesIn(coordinate.minutes), ...variablesIn(coordinate.expression)])];
}

/** Letters the formulas need that no step supplies, so they can be flagged. */
export function lettersWithoutStep(parsed: ParsedMultiCache): string[] {
  const fromSteps = new Set(parsed.steps.map((step) => step.letter));
  const fromExpressions = parsed.expressions.flatMap(lettersOfCoordinate);

  return [...new Set(fromExpressions)].filter((letter) => !fromSteps.has(letter));
}

/** Everything the formulas need, steps first, then any letter no step covers. */
export function requiredLetters(parsed: ParsedMultiCache): string[] {
  const fromSteps = parsed.steps.map((step) => step.letter);
  return [...new Set([...fromSteps, ...lettersWithoutStep(parsed)])];
}

function toValues(values: Record<string, string>): Record<string, number> {
  const numeric: Record<string, number> = {};

  for (const [letter, raw] of Object.entries(values)) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) numeric[letter] = parsed;
  }

  return numeric;
}

/** The decimal part of the minutes is always written with three digits. */
export function formatMinutes(value: number): string {
  return String(value).padStart(3, '0');
}

function describeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function failureDetail(error: string): string {
  if (error === 'division-by-zero') return 'Division by zero — check the values you entered.';
  if (error === 'unbalanced-parentheses') return 'The formula has unbalanced brackets.';
  return `The formula could not be evaluated (${error}).`;
}

/**
 * Placeholder for a coordinate whose minutes are settled but whose last three
 * digits are not: keeps the minutes visible while the "?" marks them unusable.
 */
function withBlankFraction(base: { hemisphere: string; degrees: string }, minutes: number): string {
  return `${base.hemisphere}${base.degrees}°${String(minutes).padStart(2, '0')}.?`;
}

export function solveCoordinate(
  coordinate: CoordinateExpression,
  values: Record<string, string>,
): CoordinateSolution {
  const numeric = toValues(values);
  const missing = lettersOfCoordinate(coordinate).filter(
    (letter) => numeric[letter] === undefined,
  );

  const base = {
    hemisphere: coordinate.hemisphere,
    degrees: coordinate.degrees,
  };

  if (missing.length > 0) {
    return {
      ...base,
      status: 'incomplete',
      // Show the formula as written, so it is clear what is still to come.
      display: `${coordinate.hemisphere}${coordinate.degrees}°${coordinate.minutes}.${coordinate.expression}`,
      missing,
    };
  }

  const minutes = evaluateExpression(coordinate.minutes, numeric);
  if (!minutes.ok) {
    return { ...base, status: 'invalid', display: `${base.hemisphere}${base.degrees}°?`, value: null, detail: failureDetail(minutes.error) };
  }

  if (!Number.isInteger(minutes.value) || minutes.value < 0 || minutes.value > 59) {
    return {
      ...base,
      status: 'out-of-range',
      display: `${base.hemisphere}${base.degrees}°?`,
      value: minutes.value,
      detail: `The minutes work out to ${describeNumber(minutes.value)}, which is not a whole number of minutes from 00 to 59.`,
    };
  }

  const fraction = evaluateExpression(coordinate.expression, numeric);
  if (!fraction.ok) {
    return { ...base, status: 'invalid', display: withBlankFraction(base, minutes.value), value: null, detail: failureDetail(fraction.error) };
  }

  if (!Number.isInteger(fraction.value) || fraction.value < 0 || fraction.value > 999) {
    return {
      ...base,
      status: 'out-of-range',
      // Never print something that would read as a valid coordinate when it isn't.
      display: withBlankFraction(base, minutes.value),
      value: fraction.value,
      detail: `The decimal part works out to ${describeNumber(fraction.value)}, which is not a whole number from 000 to 999.`,
    };
  }

  return {
    ...base,
    status: 'ready',
    display: `${base.hemisphere}${base.degrees}°${String(minutes.value).padStart(2, '0')}.${formatMinutes(fraction.value)}`,
    value: fraction.value,
  };
}

/** Solves every coordinate in the cache, and reports the letters still needed. */
export function solveMultiCache(
  parsed: ParsedMultiCache,
  values: Record<string, string>,
): { solutions: CoordinateSolution[]; missing: string[]; ready: boolean } {
  const solutions = parsed.expressions.map((coordinate) => solveCoordinate(coordinate, values));
  const numeric = toValues(values);
  const missing = requiredLetters(parsed).filter((letter) => numeric[letter] === undefined);

  return {
    solutions,
    missing,
    ready: missing.length === 0 && solutions.every((solution) => solution.status === 'ready'),
  };
}
