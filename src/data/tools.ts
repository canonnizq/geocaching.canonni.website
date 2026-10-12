import type { ToolMetadata } from '../types/tool';

/** Everything listed in the tools menu. Add one entry per tool. */
export const TOOLS: ToolMetadata[] = [
  {
    slug: 'multiply',
    name: 'MultiPly',
    summary: 'Calculator for everyone\'s favorite orange nightmares.',
    path: '/tools/multiply',
  },
];

export function getTool(slug: string): ToolMetadata | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
