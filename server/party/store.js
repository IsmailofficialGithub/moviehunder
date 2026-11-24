// Prisma + Redis persistence for the party hub.
import { getPrisma } from "../src/db.js";
import { getRedis } from "../src/redis.js";
import { ONLINE_HASH } from "../src/party.js";

const STATE_TTL_S = 24 * 60 * 60;
const stateKey = (roomId) => `party:state:${roomId}`;

export function createStore() {
  const prisma = () => getPrisma();
  const redis = () => getRedis();

  return {
    loadRoom: (roomId) => prisma().partyRoom.findUnique({ where: { id: roomId } }),
    loadMember: (roomId, userId) =>
      prisma().partyMember.findUnique({ where: { roomId_userId: { roomId, userId } } }),
    loadUser: (userId) =>
      prisma().user.findUnique({
        where: { id: userId },
        // Never select email: member names are broadcast to everyone in the room.
        select: { id: true, displayName: true, avatarUrl: true },
      }),

    async markLeft(roomId, userId) {
      await prisma().partyMember.updateMany({ where: { roomId, userId }, data: { leftAt: new Date() } });
    },
    async setRole(roomId, userId, role) {
      await prisma().partyMember.updateMany({ where: { roomId, userId }, data: { role } });
    },
    async ban(roomId, userId) {
      await prisma().partyMember.updateMany({ where: { roomId, userId }, data: { banned: true, leftAt: new Date() } });
    },
    async setHost(roomId, newHostId, oldHostId) {
      await prisma().$transaction([
        prisma().partyRoom.update({ where: { id: roomId }, data: { hostUserId: newHostId } }),
        prisma().partyMember.updateMany({ where: { roomId, userId: newHostId }, data: { role: "HOST" } }),
        prisma().partyMember.updateMany({ where: { roomId, userId: oldHostId }, data: { role: "COHOST" } }),
        prisma().partyEvent.create({ data: { roomId, userId: newHostId, type: "host", data: { from: oldHostId } } }),
      ]);
    },
    async updateContent(roomId, c, userId) {
      await prisma().$transaction([
        prisma().partyRoom.update({
          where: { id: roomId },
          data: { subjectId: c.subjectId, detailPath: c.detailPath, se: c.se, ep: c.ep, title: c.title, poster: c.poster },
        }),
        prisma().partyEvent.create({ data: { roomId, userId, type: "content", data: c } }),
      ]);
    },
    async endRoom(roomId, userId) {
      await prisma().partyRoom.updateMany({ where: { id: roomId, endedAt: null }, data: { endedAt: new Date() } });
      await prisma().partyEvent.create({ data: { roomId, userId, type: "ended" } });
      const r = await redis();
      await r.del(stateKey(roomId));
    },

    async loadState(roomId) {
      const raw = await (await redis()).get(stateKey(roomId));
      return raw ? JSON.parse(raw) : null;
    },
    async saveState(roomId, state) {
      await (await redis()).set(stateKey(roomId), JSON.stringify(state), { EX: STATE_TTL_S });
    },
    async setOnline(roomId, count) {
      const r = await redis();
      if (count > 0) await r.hSet(ONLINE_HASH, roomId, String(count));
      else await r.hDel(ONLINE_HASH, roomId);
    },
    async clearOnline() {
      await (await redis()).del(ONLINE_HASH);
    },
  };
}
