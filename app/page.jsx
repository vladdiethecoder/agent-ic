import AgentICApp from '../components/AgentICApp.jsx';
import AgentICRecordingCockpit from '../components/AgentICRecordingCockpit.jsx';
import { seededProposals } from '../lib/demoData.js';

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const isRecording = params?.recording === '1' || params?.recording === 'true';
  const initialProposal = seededProposals[0];

  if (isRecording) {
    return <AgentICRecordingCockpit initialProposal={initialProposal} recordingMode={true} />;
  }

  return <AgentICApp initialProposal={initialProposal} initialEvaluation={null} showRunLink={true} />;
}
