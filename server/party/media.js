// Watch-party voice: mediasoup SFU (audio only).
//
// • One mediasoup Worker per CPU core, each with a WebRtcServer on a single UDP+TCP port
//   (PARTY_RTC_PORT + workerIndex) — so the firewall needs only N ports, not a range.
// • One Router per room (round-robin over workers), Opus only.
// • Every listener gets a consumer per mic, created paused. Only the top N active speakers
//   (AudioLevelObserver) are resumed, so bandwidth/CPU stay flat as rooms grow.
// • Peers are keyed by socket (a user with two tabs has two peers).

import os from "node:os";

const OPUS = {
  kind: "audio",
  mimeType: "audio/opus",
  clockRate: 48000,
  channels: 2,
  parameters: { useinbandfec: 1, usedtx: 1, "sprop-stereo": 0 },
};

export const VOICE_DEFAULTS = Object.freeze({
  MAX_SPEAKERS: 6,
  SPEAKER_HOLD_MS: 2500, // keep a speaker forwarded briefly after they go quiet (no choppy cut-offs)
  LEVEL_THRESHOLD_DB: -65,
  LEVEL_INTERVAL_MS: 300,
});

/**
 * Pick which producers to forward. Pure — unit tested.
 * @param {Map<string, { level: number, lastActiveAt: number }>} stats producerId → recent activity
 * @returns {Set<string>} producer ids to forward
 */
export function selectActiveSpeakers(stats, now, max = VOICE_DEFAULTS.MAX_SPEAKERS, holdMs = VOICE_DEFAULTS.SPEAKER_HOLD_MS) {
  const recent = [...stats.entries()]
    .filter(([, s]) => now - s.lastActiveAt <= holdMs)
    .sort((a, b) => b[1].lastActiveAt - a[1].lastActiveAt || b[1].level - a[1].level);
  return new Set(recent.slice(0, max).map(([id]) => id));
}

export class PartyMedia {
  constructor({
    mediasoup,
    numWorkers = Number(process.env.PARTY_RTC_WORKERS) || os.cpus().length,
    listenIp = process.env.PARTY_RTC_LISTEN_IP || "0.0.0.0",
    announcedAddress = process.env.PARTY_RTC_ANNOUNCED_IP || undefined,
    basePort = Number(process.env.PARTY_RTC_PORT) || 40000,
    maxSpeakers = Number(process.env.PARTY_VOICE_MAX_SPEAKERS) || VOICE_DEFAULTS.MAX_SPEAKERS,
    log = console,
  } = {}) {
    this.mediasoup = mediasoup;
    this.numWorkers = Math.max(1, numWorkers);
    this.listenIp = listenIp;
    this.announcedAddress = announcedAddress;
    this.basePort = basePort;
    this.maxSpeakers = maxSpeakers;
    this.log = log;
    this.workers = []; // { worker, webRtcServer }
    this.nextWorker = 0;
    /** @type {Map<string, any>} roomId → media room */
    this.rooms = new Map();
    this.ready = false;
  }

  async init() {
    for (let i = 0; i < this.numWorkers; i++) {
      const worker = await this.mediasoup.createWorker({ logLevel: "warn" });
      worker.on("died", (err) => {
        this.log.error?.(`[party/media] worker ${worker.pid} died`, err);
        // Rooms on a dead worker lose voice; clients see rtc_reset and can re-enable the mic.
        for (const [roomId, room] of this.rooms) {
          if (room.workerEntry.worker === worker) this.closeRoom(roomId, { notify: true });
        }
      });
      const port = this.basePort + i;
      const webRtcServer = await worker.createWebRtcServer({
        listenInfos: [
          { protocol: "udp", ip: this.listenIp, announcedAddress: this.announcedAddress, port },
          { protocol: "tcp", ip: this.listenIp, announcedAddress: this.announcedAddress, port },
        ],
      });
      this.workers.push({ worker, webRtcServer });
    }
    this.ready = true;
    return this;
  }

  async room(roomId, broadcast) {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    // Concurrent first requests must share one router.
    if (!this.creating) this.creating = new Map();
    if (!this.creating.has(roomId)) {
      this.creating.set(roomId, this.createRoom(roomId, broadcast).finally(() => this.creating.delete(roomId)));
    }
    return this.creating.get(roomId);
  }

