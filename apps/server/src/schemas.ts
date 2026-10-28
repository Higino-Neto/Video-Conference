import { z } from 'zod';

const safeDisplayName = /^[\p{L}\p{N} ._'-]+$/u;
const safeIdentifier = /^[A-Za-z0-9_-]+$/;

export const tokenRequestSchema = z.object({
  roomName: z.string().trim().min(4).max(64).regex(safeIdentifier),
  participantName: z.string().trim().min(1).max(60).regex(safeDisplayName),
  participantIdentity: z.string().trim().min(8).max(128).regex(safeIdentifier),
  ownerCredential: z.string().trim().min(32).max(2_048).optional(),
  resumeCredential: z.string().trim().min(32).max(2_048).optional(),
});

export const roomParamsSchema = z.object({
  roomName: z.string().trim().min(4).max(64).regex(safeIdentifier),
});

export const participantParamsSchema = roomParamsSchema.extend({
  participantIdentity: z.string().trim().min(8).max(128).regex(safeIdentifier),
});

export const moderationActionSchema = z.object({
  action: z.enum(['mute_microphone', 'disable_camera', 'remove', 'ban', 'promote']),
});

export const createRoomSchema = z
  .object({
    approvalRequired: z.boolean().default(false),
  })
  .default({ approvalRequired: false });

export const admissionDecisionSchema = z.object({
  decision: z.enum(['approve', 'deny']),
});

const questionText = z.string().trim().min(1).max(500);
const questionAuthor = z.string().trim().min(1).max(60).regex(safeDisplayName);
const expectedRevision = z.number().int().min(0);

export const questionParamsSchema = roomParamsSchema.extend({
  questionId: z.string().uuid(),
});

export const createQuestionSchema = z.object({
  authorName: questionAuthor,
  authorIdentity: z.string().trim().min(8).max(128).regex(safeIdentifier).optional(),
  text: questionText,
  expectedRevision,
});

export const updateQuestionSchema = z.object({
  authorName: questionAuthor,
  authorIdentity: z.string().trim().min(8).max(128).regex(safeIdentifier).nullable().optional(),
  text: questionText,
  expectedRevision,
});

export const questionActionSchema = z.object({
  action: z.enum(['show', 'answer', 'requeue', 'archive']),
  expectedRevision,
});

export const reorderQuestionsSchema = z.object({
  questionIds: z
    .array(z.string().uuid())
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'A ordem não pode conter perguntas repetidas.',
    }),
  expectedRevision,
});

export type ValidTokenRequest = z.infer<typeof tokenRequestSchema>;
