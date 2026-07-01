export const PLAYBOOK_SLUG = 'governed-agentic-service-trial';
export const DEFAULT_PLAYBOOK_VERSION = 'v1';

export function playbookFilename(version = DEFAULT_PLAYBOOK_VERSION) {
  return `${PLAYBOOK_SLUG}-${version}.SKILL.md`;
}

export function playbookPublicPath(version = DEFAULT_PLAYBOOK_VERSION) {
  return `skills/${playbookFilename(version)}`;
}

export function playbookArtifactPath(version = DEFAULT_PLAYBOOK_VERSION) {
  return `.agent-ic/artifacts/${playbookFilename(version)}`;
}
