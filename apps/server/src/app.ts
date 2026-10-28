import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import type { ServerConfig } from './config.js';
import { AppError } from './errors.js';
import {
  admissionDecisionSchema,
  createRoomSchema,
  createQuestionSchema,
  moderationActionSchema,
  participantParamsSchema,
  questionActionSchema,
  questionParamsSchema,
  reorderQuestionsSchema,
  roomParamsSchema,
  tokenRequestSchema,
  updateQuestionSchema,
} from './schemas.js';
import { LiveKitRoomService, type RoomService } from './services/roomManagement.js';
import { createQuestionStore, type QuestionStore } from './services/questionStore.js';
import { QuestionService } from './services/questions.js';
import { SessionCredentialService } from './services/sessionCredentials.js';
import { LiveKitTokenIssuer, type TokenIssuer } from './services/tokenService.js';

interface BuildAppOptions {
  config: ServerConfig;
  tokenIssuer?: TokenIssuer;
  roomService?: RoomService;
  credentialService?: SessionCredentialService;
  questionStore?: QuestionStore;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions) {
  const { config } = options;
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers.set-cookie',
                '*.participantToken',
              ],
              censor: '[REDACTED]',
            },
          },
    requestIdHeader: 'x-request-id',
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.webOrigins.includes(origin)) callback(null, true);
      else callback(new AppError('Origem não permitida.', 403, 'ORIGIN_NOT_ALLOWED'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
  });

  const credentialService =
    options.credentialService ?? new SessionCredentialService(config.livekitApiSecret);
  const roomService = options.roomService ?? new LiveKitRoomService(config, credentialService);
  const tokenIssuer =
    options.tokenIssuer ?? new LiveKitTokenIssuer(config, roomService, credentialService);
  const questionStore = options.questionStore ?? createQuestionStore(config);
  const questionService = new QuestionService(questionStore, roomService, credentialService);

  app.addHook('onClose', async () => questionStore.close());

  app.get('/api/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/api/config', () => ({
    livekitUrl: config.livekitUrl,
    livekitConfigured: config.livekitConfigured,
    meetingMode: config.meetingMode,
    maxParticipants: config.maxParticipants,
    advancedNoiseFilterEnabled: config.advancedNoiseFilterEnabled,
  }));

  app.post(
    '/api/rooms',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      if (!config.livekitConfigured) {
        throw new AppError('LiveKit não está configurado.', 503, 'LIVEKIT_NOT_CONFIGURED');
      }
      const { approvalRequired } = createRoomSchema.parse(request.body);
      const created = credentialService.createRoom(approvalRequired);
      await roomService.initializeRoom(created.roomName, approvalRequired);
      return reply.header('Cache-Control', 'no-store').send(created);
    },
  );

  app.get('/api/rooms/:roomName/questions/active', async (request, reply) => {
    const { roomName } = roomParamsSchema.parse(request.params);
    const result = await questionService.getActive(
      roomName,
      extractBearer(request.headers.authorization),
    );
    return reply.header('Cache-Control', 'no-store').send(result);
  });

  app.get('/api/rooms/:roomName/questions', async (request, reply) => {
    const { roomName } = roomParamsSchema.parse(request.params);
    const result = await questionService.list(
      roomName,
      extractBearer(request.headers.authorization),
    );
    return reply.header('Cache-Control', 'no-store').send(result);
  });

  app.post(
    '/api/rooms/:roomName/questions',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { roomName } = roomParamsSchema.parse(request.params);
      const input = createQuestionSchema.parse(request.body);
      const result = await questionService.create(
        roomName,
        input,
        extractBearer(request.headers.authorization),
      );
      return reply.status(201).header('Cache-Control', 'no-store').send(result);
    },
  );

  app.patch(
    '/api/rooms/:roomName/questions/:questionId',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { roomName, questionId } = questionParamsSchema.parse(request.params);
      const input = updateQuestionSchema.parse(request.body);
      const result = await questionService.update(
        roomName,
        questionId,
        input,
        extractBearer(request.headers.authorization),
      );
      return reply.header('Cache-Control', 'no-store').send(result);
    },
  );

  app.post(
    '/api/rooms/:roomName/questions/:questionId/actions',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { roomName, questionId } = questionParamsSchema.parse(request.params);
      const input = questionActionSchema.parse(request.body);
      const result = await questionService.action(
        roomName,
        questionId,
        input,
        extractBearer(request.headers.authorization),
      );
      return reply.header('Cache-Control', 'no-store').send(result);
    },
  );

  app.put(
    '/api/rooms/:roomName/questions/order',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { roomName } = roomParamsSchema.parse(request.params);
      const input = reorderQuestionsSchema.parse(request.body);
      const result = await questionService.reorder(
        roomName,
        input,
        extractBearer(request.headers.authorization),
      );
      return reply.header('Cache-Control', 'no-store').send(result);
    },
  );

  app.get('/api/rooms/:roomName/status', async (request, reply) => {
    const { roomName } = roomParamsSchema.parse(request.params);
    const status = await roomService.getStatus(roomName);
    return reply.header('Cache-Control', 'no-store').send(status);
  });

  app.get('/api/rooms/:roomName/admissions', async (request, reply) => {
    const { roomName } = roomParamsSchema.parse(request.params);
    const result = await roomService.getAdmissions(
      roomName,
      extractBearer(request.headers.authorization),
    );
    return reply.header('Cache-Control', 'no-store').send(result);
  });

  app.post(
    '/api/rooms/:roomName/admissions/:participantIdentity',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { roomName, participantIdentity } = participantParamsSchema.parse(request.params);
      const { decision } = admissionDecisionSchema.parse(request.body);
      await roomService.decideAdmission(
        roomName,
        participantIdentity,
        decision,
        extractBearer(request.headers.authorization),
      );
      return reply.header('Cache-Control', 'no-store').send({ decision, participantIdentity });
    },
  );

  app.post(
    '/api/rooms/:roomName/participants/:participantIdentity/actions',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { roomName, participantIdentity } = participantParamsSchema.parse(request.params);
      const { action } = moderationActionSchema.parse(request.body);
      const resumeCredential = extractBearer(request.headers.authorization);
      const result = await roomService.moderate(
        roomName,
        participantIdentity,
        action,
        resumeCredential,
      );
      request.log.info(
        { roomName, participantIdentity, action },
        'Participant moderation action completed',
      );
      return reply.header('Cache-Control', 'no-store').send(result);
    },
  );

  app.post(
    '/api/token',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const payload = tokenRequestSchema.parse(request.body);
      const response = await tokenIssuer.issue(payload);
      request.log.info(
        { roomName: payload.roomName, participantIdentity: payload.participantIdentity },
        'LiveKit join token issued',
      );
      return reply.header('Cache-Control', 'no-store').send(response);
    },
  );

  app.setNotFoundHandler(async (_request, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }),
  );

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Os dados enviados são inválidos.',
          fields: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }
    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    }

    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    request.log.error({ err: error }, 'Request failed');
    return reply.status(statusCode).send({
      error: {
        code: statusCode === 429 ? 'RATE_LIMITED' : 'INTERNAL_ERROR',
        message:
          statusCode === 429
            ? 'Muitas solicitações. Aguarde um momento.'
            : 'O servidor não conseguiu concluir a solicitação.',
      },
    });
  });

  return app;
}

function extractBearer(authorization: string | undefined) {
  return authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
}
