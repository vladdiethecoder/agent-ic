import './globals.css';

export const metadata = {
  title: 'Agent IC — Governed Agentic Service Procurement',
  description:
    'Evaluate agentic services before enterprise expansion with bounded spend envelopes, policy gates, workload evidence, and audit-backed decisions.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
