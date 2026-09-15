import { createAnnulment } from "../../../../../db/storage";
import { apiErrorResponse } from "../../../../../lib/api-response";
import { authorizeApiRequest } from "../../../../../lib/auth";
import type { CreateAnnulmentPayload } from "../../../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeApiRequest(request);
    if (!auth.ok) return auth.response;
    const { id } = await context.params;
    const payload = (await request.json()) as CreateAnnulmentPayload;
    const annulment = await createAnnulment(id, payload, auth.username);
    return Response.json({ annulment }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
