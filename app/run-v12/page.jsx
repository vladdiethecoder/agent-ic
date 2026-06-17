import AgentICRunConsoleV12 from '../../components/AgentICRunConsole-v12.jsx';

export const dynamic = 'force-dynamic';

export default async function RunV12Page({ searchParams }) {
  const params = await searchParams;
  const recording = params?.recording === '1';
  return <AgentICRunConsoleV12 recording={recording} />;
}
