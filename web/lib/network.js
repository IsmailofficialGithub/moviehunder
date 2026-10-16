import dns from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

let initialized = false;

export function ensureIpv4() {
  if (initialized || typeof window !== "undefined") return;
  initialized = true;
  try {
    dns.setDefaultResultOrder("ipv4first");
  } catch {}
  try {
    const agent = new Agent({
      connect: {
        lookup: (hostname, options, callback) => {
          dns.lookup(hostname, { ...options, family: 4 }, callback);
        },
      },
    });
    setGlobalDispatcher(agent);
  } catch (e) {
    console.error("[ipv4Dispatcher] failed:", e);
  }
}

ensureIpv4();
