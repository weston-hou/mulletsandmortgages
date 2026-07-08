/**
 * app/hibernated/page.tsx
 * Minimal contact card served for every page while the site is hibernated
 * (see proxy.ts). No forms, no funnel — just who to contact.
 */

export const metadata = {
  title: "Zachary Boyko · BrokerBoyko LLC",
  description: "Zachary Boyko, Mortgage Broker · NMLS #2004025 · BrokerBoyko LLC · NMLS #2380533",
};

export default function HibernatedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="text-center space-y-2">
        <h1 className="text-white text-2xl font-bold">Zachary Boyko</h1>
        <p className="text-zinc-400 text-sm">Mortgage Broker · NMLS #2004025</p>
        <p className="text-zinc-400 text-sm">BrokerBoyko LLC · NMLS #2380533</p>
        <p className="text-zinc-300 text-sm pt-3">
          <a href="mailto:zboyko@adaxahome.com" className="underline hover:text-white">
            zboyko@adaxahome.com
          </a>
          {" · "}
          <a href="tel:+16024101334" className="underline hover:text-white">
            602-410-1334
          </a>
        </p>
        <p className="text-zinc-600 text-xs pt-4">Equal Housing Lender</p>
      </div>
    </main>
  );
}
