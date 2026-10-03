import SongsClient from "./SongsClient";

export const metadata = {
  title: "Free Songs & Movie Soundtracks — Trending Music",
  description:
    "Listen to top songs, trending music tracks, and original movie soundtracks free on Offstream (offstream.co).",
  alternates: {
    canonical: "https://offstream.co/songs",
  },
  openGraph: {
    title: "Free Songs & Movie Soundtracks | Offstream",
    description: "Stream trending music and movie soundtracks on Offstream (offstream.co).",
    url: "https://offstream.co/songs",
    siteName: "Offstream",
  },
};

export default function SongsPage() {
  return <SongsClient />;
}
