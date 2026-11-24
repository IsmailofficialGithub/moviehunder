// Watch-party voice over the mediasoup SFU. Platform-neutral: web and mobile pass adapters.
// (mobile/lib/party/voice.js is a copy — keep in sync.)
//
//   const voice = new PartyVoice({ client, createDevice, getUserMedia, playTrack, onChange });
//   await voice.join();          // listen to others (no mic permission needed)
//   await voice.startMic();      // ask for the mic and start talking
//   voice.setMic(false|true);    // mute / unmute (push-to-talk uses this)
//   voice.leave();

const REQUEST_TIMEOUT_MS = 10_000;

export class PartyVoice {
  /**
   * @param {{
   *   client: import("./client").PartyClient,
   *   createDevice: () => Promise<any>,                       // mediasoup-client Device
   *   getUserMedia: () => Promise<MediaStream>,
   *   playTrack: (userId: string, track: MediaStreamTrack) => (() => void),  // returns a stop fn
   *   onChange: (state: object) => void,
   * }} opts
   */
  constructor({ client, createDevice, getUserMedia, playTrack, onChange }) {
    this.client = client;
    this.createDevice = createDevice;
    this.getUserMedia = getUserMedia;
    this.playTrack = playTrack;
    this.onChange = onChange || (() => {});
    this.pending = new Map();
    this.seq = 0;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producer = null;
    this.stream = null;
    this.consumers = new Map(); // producerId → { consumer, stop, userId }
    this.state = { joined: false, joining: false, micOn: false, micLive: false, forceMuted: false, speakers: [], mics: {}, error: null };
    this.wantMic = false;
    this.offs = [
      client.on("rtc", (m) => this.onReply(m)),
      client.on("rtc_producer", (m) => this.state.joined && this.consume(m.producerId).catch(() => {})),
      client.on("rtc_producer_closed", (m) => this.dropConsumer(m.producerId)),
      client.on("rtc_speakers", (m) => this.set({ speakers: m.userIds || [] })),
      client.on("rtc_mic", (m) => this.set({ mics: { ...this.state.mics, [m.userId]: Boolean(m.on) } })),
      client.on("rtc_force_muted", (m) => {
        this.set({ forceMuted: Boolean(m.muted) });
        if (m.muted) this.setMic(false, { local: true });
      }),
      client.on("rtc_reset", () => this.rejoin()),
      // A reconnect gives us a new server-side peer — rebuild transports.
      client.on("joined", () => this.state.joined && this.rejoin()),
    ];
  }

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  request(t, data = {}) {
    const rid = `v${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        reject(new Error("VOICE_TIMEOUT"));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(rid, { resolve, reject, timer });
      if (!this.client.send({ t, rid, ...data })) {
        clearTimeout(timer);
        this.pending.delete(rid);
        reject(new Error("OFFLINE"));
      }
    });
  }

  onReply(m) {
    const p = this.pending.get(m.rid);
    if (!p) return;
    this.pending.delete(m.rid);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.data);
    else p.reject(Object.assign(new Error(m.error || "VOICE_ERROR"), { code: m.error }));
  }

  /** Start listening to the room's voices. */
  async join() {
    if (this.state.joined || this.state.joining) return;
    this.set({ joining: true, error: null });
    try {
      const { rtpCapabilities } = await this.request("rtc.caps");
      this.device = await this.createDevice();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });
      this.recvTransport = await this.makeTransport("recv");
      this.set({ joined: true, joining: false });
      const { producers, speakers } = await this.request("rtc.producers");
      const mics = {};
      for (const p of producers) mics[p.userId] = !p.paused;
      this.set({ speakers: speakers || [], mics: { ...this.state.mics, ...mics } });
      await Promise.all(producers.map((p) => this.consume(p.producerId).catch(() => {})));
      if (this.wantMic) await this.startMic();
    } catch (err) {
      this.set({ joining: false, error: err.code || err.message });
      throw err;
    }
  }

  async makeTransport(direction) {
    const params = await this.request("rtc.transport", { direction });
    const transport =
      direction === "send" ? this.device.createSendTransport(params) : this.device.createRecvTransport(params);
    transport.on("connect", ({ dtlsParameters }, ok, fail) => {
      this.request("rtc.connect", { transportId: transport.id, dtlsParameters }).then(ok, fail);
    });
    if (direction === "send") {
      transport.on("produce", ({ kind, rtpParameters }, ok, fail) => {
        this.request("rtc.produce", { transportId: transport.id, kind, rtpParameters }).then(ok, fail);
      });
    }
    transport.on("connectionstatechange", (s) => {
      if (s === "failed") this.set({ error: "VOICE_CONNECTION_FAILED" });
    });
    return transport;
  }

  async consume(producerId) {
    if (!this.recvTransport || this.consumers.has(producerId)) return;
    const params = await this.request("rtc.consume", { producerId, rtpCapabilities: this.device.rtpCapabilities });
    const consumer = await this.recvTransport.consume(params);
    const stop = this.playTrack(params.userId, consumer.track);
    this.consumers.set(producerId, { consumer, stop, userId: params.userId });
    await this.request("rtc.consumer_ready", { consumerId: consumer.id });
  }

  dropConsumer(producerId) {
    const c = this.consumers.get(producerId);
    if (!c) return;
    this.consumers.delete(producerId);
    try {
      c.stop?.();
      c.consumer.close();
    } catch {
      /* closed */
    }
  }

  /** Ask for the microphone and start sending (joins voice first if needed). */
  async startMic() {
    this.wantMic = true;
    if (!this.state.joined) return this.join();
    if (this.state.forceMuted) throw Object.assign(new Error("MUTED_BY_HOST"), { code: "MUTED_BY_HOST" });
    if (this.producer) return this.setMic(true);
    this.stream = await this.getUserMedia();
    const track = this.stream.getAudioTracks()[0];
    if (!this.sendTransport) this.sendTransport = await this.makeTransport("send");
    this.producer = await this.sendTransport.produce({
      track,
      codecOptions: { opusStereo: false, opusDtx: true, opusFec: true, opusMaxPlaybackRate: 48000 },
      stopTracks: false,
    });
    this.set({ micOn: true, micLive: true });
  }

  /** Mute/unmute without renegotiating. */
  async setMic(on, { local = false } = {}) {
    const track = this.stream?.getAudioTracks()[0];
    if (track) track.enabled = Boolean(on);
    if (!this.producer) return;
    if (on) this.producer.resume();
    else this.producer.pause();
    this.set({ micOn: Boolean(on) });
    if (!local) await this.request("rtc.mic", { on: Boolean(on) }).catch((err) => this.set({ error: err.code || err.message }));
  }

  async stopMic() {
    this.wantMic = false;
    if (this.producer) {
      this.producer.close();
      this.producer = null;
      await this.request("rtc.stop").catch(() => {});
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.set({ micOn: false, micLive: false });
  }

  hostMute(userId, muted = true) {
    return this.request("rtc.host_mute", { userId, muted });
  }

  teardown() {
    for (const id of [...this.consumers.keys()]) this.dropConsumer(id);
    this.producer?.close();
    this.producer = null;
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("VOICE_RESET"));
    }
    this.pending.clear();
  }

  async rejoin() {
    const hadMic = Boolean(this.producer) || this.wantMic;
    this.teardown();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.set({ joined: false, joining: false, micOn: false, micLive: false });
    this.wantMic = hadMic;
    await this.join().catch(() => {});
  }

  leave() {
    this.wantMic = false;
    this.teardown();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.offs.forEach((off) => off());
    this.set({ joined: false, micOn: false, micLive: false, speakers: [] });
  }
}
