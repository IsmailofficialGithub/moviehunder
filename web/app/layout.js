import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import AppDownloadPrompt from "../components/AppDownloadPrompt";
import GlobalAds from "../components/ads/GlobalAds";
import { AuthProvider } from "../components/AuthProvider";
import GuestSyncWorker from "../components/GuestSyncWorker";
import SmoothScroll from "../components/SmoothScroll";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://offstream.co";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Offstream — Free Movies & TV Series Online | Movies Hunder",
    template: "%s · Offstream",
  },
  description:
    "Watch free movies and series online on Offstream (offstream.co). Enjoy ads-free streaming for Hollywood, Bollywood, Hindi dubbed movies, Korean dramas, anime, and trending TV shows in ultra HD.",
  keywords: [
    "Offstream",
    "Offstream movies",
    "offstream.co",
    "Offstream streaming",
    "Movies Hunder",
    "MovieHunter",
    "free movies",
    "ads free movies",
    "series",
    "hindi dubbed",
    "hollywood",
    "bollywood",
    "watch movies online free",
    "free streaming movies",
    "dual audio movies",
    "stream tv series free",
    "hd movies",
    "asian drama",
    "anime free stream",
    "south hindi dubbed",
  ],
  applicationName: "Offstream",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Offstream",
    title: "Offstream — Free Movies & TV Series Online | Movies Hunder",
    description:
      "Stream Hollywood, Bollywood, Hindi dubbed movies & TV series online for free in HD on Offstream (offstream.co).",
    images: [
      {
        url: "/brand/logo-full.png",
        width: 1200,
        height: 630,
        alt: "Offstream - Free Movies & TV Series",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Offstream — Free Movies & TV Series Online",
    description:
      "Watch Hollywood, Bollywood, and Hindi dubbed movies & TV series free with no ads on Offstream (offstream.co).",
    images: ["/brand/logo-full.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon-48x48.png"],
  },
  manifest: "/site.webmanifest",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: "Offstream",
      alternateName: ["Offstream Movies", "Movies Hunder", "MovieHunter", "OffStream"],
      description:
        "Watch free movies and series online on Offstream (Movies Hunder). Stream Hollywood, Bollywood, Hindi dubbed movies, and TV shows ads-free.",
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Offstream",
      alternateName: ["Movies Hunder", "MovieHunter"],
      url: `${siteUrl}/`,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/brand/logo-symbol.png`,
      },
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <AuthProvider>
          <SmoothScroll />
          <ServiceWorkerRegister />
          <GlobalAds />
          <GuestSyncWorker />
          <SiteHeader />
          <div className="appMain">
            <div className="appScrollContent">
              {children}
              <SiteFooter />
            </div>
          </div>
          <AppDownloadPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
