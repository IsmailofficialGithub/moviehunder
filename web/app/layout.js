import SiteHeader from "../components/SiteHeader";
import "./globals.css";

export const metadata = {
  title: "Flick",
  description: "Browse and stream movies and series",
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
