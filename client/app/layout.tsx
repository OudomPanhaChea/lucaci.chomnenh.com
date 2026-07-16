import type { Metadata, Viewport } from "next";
import { Fira_Sans, Fira_Code } from "next/font/google";
import { ToastContainer } from "react-toastify";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/hooks/useAuth";
import ServiceWorkerRegistrar from "@/components/pwa/service-worker";
import "./globals.css";

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans",
});
const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-fira-code",
});

// Force every page dynamic so responses go out with no-store cache headers.
// Static prerender stamps s-maxage=31536000, which Hostinger's hCDN caches
// while ignoring Vary: RSC — HTML and RSC payloads then share one cache slot
// per URL, breaking navigation (forced reloads) and page loads ("This page
// couldn't load" when an RSC payload gets served as the document).
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://lucaci.chomnenh.com";
const DESCRIPTION = "Chomnenh point of sale. Realtime sales, inventory and client management.";

// viewportFit=cover + the safe-area padding in globals.css keeps the layout
// clear of the iPad home indicator and rounded corners once installed.
// Zoom is left enabled on purpose: locking it is an accessibility failure and
// iOS ignores user-scalable=no anyway.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#304a59" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1520" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Chomnenh POS", template: "%s · Chomnenh" },
  description: DESCRIPTION,
  applicationName: "Chomnenh POS",
  manifest: "/manifest.webmanifest",
  // iOS reads these rather than the manifest for home-screen launches.
  appleWebApp: {
    capable: true,
    title: "Chomnenh",
    statusBarStyle: "default",
  },
  other: {
    // Next 16 renders appleWebApp.capable as the standardised
    // <meta name="mobile-web-app-capable">, which Safari only honours from
    // iOS 17.4. Older iPads need the apple-prefixed tag or they launch the
    // home-screen icon in a browser window instead of a standalone one.
    "apple-mobile-web-app-capable": "yes",
  },
  // Stop iOS turning invoice numbers and totals into tel: links.
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Chomnenh",
    title: "Chomnenh POS",
    description: DESCRIPTION,
    images: [{ url: "/images/Chomnenh-banner.jpg", width: 1920, height: 1080, alt: "Chomnenh" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chomnenh POS",
    description: DESCRIPTION,
    images: ["/images/Chomnenh-banner.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions inject attributes into <body> before React hydrates */}
      <body
        suppressHydrationWarning
        className={`${firaSans.variable} ${firaCode.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <ServiceWorkerRegistrar />
          <AuthProvider>{children}</AuthProvider>
          {/* Swipe/drag to dismiss; visual style lives in globals.css on the app's
              surface tokens so toasts follow light/dark automatically.
              stacked: toasts pile on top of each other with the newest in front
              (hover/tap expands) instead of pushing a growing column downward */}
          <ToastContainer
            position="top-right"
            autoClose={2000}
            stacked
            newestOnTop
            closeOnClick
            draggable
            draggablePercent={30}
            limit={3}
            theme="light"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
