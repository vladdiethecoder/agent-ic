import AgentICRunConsoleV14 from '../../components/AgentICRunConsole-v14.jsx';

export const dynamic = 'force-dynamic';

export default async function RunV14Page({ searchParams }) {
  const params = await searchParams;
  const recording = params?.recording === '1';
  const noAutoRun = params?.noAutoRun === '1';
  return <AgentICRunConsoleV14 recording={recording} noAutoRun={noAutoRun} />;
}
