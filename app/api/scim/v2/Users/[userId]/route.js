import { deleteScimUser, getScimUser, patchScimUser, replaceScimUser } from '../../../../../../lib/scim.js';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { userId } = await params;
  return getScimUser(request, decodeURIComponent(userId));
}

export async function PUT(request, { params }) {
  const { userId } = await params;
  return replaceScimUser(request, decodeURIComponent(userId));
}

export async function PATCH(request, { params }) {
  const { userId } = await params;
  return patchScimUser(request, decodeURIComponent(userId));
}

export async function DELETE(request, { params }) {
  const { userId } = await params;
  return deleteScimUser(request, decodeURIComponent(userId));
}
