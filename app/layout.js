import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { PlayerProvider } from "@/context/PlayerContext";
import PlayerBar from "@/components/PlayerBar";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import HistoryLogger from "@/components/HistoryLogger";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import MainContent from "@/components/MainContent";
import PlayerLoadErrorBanner from "@/components/PlayerLoadErrorBanner";
import NowPlaying from "@/components/NowPlaying";

export const metadata = {
  title: "SUS Music",
  description: "Trình phát nhạc/video YouTube cá nhân, nghe nền trên PC và Android",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SUS Music",
  },
};

export const viewport = {
  themeColor: "#33101f",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className="h-full">
      <head>
        <link
          rel="preload"
          href="/fonts/baloo-2-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/baloo-2-vietnamese-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased font-sans">
        <ToastProvider>
          <AuthProvider>
            <PlayerProvider>
              <Sidebar />
              <TopBar />
              <MainContent>{children}</MainContent>
              <PlayerBar />
              <PlayerLoadErrorBanner />
              <NowPlaying />
              <HistoryLogger />
              <KeyboardShortcuts />
            </PlayerProvider>
          </AuthProvider>
        </ToastProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