  async createRoom(roomId, broadcast) {
    let room;
    const workerEntry = this.workers[this.nextWorker++ % this.workers.length];
    const router = await workerEntry.worker.createRouter({ mediaCodecs: [OPUS] });
    const levelObserver = await router.createAudioLevelObserver({
      maxEntries: Math.max(this.maxSpeakers * 2, 10),
      threshold: VOICE_DEFAULTS.LEVEL_THRESHOLD_DB,
      interval: VOICE_DEFAULTS.LEVEL_INTERVAL_MS,
    });
    room = {
      id: roomId,
      router,
      workerEntry,
      levelObserver,
      broadcast,
      peers: new Map(), // socket → peer
      producers: new Map(), // producerId → { producer, peer }
      stats: new Map(), // producerId → { level, lastActiveAt }
      active: new Set(),
      timer: null,
    };
    levelObserver.on("volumes", (volumes) => {
      const now = Date.now();
      for (const { producer, volume } of volumes) {
        room.stats.set(producer.id, { level: volume, lastActiveAt: now });
      }
      this.refreshActive(room);
    });
    room.timer = setInterval(() => this.refreshActive(room), 500);
    this.rooms.set(roomId, room);
    return room;
  }

  /** Recompute forwarded speakers; pause/resume consumers and tell clients who is talking. */
  refreshActive(room) {
    const next = selectActiveSpeakers(room.stats, Date.now(), this.maxSpeakers);
    const changed = next.size !== room.active.size || [...next].some((id) => !room.active.has(id));
    if (!changed) return;
    room.active = next;
    for (const peer of room.peers.values()) {
      for (const c of peer.consumers.values()) this.applyConsumerState(room, c);
    }
    const speakers = [...next].map((id) => room.producers.get(id)?.peer.userId).filter(Boolean);
    room.broadcast({ t: "rtc_speakers", userIds: [...new Set(speakers)] });
  }

  applyConsumerState(room, consumer) {
    if (!consumer.appData.ready || consumer.closed) return;
    const want = room.active.has(consumer.producerId) && !consumer.producerPaused;
    if (want && consumer.paused) consumer.resume().catch(() => {});
    if (!want && !consumer.paused) consumer.pause().catch(() => {});
  }

  peer(room, socket) {
    let peer = room.peers.get(socket);
    if (!peer) {
      peer = { socket, userId: socket.userId, transports: new Map(), producer: null, consumers: new Map() };
      room.peers.set(socket, peer);
    }
    return peer;
  }

