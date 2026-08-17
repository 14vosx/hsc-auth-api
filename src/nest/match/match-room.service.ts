import { Injectable } from "@nestjs/common";
import { PlayerPresentationReferenceService } from "../player/presentation-reference/player-presentation-reference.service.js";
import type { MatchRoomAggregateSnapshot, MatchRoomSnapshot } from "./match-room.contract.js";
import { MatchRoomError } from "./match-room.error.js";
import { MatchRoomRepository } from "./match-room.repository.js";

@Injectable()
export class MatchRoomService {
  constructor(
    private readonly repository: MatchRoomRepository,
    private readonly presentationReferences: PlayerPresentationReferenceService,
  ) {}

  private async enrichMany(rooms: MatchRoomAggregateSnapshot[]): Promise<MatchRoomSnapshot[]> {
    const playerAccountIds = [...new Set(rooms.flatMap((snapshot) =>
      snapshot.room.participants.map((participant) => participant.playerAccountId)))];
    const references = await this.presentationReferences.resolveByPlayerAccountIds(playerAccountIds);
    return rooms.map((snapshot) => ({
      ...snapshot,
      room: {
        ...snapshot.room,
        participants: snapshot.room.participants.map((participant) => ({
          ...participant,
          player: references.get(participant.playerAccountId) ?? null,
        })),
      },
    }));
  }

  private async enrichOne(room: MatchRoomAggregateSnapshot | null): Promise<MatchRoomSnapshot | null> {
    if (!room) return null;
    return (await this.enrichMany([room]))[0] ?? null;
  }

  async list(viewerId: string): Promise<MatchRoomSnapshot[]> {
    return this.enrichMany(await this.repository.listRelevant(viewerId));
  }

  async current(viewerId: string): Promise<MatchRoomSnapshot | null> {
    return this.enrichOne(await this.repository.getCurrent(viewerId));
  }

  async get(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    const room = await this.enrichOne(await this.repository.getById(roomId, viewerId));
    if (!room) throw new MatchRoomError("room_not_found");
    return room;
  }

  async create(viewerId: string): Promise<MatchRoomSnapshot> {
    return this.get(await this.repository.create(viewerId), viewerId);
  }

  async join(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.join(roomId, viewerId);
    return this.get(roomId, viewerId);
  }

  async leave(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.leave(roomId, viewerId);
    return this.get(roomId, viewerId);
  }

  async cancel(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.cancel(roomId, viewerId);
    return this.get(roomId, viewerId);
  }

  async confirm(roomId: string, viewerId: string): Promise<MatchRoomSnapshot> {
    await this.repository.confirm(roomId, viewerId);
    return this.get(roomId, viewerId);
  }
}
