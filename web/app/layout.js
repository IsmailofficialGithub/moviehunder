import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import AppDownloadPrompt from "../components/AppDownloadPrompt";
import GlobalAds from "../components/ads/GlobalAds";
import { AuthProvider } from "../components/AuthProvider";
import GuestSyncWorker from "../components/GuestSyncWorker";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://offstream.co"),
  title: {
    default: "MovieHunter",
    template: "%s · MovieHunter",
  },
  description: "Stream movies, series, and music — MovieHunter",
  applicationName: "MovieHunter",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/brand/logo-symbol.png", type: "image/png" },
    ],
    apple: [{ url: "/icon.png" }],
    shortcut: ["/favicon.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        <AuthProvider>
          <GlobalAds />
          <GuestSyncWorker />
          <SiteHeader />
          <div className="appMain">
            {children}
            <SiteFooter />
          </div>
          <AppDownloadPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
