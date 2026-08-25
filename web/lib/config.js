export function getApiBase() {
  return (
    process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8787"
  );
}

export function getPlayRelayBase() {
  return (
    process.env.NEXT_PUBLIC_PLAY_RELAY?.replace(/\/+$/, "") ||
    "http://127.0.0.1:8788"
  );
}
