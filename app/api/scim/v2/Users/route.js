import { createScimUser, listScimUsers } from '../../../../../lib/scim.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return listScimUsers(request);
}

export async function POST(request) {
  return createScimUser(request);
}
