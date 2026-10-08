import { Suspense } from "react";
import Script from "next/script";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import AppDownloadPrompt from "../components/AppDownloadPrompt";
import GlobalAds from "../components/ads/GlobalAds";
import { AuthProvider } from "../components/AuthProvider";
import GuestSyncWorker from "../components/GuestSyncWorker";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Inter } from "next/font/google";
import NavigationProgressBar from "../components/NavigationProgressBar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://offstream.co";
const gaId = process.env.NEXT_PUBLIC_GA_ID || "G-Z38RNJP55E";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Offstream — Watch Free Movies & TV Series Online",
    template: "%s · Offstream",
  },
  description:
    "Watch free movies and TV series online on Offstream (offstream.co). Enjoy Hollywood, Bollywood, Hindi dubbed cinema, Korean dramas, anime, and trending TV shows in ultra HD with zero ads.",
  keywords: [
    "Offstream",
    "offstream.co",
    "Offstream movies",
    "Offstream streaming",
    "Movies Hunder",
    "MovieHunter",
    "watch free movies online",
    "free movies",
    "ads free movies",
    "series",
    "hindi dubbed",
    "hollywood",
    "bollywood",
    "watch movies online free",
    "moviehunter",
    "movies hunder",
    "movieshunder",
    "Netflix",
    "Free Netflix",
    "Netflix free",
    "Top 10",
    "Top 10 movies",
    "Top 10 series",
    "Top 10 tv series",
    "free streaming movies",
    "hindi dubbed movies",
    "dual audio movies",
    "stream tv series free",
    "hollywood",
    "bollywood",
    "asian drama",
    "anime free stream",
    "hd movies",
  ],
  applicationName: "Offstream",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Offstream",
    title: "Offstream — Watch Free Movies & TV Series Online",
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
    title: "Offstream — Watch Free Movies & TV Series Online",
    description:
      "Watch Hollywood, Bollywood, and Hindi dubbed movies & TV series free with no ads on Offstream (offstream.co).",
    images: ["/brand/logo-full.png"],
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION || undefined,
    bing: process.env.NEXT_PUBLIC_BING_VERIFICATION || undefined,
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
      alternateName: ["offstream.co", "Offstream Movies", "Movies Hunder", "MovieHunter", "OffStream"],
      description:
        "Watch free movies and series online on Offstream (offstream.co). Stream Hollywood, Bollywood, Hindi dubbed movies, and TV shows ads-free.",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${siteUrl}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Offstream",
      alternateName: ["Movies Hunder", "MovieHunter", "offstream.co"],
      url: `${siteUrl}/`,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/brand/logo-symbol.png`,
      },
    },
    {
      "@type": "SiteNavigationElement",
      "@id": `${siteUrl}/#navigation`,
      name: "Core Hubs",
      itemListElement: [
        {
          "@type": "SiteNavigationElement",
          position: 1,
          name: "Free Movies",
          description: "Hollywood, Bollywood, and Hindi dubbed movies online in HD.",
          url: `${siteUrl}/movies`,
        },
        {
          "@type": "SiteNavigationElement",
          position: 2,
          name: "TV Series",
          description: "Full episodic seasons and television series streaming free.",
          url: `${siteUrl}/tv-series`,
        },
        {
          "@type": "SiteNavigationElement",
          position: 3,
          name: "Anime & Animation",
          description: "Top anime releases and animated feature films.",
          url: `${siteUrl}/animation`,
        },
        {
          "@type": "SiteNavigationElement",
          position: 4,
          name: "Top Rankings",
          description: "Highest-rated and trending movies and shows.",
          url: `${siteUrl}/ranking`,
        },
        {
          "@type": "SiteNavigationElement",
          position: 5,
          name: "Music & Songs",
          description: "Free streaming music and soundtrack audio.",
          url: `${siteUrl}/songs`,
        },
        {
          "@type": "SiteNavigationElement",
          position: 6,
          name: "Sitemap Directory",
          description: "Complete indexed directory of titles and categories.",
          url: `${siteUrl}/sitemap`,
        },
      ],
    },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <link rel="preconnect" href="https://pbcdnw.aoneroom.com" />
        <link rel="dns-prefetch" href="https://pbcdnw.aoneroom.com" />
        <link
          rel="preconnect"
          href="https://api-moviehunder.ismailabbasi.qzz.io"
          crossOrigin="anonymous"
        />
        <link
          rel="dns-prefetch"
          href="https://api-moviehunder.ismailabbasi.qzz.io"
        />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {/* Google Analytics (gtag.js) */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaId}');
          `}
        </Script>
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        <AuthProvider>
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
        <SpeedInsights />
      </body>
    </html>
  );
}
