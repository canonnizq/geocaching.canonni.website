/** An entry in the tools menu at /tools. */
export interface ToolMetadata {
  slug: string;
  name: string;
  summary: string;
  path: string;
}

/** One leg of a multi-cache, as read from the cache description. */
export interface MultiCacheStep {
  /** 1-based position in the description. */
  index: number;
  /** Short tag the description gives the step, e.g. "Stage 1" or "Bamboo". */
  label: string;
  /** Longer name when the step has its own heading line, e.g. "Zaoyang Park". */
  title: string | null;
  /** Variable this step supplies to the formula, e.g. "B". */
  letter: string;
  /** The step's prose, without the sentence that names the variable. */
  description: string;
  /** What to collect, e.g. "number of individual pieces, brown or green". */
  valueHint: string;
}

/** One of the final-coordinate expressions, e.g. "N31°11.((D-A)(A+B+C)+DEF+D+G)". */
export interface CoordinateExpression {
  /** "N", "S", "E" or "W". */
  hemisphere: string;
  /** Degrees as written, e.g. "31". */
  degrees: string;
  /** Whole minutes: digits ("11"), or an expression such as "(D+E+4)". */
  minutes: string;
  /** Arithmetic producing the three decimal digits after the point. */
  expression: string;
}

export interface ParsedMultiCache {
  steps: MultiCacheStep[];
  expressions: CoordinateExpression[];
}

/** How far a single coordinate got towards being solvable. */
export type CoordinateStatus = 'incomplete' | 'invalid' | 'out-of-range' | 'ready';

export interface CoordinateSolution {
  hemisphere: string;
  degrees: string;
  status: CoordinateStatus;
  /** What to show the user. */
  display: string;
  value?: number | null;
  /** Why a coordinate is not ready, when it isn't. */
  detail?: string;
  /** Letters this coordinate is still waiting on. */
  missing?: string[];
}
