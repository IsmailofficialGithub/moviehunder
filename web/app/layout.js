import SiteHeader from "../components/SiteHeader";
import AppDownloadPrompt from "../components/AppDownloadPrompt";
import GlobalAds from "../components/ads/GlobalAds";
import { AuthProvider } from "../components/AuthProvider";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
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
          <SiteHeader />
          <div className="appMain">{children}</div>
          <AppDownloadPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
