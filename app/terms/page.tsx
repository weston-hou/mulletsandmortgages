import Link from "next/link";

export default function Terms() {
  return (
    <main className="min-h-screen gradient-bg px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-amber-400 text-sm hover:underline mb-8 inline-block">← Back</Link>
        <h1 className="text-3xl font-black text-white mb-6">Terms &amp; Conditions</h1>
        <div className="text-zinc-400 space-y-4 text-sm leading-relaxed">
          <p>By using mulletsandmortgages.com, you agree to these terms. This site is operated by BrokerBoyko LLC, an independent mortgage brokerage.</p>
          <p>This site is for informational purposes and lead generation only. Nothing on this site constitutes a commitment to lend. Rates and terms are subject to change and qualification.</p>
          <p>Zachary Boyko, NMLS #2004025. BrokerBoyko LLC, NMLS #2380533. Equal Housing Lender.</p>
          <p>For questions, contact: zboyko@adaxahome.com · 602-410-1334</p>
        </div>
      </div>
    </main>
  );
}
