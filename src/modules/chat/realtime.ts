import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { corsOriginOption, corsOrigins } from '../../config.js';
import { prisma } from '../../db/prisma.js';
import { verifyChatSocketToken } from './token.js';

type SocketData = {
  role: 'visitor' | 'user' | 'admin';
  visitorId?: string;
  userId?: string;
};

let io: Server | null = null;
const teamSockets = new Set<string>();

export function isTeamOnline(): boolean {
  return teamSockets.size > 0;
}

export function conversationRoom(id: string): string {
  return `conversation:${id}`;
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}

export function emitToTeam(event: string, payload: unknown): void {
  io?.to('team').emit(event, payload);
}

export function broadcastPresence(): void {
  const payload = { teamOnline: isTeamOnline() };
  io?.emit('presence:update', payload);
}

async function canJoinConversation(socketData: SocketData, conversationId: string): Promise<boolean> {
  if (socketData.role === 'admin') {
    return true;
  }
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    select: { visitorId: true, userId: true },
  });
  if (!conversation) {
    return false;
  }
  if (socketData.userId && conversation.userId === socketData.userId) {
    return true;
  }
  if (socketData.visitorId && conversation.visitorId === socketData.visitorId) {
    return true;
  }
  return false;
}

export function attachChatRealtime(app: FastifyInstance): Server {
  io = new Server(app.server, {
    path: '/socket.io',
    cors: {
      origin: corsOriginOption === true ? true : corsOrigins,
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const claims = verifyChatSocketToken(token);
    if (!claims) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    socket.data = {
      role: claims.role,
      visitorId: claims.visitorId,
      userId: claims.userId,
    } satisfies SocketData;
    next();
  });

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;
    if (data.role === 'admin') {
      socket.join('team');
      teamSockets.add(socket.id);
      broadcastPresence();
    }

    socket.on('conversation:join', async (conversationId: unknown, ack?: (result: { ok: boolean }) => void) => {
      if (typeof conversationId !== 'string') {
        ack?.({ ok: false });
        return;
      }
      const allowed = await canJoinConversation(data, conversationId);
      if (!allowed) {
        ack?.({ ok: false });
        return;
      }
      await socket.join(conversationRoom(conversationId));
      ack?.({ ok: true });
    });

    socket.on('conversation:leave', async (conversationId: unknown) => {
      if (typeof conversationId === 'string') {
        await socket.leave(conversationRoom(conversationId));
      }
    });

    socket.on('typing:start', async (conversationId: unknown) => {
      if (typeof conversationId !== 'string') return;
      if (!(await canJoinConversation(data, conversationId))) return;
      socket.to(conversationRoom(conversationId)).emit('typing:start', {
        conversationId,
        role: data.role === 'admin' ? 'team' : 'visitor',
      });
    });

    socket.on('typing:stop', async (conversationId: unknown) => {
      if (typeof conversationId !== 'string') return;
      if (!(await canJoinConversation(data, conversationId))) return;
      socket.to(conversationRoom(conversationId)).emit('typing:stop', {
        conversationId,
        role: data.role === 'admin' ? 'team' : 'visitor',
      });
    });

    socket.on('disconnect', () => {
      if (teamSockets.delete(socket.id)) {
        broadcastPresence();
      }
    });
  });

  return io;
}

export function getChatIo(): Server | null {
  return io;
}
