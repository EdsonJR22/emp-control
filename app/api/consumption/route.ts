import { getConsumptionData } from "../../../db/storage";
import { apiErrorResponse } from "../../../lib/api-response";
import { authorizeApiRequest } from "../../../lib/auth";
import { ConsumptionInputError } from "../../../lib/consumption";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeApiRequest(request);
    if (!auth.ok) return auth.response;
    const params = new URL(request.url).searchParams;
    const data = await getConsumptionData({
      period: params.get("period") ?? undefined,
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
    });
    return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ConsumptionInputError) {
      return Response.json({ error: error.message, code: "INVALID_PERIOD" }, {
        status: 400, headers: { "Cache-Control": "private, no-store" },
      });
    }
    return apiErrorResponse(error);
  }
}
