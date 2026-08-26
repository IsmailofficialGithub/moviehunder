import SiteHeader from "../components/SiteHeader";
import "./globals.css";

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
    <html lang="en">
      <body>
        <SiteHeader />
        <div className="appMain">{children}</div>
      </body>
    </html>
  );
}
