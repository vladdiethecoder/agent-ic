import Link from 'next/link';

export const metadata = { title: 'Mock Stripe Checkout — Agent IC' };

export default async function MockStripeCheckout({ searchParams }) {
  const params = await searchParams;
  const session = params?.session || 'cs_test_agent_ic_demo';
  return (
    <main className="mock-checkout-page">
      <section className="mock-checkout-card">
        <div className="eyebrow">Stripe demo mode</div>
        <h1>Mock Checkout Session created</h1>
        <p>
          Agent IC created a safe demo checkout session instead of touching live money. Set
          <code> STRIPE_SECRET_KEY </code> and <code> AGENT_IC_DEMO_MODE=false </code> to create a real
          Stripe-hosted Checkout Session from <code>/api/stripe-session</code>.
        </p>
        <div className="stripe-result">
          <span>SESSION</span>
          <strong>{session}</strong>
          <small>status=open · payment_status=unpaid · metadata includes proposal_id and governance_policy</small>
        </div>
        <Link className="primary" href="/">Return to Agent IC</Link>
      </section>
    </main>
  );
}
