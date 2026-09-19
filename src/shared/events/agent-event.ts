import { z } from 'zod';

export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('analyzing'), message: z.string().optional() }),
  z.object({ type: z.literal('editing'), message: z.string().optional() }),
  z.object({ type: z.literal('testing'), message: z.string().optional() }),
  z.object({ type: z.literal('saving-version') }),
  z.object({ type: z.literal('starting-app') }),
  z.object({ type: z.literal('completed'), summary: z.string() }),
  z.object({ type: z.literal('failed'), message: z.string() }),
  z.object({ type: z.literal('raw'), stream: z.enum(['stdout', 'stderr']), data: z.string() }),
]);
export type AgentEvent = z.infer<typeof AgentEventSchema>;
