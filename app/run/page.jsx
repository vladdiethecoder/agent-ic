import AgentICRunConsole from '../../components/AgentICRunConsole.jsx';

export const dynamic = 'force-dynamic';

export default async function RunPage({ searchParams }) {
  const params = await searchParams;
  const recording = params?.recording === '1';
  return <AgentICRunConsole recording={recording} />;
}