  /**
   * Handle an `rtc.*` request. Replies { t: "rtc", rid, ok, data | error }.
   * @param {{ hostMute?: (targetUserId: string) => boolean }} ctx  permission hooks from the hub
   */
  async handle(socket, msg, ctx = {}) {
    const reply = (data) => socket.send({ t: "rtc", rid: msg.rid, ok: true, data });
    const fail = (error) => socket.send({ t: "rtc", rid: msg.rid, ok: false, error });
    if (!this.ready) return fail("VOICE_UNAVAILABLE");
    const room = await this.room(socket.roomId, ctx.broadcast);
    const peer = this.peer(room, socket);

    switch (msg.t) {
      case "rtc.caps":
        return reply({ rtpCapabilities: room.router.rtpCapabilities, maxSpeakers: this.maxSpeakers });

      case "rtc.producers":
        return reply({
          producers: [...room.producers.values()]
            .filter((p) => p.peer !== peer)
            .map((p) => ({ producerId: p.producer.id, userId: p.peer.userId, paused: p.producer.paused })),
          speakers: [...room.active].map((id) => room.producers.get(id)?.peer.userId).filter(Boolean),
        });

      case "rtc.transport": {
        const direction = msg.direction === "send" ? "send" : "recv";
        for (const t of peer.transports.values()) if (t.appData.direction === direction) t.close();
        const transport = await room.router.createWebRtcTransport({
          webRtcServer: room.workerEntry.webRtcServer,
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
          initialAvailableOutgoingBitrate: 300_000,
          appData: { direction },
        });
        peer.transports.set(transport.id, transport);
        transport.on("dtlsstatechange", (s) => (s === "failed" || s === "closed") && transport.close());
        transport.observer.on("close", () => peer.transports.delete(transport.id));
        return reply({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      }

      case "rtc.connect": {
        const transport = peer.transports.get(String(msg.transportId));
        if (!transport) return fail("NO_TRANSPORT");
        await transport.connect({ dtlsParameters: msg.dtlsParameters });
        return reply({});
      }

      case "rtc.produce": {
        const transport = peer.transports.get(String(msg.transportId));
        if (!transport || transport.appData.direction !== "send") return fail("NO_TRANSPORT");
        if (msg.kind !== "audio") return fail("AUDIO_ONLY");
        peer.producer?.close();
        const producer = await transport.produce({ kind: "audio", rtpParameters: msg.rtpParameters });
        peer.producer = producer;
        room.producers.set(producer.id, { producer, peer });
        await room.levelObserver.addProducer({ producerId: producer.id }).catch(() => {});
        producer.observer.on("close", () => {
          room.producers.delete(producer.id);
          room.stats.delete(producer.id);
          if (peer.producer === producer) peer.producer = null;
          room.broadcast({ t: "rtc_producer_closed", producerId: producer.id, userId: peer.userId });
          this.refreshActive(room);
        });
        this.broadcastExcept(room, peer, { t: "rtc_producer", producerId: producer.id, userId: peer.userId });
        room.broadcast({ t: "rtc_mic", userId: peer.userId, on: true });
        return reply({ id: producer.id });
      }

      case "rtc.consume": {
        const transport = [...peer.transports.values()].find((t) => t.appData.direction === "recv");
        const entry = room.producers.get(String(msg.producerId));
        if (!transport || !entry) return fail("CANNOT_CONSUME");
        if (!room.router.canConsume({ producerId: entry.producer.id, rtpCapabilities: msg.rtpCapabilities })) {
          return fail("INCOMPATIBLE");
        }
        peer.consumers.get(entry.producer.id)?.close();
        const consumer = await transport.consume({
          producerId: entry.producer.id,
          rtpCapabilities: msg.rtpCapabilities,
          paused: true,
          appData: { ready: false },
        });
        peer.consumers.set(entry.producer.id, consumer);
        consumer.observer.on("close", () => peer.consumers.delete(entry.producer.id));
        consumer.on("producerpause", () => this.applyConsumerState(room, consumer));
        consumer.on("producerresume", () => this.applyConsumerState(room, consumer));
        return reply({
          id: consumer.id,
          producerId: entry.producer.id,
          userId: entry.peer.userId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      }

      case "rtc.consumer_ready": {
        const consumer = [...peer.consumers.values()].find((c) => c.id === String(msg.consumerId));
        if (!consumer) return fail("NO_CONSUMER");
        consumer.appData.ready = true;
        this.applyConsumerState(room, consumer);
        return reply({});
      }

      case "rtc.mic": {
        if (!peer.producer) return fail("NO_PRODUCER");
        if (msg.on) {
          if (peer.forceMuted) return fail("MUTED_BY_HOST");
          await peer.producer.resume();
        } else {
          await peer.producer.pause();
        }
        room.broadcast({ t: "rtc_mic", userId: peer.userId, on: Boolean(msg.on) });
        return reply({});
      }

      case "rtc.stop": {
        peer.producer?.close();
        room.broadcast({ t: "rtc_mic", userId: peer.userId, on: false });
        return reply({});
      }

      case "rtc.host_mute": {
        const target = String(msg.userId);
        if (!ctx.hostMute?.(target)) return fail("FORBIDDEN");
        for (const p of room.peers.values()) {
          if (p.userId !== target) continue;
          p.forceMuted = Boolean(msg.muted ?? true);
          if (p.forceMuted && p.producer && !p.producer.paused) await p.producer.pause();
          p.socket.send({ t: "rtc_force_muted", muted: p.forceMuted });
        }
        if (msg.muted ?? true) room.broadcast({ t: "rtc_mic", userId: target, on: false });
        return reply({});
      }

      default:
        return fail("BAD_TYPE");
    }
  }

  broadcastExcept(room, exceptPeer, msg) {
    for (const p of room.peers.values()) if (p !== exceptPeer) p.socket.send(msg);
  }

  removePeer(roomId, socket) {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(socket);
    if (!peer) return;
    for (const t of peer.transports.values()) t.close(); // closes its producer/consumers too
    room.peers.delete(socket);
    if (peer.producer) room.broadcast({ t: "rtc_mic", userId: peer.userId, on: false });
    if (room.peers.size === 0) this.closeRoom(roomId);
  }

  closeRoom(roomId, { notify = false } = {}) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    clearInterval(room.timer);
    if (notify) room.broadcast({ t: "rtc_reset" });
    try {
      room.router.close();
    } catch {
      /* already closed with its worker */
    }
    this.rooms.delete(roomId);
  }

  async close() {
    for (const id of [...this.rooms.keys()]) this.closeRoom(id);
    for (const { worker } of this.workers) worker.close();
  }
}
