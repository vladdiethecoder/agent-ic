import AgentICRunConsoleV11 from '../../components/AgentICRunConsole-v11.jsx';

export const dynamic = 'force-dynamic';

export default async function RunV11Page({ searchParams }) {
  const params = await searchParams;
  const recording = params?.recording === '1';
  return <AgentICRunConsoleV11 recording={recording} />;
}
