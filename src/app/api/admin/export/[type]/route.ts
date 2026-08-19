import { NextRequest, NextResponse } from "next/server";
import { getCurrentActor } from "@/server/auth/session";
import { requireAdmin } from "@/server/domain/authorization";
import { isDomainError } from "@/server/domain/errors";
import {
  exportRows,
  parseExportFormat,
  parseExportType,
  toCsv,
  toXlsx,
} from "@/server/domain/export";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const actor = await getCurrentActor();
    requireAdmin(actor);
  } catch (error) {
    const status = isDomainError(error) ? error.status : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  const { type } = await params;
  const exportType = parseExportType(type);
  if (exportType === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const activityId = request.nextUrl.searchParams.get("activityId") ?? undefined;
  const seasonId = request.nextUrl.searchParams.get("seasonId") ?? undefined;
  const format = parseExportFormat(request.nextUrl.searchParams.get("format"));
  const payload = await exportRows(exportType, { activityId, seasonId });

  if (format === "xlsx") {
    const body = toXlsx(payload.rows, payload.sheetName);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${payload.filenameBase}.xlsx"`,
      },
    });
  }

  return new NextResponse(toCsv(payload.rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${payload.filenameBase}.csv"`,
    },
  });
}
