import SongsClient from "./SongsClient";

export const metadata = {
  title: "Free Songs & Movie Soundtracks — Trending Music",
  description:
    "Listen to top songs, trending music tracks, and original movie soundtracks free on Movies Hunder (offstream.co).",
  alternates: {
    canonical: "https://offstream.co/songs",
  },
  openGraph: {
    title: "Free Songs & Movie Soundtracks | Movies Hunder",
    description: "Stream trending music and movie soundtracks on Movies Hunder (offstream.co).",
    url: "https://offstream.co/songs",
  },
};

export default function SongsPage() {
  return <SongsClient />;
}
