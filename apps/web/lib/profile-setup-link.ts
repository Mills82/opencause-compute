import { isNodeAuthorized } from './node-auth';
import { withDb } from './db';
import { issueProfileSetupToken } from './gamification/profile-setup';
import { createPrivateVolunteerProfileForNode } from './gamification/profiles';

export async function issueNodeProfileSetupTokenLocal(nodeId: string, token: string | null): Promise<string> {
  return withDb((db) => {
    if (!isNodeAuthorized(db, nodeId, token)) throw new Error('node_unauthorized');
    const link = db.volunteerProfileNodes.find((candidate) => candidate.nodeId === nodeId && !candidate.detachedAt);
    const profile = link
      ? db.volunteerProfiles.find((candidate) => candidate.id === link.volunteerProfileId)
      : createPrivateVolunteerProfileForNode(db, nodeId);
    if (!profile) throw new Error('profile_not_found');
    return issueProfileSetupToken(profile);
  });
}
