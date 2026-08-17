import { Injectable } from "@nestjs/common";
import type { MatchRoomSnapshot } from "./match-room.contract.js";
import { MatchRoomError } from "./match-room.error.js";
import { MatchRoomRepository } from "./match-room.repository.js";

@Injectable()
export class MatchRoomService {
  constructor(private readonly repository: MatchRoomRepository) {}

  list(viewerId: string): Promise<MatchRoomSnapshot[]> { return this.repository.listRelevant(viewerId); }
  current(viewerId: string): Promise<MatchRoomSnapshot | null> { return this.repository.getCurrent(viewerId); }
  async get(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    const room = await this.repository.getById(roomId, viewerId);
    if (!room) throw new MatchRoomError("room_not_found");
    return room;
  }
  async create(viewerId: string): Promise<MatchRoomSnapshot> {
    return this.get(await this.repository.create(viewerId), viewerId);
  }
  async join(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.join(roomId, viewerId); return this.get(roomId, viewerId);
  }
  async leave(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.leave(roomId, viewerId); return this.get(roomId, viewerId);
  }
  async cancel(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.cancel(roomId, viewerId); return this.get(roomId, viewerId);
  }
  async confirm(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.confirm(roomId, viewerId); return this.get(roomId, viewerId);
  }
}
