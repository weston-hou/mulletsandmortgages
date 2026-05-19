export default function Privacy() {
  return (
    <main className="min-h-screen gradient-bg px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-amber-400 text-sm hover:underline mb-8 inline-block">← Back</a>
        <h1 className="text-3xl font-black text-white mb-2">Privacy Policy</h1>
        <p className="text-zinc-500 text-sm mb-8">Last updated: May 18, 2026</p>
        <div className="text-zinc-400 space-y-6 text-sm leading-relaxed">

          <section>
            <h2 className="text-white font-bold text-base mb-2">Information We Collect</h2>
            <p>Mullets &amp; Mortgages / BrokerBoyko LLC collects the personal information you provide — including your name, email address, phone number, and loan details — solely for the purpose of connecting you with mortgage rate quotes and loan services.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">How We Use Your Information</h2>
            <p>Your information is used to provide mortgage rate quotes, facilitate your loan application, and communicate with you about your inquiry. We may share your data with lending partners and service providers for the purpose of providing rate quotes and loan services.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Text Messaging</h2>
            <p>By checking the consent box on our form, you agree to receive automated text messages and AI-generated voice calls from Zachary Boyko (BrokerBoyko LLC, NMLS #2004025) regarding your mortgage inquiry.</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-zinc-500">
              <li><strong className="text-zinc-400">Message frequency:</strong> Message frequency varies based on your inquiry and stage in the mortgage process.</li>
              <li><strong className="text-zinc-400">Msg &amp; data rates may apply</strong> depending on your mobile carrier plan.</li>
              <li><strong className="text-zinc-400">To get help:</strong> Reply HELP to any text message.</li>
              <li><strong className="text-zinc-400">To opt out:</strong> Reply STOP to any text message at any time. You will receive one confirmation and no further automated messages.</li>
            </ul>
            <p className="mt-3 text-zinc-500">
              <strong className="text-zinc-400">We do not share, sell, or rent your mobile phone number to third parties for their marketing purposes.</strong> Your mobile number is used only to contact you about your mortgage inquiry with BrokerBoyko LLC.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Data Sharing</h2>
            <p>We do not sell your personal information to third parties. Your data may be shared with mortgage lenders and service providers as necessary to process your rate request and loan application.</p>
          </section>

          <section>
            <h2 className="text-white font-bold text-base mb-2">Contact</h2>
            <p>For questions about this privacy policy or your data, contact us at{" "}
              <a href="mailto:zboyko@adaxahome.com" className="text-amber-400 hover:underline">zboyko@adaxahome.com</a>.
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
