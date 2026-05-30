import BoxSDK from 'box-node-sdk';
import { bedrockResponse, errorResponse, parseBody } from '../shared/response.js';

function getBoxClient() {
  return BoxSDK.getPreconfiguredInstance(JSON.parse(process.env.BOX_CONFIG_JSON)).getAppAuthClient(
    'user',
    process.env.BOX_USER_ID,
  );
}

export const handler = async (event) => {
  try {
    const { fileId, access, collaboratorEmail, role } = parseBody(event);

    if (!fileId) return errorResponse(event, 400, 'Missing required field: fileId');

    const client = getBoxClient();

    if (collaboratorEmail) {
      const collab = await client.collaborations.createWithUserEmail(
        collaboratorEmail,
        { type: 'file', id: fileId },
        role ?? 'viewer',
      );
      return bedrockResponse(event, 200, `Shared "${fileId}" with ${collaboratorEmail}`, {
        collaborationId: collab.id,
        collaboratorEmail,
        role: collab.role,
      });
    }

    const updated = await client.files.update(fileId, {
      shared_link: { access: access ?? 'company' },
    });

    return bedrockResponse(event, 200, 'Shared link created', {
      fileId,
      sharedLink: updated.shared_link.url,
      access: updated.shared_link.access,
    });
  } catch (err) {
    return errorResponse(event, 500, err.message);
  }
};
