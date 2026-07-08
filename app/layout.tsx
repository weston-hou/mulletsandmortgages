import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mullets & Mortgages — Business in the Front, Savings in the Back",
  description:
    "Get a free mortgage rate quote in 60 seconds. Zach Boyko, independent mortgage broker — 150+ lenders, licensed in AZ, CA, TX, ID, PA, OH & FL. Business up front, savings in the back.",
  openGraph: {
    title: "Mullets & Mortgages",
    description: "Business in the front, savings in the back. Get your free rate quote now.",
    url: "https://mulletsandmortgages.com",
    siteName: "Mullets & Mortgages",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mullets & Mortgages",
    description: "Business in the front, savings in the back.",
  },
  metadataBase: new URL("https://mulletsandmortgages.com"),
  icons: {
    icon:  [{ url: "/favicon.ico" }, { url: "/icon.png", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

// Replace NEXT_PUBLIC_POSTHOG_KEY with your real PostHog project API key
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_REPLACE_ME";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* PostHog — loads async, won't block render */}
        <Script id="posthog-init" strategy="afterInteractive">
          {`
            !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]);t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
            posthog.init('${POSTHOG_KEY}', {
              api_host: '${POSTHOG_HOST}',
              capture_pageview: true,
              capture_pageleave: true,
              session_recording: {
                maskAllInputs: false,
                maskInputOptions: { password: true }
              },
              persistence: 'localStorage+cookie'
            });
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
