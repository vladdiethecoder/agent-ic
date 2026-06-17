import './globals.css';

export const metadata = {
  title: 'Agent IC — Hermes/Nemotron AI Pilot Investment Committee',
  description:
    'Live Hermes hackathon demo: evaluate enterprise AI pilot proposals, scope budgets, authorize Stripe spend, measure ROI evidence, and make kill/continue decisions with audit logs.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
