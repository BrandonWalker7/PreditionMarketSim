import {
  ConnectedSocket, MessageBody, OnGatewayDisconnect, SubscribeMessage,
  WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

type Room = { hostId: string; members: Set<string> };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SignalingGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly rooms = new Map<string, Room>();
  private readonly socketRooms = new Map<string, string>();

  @SubscribeMessage('create-room')
  createRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { code: string; name: string }) {
    const code = body.code.trim().toUpperCase();
    if (!code || this.rooms.has(code)) return { ok: false, error: 'Bet code is already in use.' };
    this.rooms.set(code, { hostId: client.id, members: new Set([client.id]) });
    this.socketRooms.set(client.id, code);
    client.join(code);
    return { ok: true, code };
  }

  @SubscribeMessage('join-room')
  joinRoom(@ConnectedSocket() client: Socket, @MessageBody() body: { code: string; name: string }) {
    const code = body.code.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'That bet does not exist or is no longer available.' };
    room.members.add(client.id);
    this.socketRooms.set(client.id, code);
    client.join(code);
    this.server.to(room.hostId).emit('peer-joined', { peerId: client.id, name: body.name.trim().slice(0, 24) || 'Guest' });
    return { ok: true };
  }

  @SubscribeMessage('signal')
  relaySignal(@ConnectedSocket() client: Socket, @MessageBody() body: { target: string; data: unknown }) {
    const senderRoom = this.socketRooms.get(client.id);
    const targetRoom = this.socketRooms.get(body.target);
    if (!senderRoom || senderRoom !== targetRoom) return { ok: false };
    this.server.to(body.target).emit('signal', { from: client.id, data: body.data });
    return { ok: true };
  }

  handleDisconnect(client: Socket) {
    const code = this.socketRooms.get(client.id);
    if (!code) return;
    const room = this.rooms.get(code);
    this.socketRooms.delete(client.id);
    if (!room) return;
    room.members.delete(client.id);

    if (room.hostId === client.id) {
      if (room.members.size > 0) {
        const previousHostId = client.id;
        const successor = room.members.values().next().value as string;
        room.hostId = successor;
        this.server.to(code).emit('host-transferred', {
          newHostId: successor,
          previousHostId,
          members: [...room.members],
        });
      } else {
        this.rooms.delete(code);
      }
    } else {
      this.server.to(code).emit('peer-left', { peerId: client.id });
    }
  }
}
