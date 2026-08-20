import { test } from "vitest";
import assert from "node:assert/strict";
import { MatchRoomRepository } from "../../../src/nest/match/match-room.repository.js";

test("confirm during CONFIRMING status queries participant using both roomId and playerAccountId", async () => {
  const roomId = "room-uuid-123";
  const playerAccountId = "player-uuid-456";

  const executedQueries: Array<{ sql: string; values: unknown[] }> = [];

  const repository = new MatchRoomRepository(
    {
      getPool() {
        return {
          async getConnection() {
            return {
              async beginTransaction() {},
              async commit() {},
              async rollback() {},
              release() {},
              async execute(sql: string, values: unknown[]) {
                executedQueries.push({ sql, values });

                if (sql.includes("FROM match_rooms WHERE id = ?")) {
                  return [[{
                    id: roomId,
                    creator_player_account_id: playerAccountId,
                    status: "CONFIRMING",
                    version: 1,
                    confirmation_round: 1,
                    confirmation_started_at: new Date(),
                    confirmation_deadline_at: new Date(Date.now() + 30000),
                    roster_locked_at: null,
                    ready_at: null,
                    confirmation_expired: 0,
                  }]];
                }

                if (sql.includes("FROM match_room_participants WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL LIMIT 1")) {
                  return [[{ confirmed_round: null, confirmed_at: null }]];
                }

                if (sql.includes("UPDATE match_room_participants SET confirmed_round = ?")) {
                  return [{ affectedRows: 1 }];
                }

                if (sql.includes("SELECT COUNT(*) AS participant_count")) {
                  return [[{ participant_count: 1 }]];
                }

                if (sql.includes("UPDATE match_rooms SET version = version + 1")) {
                  return [{ affectedRows: 1 }];
                }

                return [[]];
              },
            };
          },
        };
      },
    } as any,
    {} as any,
    {} as any,
  );

  await repository.confirm(roomId, playerAccountId);

  const participantQuery = executedQueries.find((q) =>
    q.sql.includes("FROM match_room_participants WHERE room_id = ? AND player_account_id = ? AND released_at IS NULL LIMIT 1"),
  );

  assert.ok(participantQuery, "Participant lookup query was executed");
  assert.deepEqual(participantQuery.values, [roomId, playerAccountId]);
});
