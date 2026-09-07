import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { corsOrigins } from '../../config.js';
import { verifyChatToken } from './token.js';

const TEAM_CHANNEL = 'ai-trainers-team-presence';
const teamSockets = new Set<string>();
let io: Server | null = null;

export function isTeamOnline() {
  return teamSockets.size > 0;
}

export function emitChatEvent(room: string, event: string, payload: unknown) {
  if (!io) return;
  const target = room === 'team' ? 'team' : `conversation:${room}`;
  io.to(target).emit(event, payload);
  if (room !== 'team') {
    io.to('team').emit(event, payload);
  }
}

export function emitPresence() {
  io?.emit('presence:update', { teamOnline: isTeamOnline() });
}

function conversationRoom(id: string) {
  return `conversation:${id}`;
}

export function attachChatRealtime(app: FastifyInstance) {
  io = new Server(app.server, {
    path: '/socket.io',
    cors: {
      origin: corsOrigins.includes('*') ? true : corsOrigins,
      credentials: true,
    },
    transports: ['polling', 'websocket'],
  });

  io.use((socket, next) => {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const payload = verifyChatToken(token);
    if (!payload) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.auth = payload;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const auth = socket.data.auth as ReturnType<typeof verifyChatToken>;
    if (auth?.role === 'admin') {
      teamSockets.add(socket.id);
      socket.join('team');
      emitPresence();
    }

    socket.on('presence:join', (channel: string) => {
      if (channel === TEAM_CHANNEL && auth?.role === 'admin') {
        teamSockets.add(socket.id);
        socket.join('team');
        emitPresence();
      }
    });

    socket.on('presence:leave', (channel: string) => {
      if (channel === TEAM_CHANNEL && auth?.role === 'admin') {
        teamSockets.delete(socket.id);
        socket.leave('team');
        emitPresence();
      }
    });

    socket.on('conversation:join', (conversationId: string) => {
      if (typeof conversationId !== 'string' || conversationId.length < 8) return;
      socket.join(conversationRoom(conversationId));
    });

    socket.on('typing:start', (conversationId: string) => {
      if (typeof conversationId !== 'string') return;
      socket.to(conversationRoom(conversationId)).emit('typing:start', {
        conversationId,
        role: auth?.role === 'admin' ? 'team' : 'visitor',
      });
    });

    socket.on('typing:stop', (conversationId: string) => {
      if (typeof conversationId !== 'string') return;
      socket.to(conversationRoom(conversationId)).emit('typing:stop', { conversationId });
    });

    socket.on('disconnect', () => {
      if (teamSockets.delete(socket.id)) {
        emitPresence();
      }
    });
  });

  app.log.info('chat realtime attached');
}
