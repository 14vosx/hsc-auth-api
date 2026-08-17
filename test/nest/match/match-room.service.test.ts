import test from "node:test";
import assert from "node:assert/strict";
import { MatchRoomService } from "../../../src/nest/match/match-room.service.js";

function room(id: string, playerAccountIds: string[]) {
  return {
    room: {
      id, status: "FORMING", version: 1,
      creator: { playerAccountId: playerAccountIds[0] },
      participantCount: playerAccountIds.length, capacity: 10,
      confirmation: null, rosterLockedAt: null,
      participants: playerAccountIds.map((playerAccountId) => ({
        playerAccountId, joinedAt: "time",
        confirmation: { confirmed: false, confirmedAt: null },
      })),
    },
    viewer: { participant: false, creator: false, actions: {
      canJoin: false, canLeave: false, canCancel: false, canConfirm: false,
    } },
  } as any;
}

test("MatchRoom list enriches every room through one account-resolution batch", async () => {
  const batches: string[][] = [];
  const service = new MatchRoomService({
    async listRelevant() { return [room("room-1", ["a", "b"]), room("room-2", ["b", "c"])]; },
  } as any, {
    async resolveByPlayerAccountIds(ids: string[]) {
      batches.push(ids);
      return new Map(ids.map((id) => [id, {
        steam: { steamId64: `steam-${id}`, personaname: `name-${id}`, avatarMediumUrl: null },
        profile: id === "a" ? { slug: "public-a" } : null,
      }]));
    },
  } as any);
  const result = await service.list("viewer");
  assert.deepEqual(batches, [["a", "b", "c"]]);

  const roomA = result[0];
  assert.ok(roomA);
  const participantA = roomA.room.participants[0];
  assert.ok(participantA);
  assert.ok(participantA.player);
  assert.equal(participantA.player.profile?.slug, "public-a");

  const participantB = roomA.room.participants[1];
  assert.ok(participantB);
  assert.ok(participantB.player);
  assert.equal(participantB.player.profile, null);

  const roomB = result[1];
  assert.ok(roomB);
  const participantC = roomB.room.participants[1];
  assert.ok(participantC);
  assert.ok(participantC.player);
  assert.equal(participantC.player.steam.personaname, "name-c");
});
