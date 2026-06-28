import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Range = "daily" | "weekly" | "monthly";
type ExportFormat = "xlsx" | "pdf";

interface BookingPerCourt {
  courtName: string;
  count: number;
}

interface PeakHour {
  hour: number;
  count: number;
}

interface ReportData {
  range: Range;
  totalBookings: number;
  bookingsPerCourt: BookingPerCourt[];
  peakHours: PeakHour[];
  cancelledCount: number;
  newMemberRegistrations: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an ISO date string (YYYY-MM-DD) for the start of the range. */
function getRangeStart(range: Range): string {
  const now = new Date();
  if (range === "daily") {
    return now.toISOString().slice(0, 10);
  }
  if (range === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(now);
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

/** Returns today's ISO date string (YYYY-MM-DD). */
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Compute report metrics from the database for the given range. */
async function computeMetrics(range: Range): Promise<ReportData | null> {
  const adminClient = createAdminClient();
  const rangeStart = getRangeStart(range);
  const today = getToday();

  const { data: bookings, error: bookingsError } = await adminClient
    .from("bookings")
    .select("id, court_id, start_time, status, courts(name)")
    .gte("booking_date", rangeStart)
    .lte("booking_date", today);

  if (bookingsError) return null;

  const { data: newMembers, error: membersError } = await adminClient
    .from("users")
    .select("id")
    .eq("role", "member")
    .gte("created_at", `${rangeStart}T00:00:00.000Z`);

  if (membersError) return null;

  const rows = bookings ?? [];

  const totalBookings = rows.length;
  const cancelledCount = rows.filter((b) => b.status === "cancelled").length;

  const courtCountMap = new Map<string, number>();
  for (const b of rows) {
    const courtName =
      (b.courts as { name: string } | null)?.name ?? "Unknown Court";
    courtCountMap.set(courtName, (courtCountMap.get(courtName) ?? 0) + 1);
  }
  const bookingsPerCourt: BookingPerCourt[] = Array.from(
    courtCountMap.entries()
  )
    .map(([courtName, count]) => ({ courtName, count }))
    .sort((a, b) => b.count - a.count);

  const hourCountMap = new Map<number, number>();
  for (const b of rows) {
    if (b.start_time) {
      const hour = parseInt(b.start_time.slice(0, 2), 10);
      if (!isNaN(hour)) {
        hourCountMap.set(hour, (hourCountMap.get(hour) ?? 0) + 1);
      }
    }
  }
  const peakHours: PeakHour[] = Array.from(hourCountMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  return {
    range,
    totalBookings,
    bookingsPerCourt,
    peakHours,
    cancelledCount,
    newMemberRegistrations: (newMembers ?? []).length,
  };
}

// ---------------------------------------------------------------------------
// XLSX generator
// ---------------------------------------------------------------------------

function generateXlsx(data: ReportData): Buffer {
  const workbook = XLSX.utils.book_new();

  // --- Summary sheet ---
  const summaryRows = [
    { Metric: "Report Range", Value: data.range },
    { Metric: "Total Bookings", Value: data.totalBookings },
    { Metric: "Cancelled Bookings", Value: data.cancelledCount },
    { Metric: "New Member Registrations", Value: data.newMemberRegistrations },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  // --- Bookings per Court sheet ---
  const courtRows = data.bookingsPerCourt.map((c) => ({
    "Court Name": c.courtName,
    "Booking Count": c.count,
  }));
  const courtSheet = XLSX.utils.json_to_sheet(
    courtRows.length > 0 ? courtRows : [{ "Court Name": "N/A", "Booking Count": 0 }]
  );
  XLSX.utils.book_append_sheet(workbook, courtSheet, "Bookings Per Court");

  // --- Peak Hours sheet ---
  const peakRows = data.peakHours.map((h) => ({
    "Hour (0-23)": h.hour,
    "Booking Count": h.count,
  }));
  const peakSheet = XLSX.utils.json_to_sheet(
    peakRows.length > 0 ? peakRows : [{ "Hour (0-23)": "N/A", "Booking Count": 0 }]
  );
  XLSX.utils.book_append_sheet(workbook, peakSheet, "Peak Hours");

  // Write to Buffer
  const arrayBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;

  return arrayBuffer;
}

// ---------------------------------------------------------------------------
// PDF generator
// ---------------------------------------------------------------------------

function generatePdf(data: ReportData): Buffer {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Sky Court — Activity Report", pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`Range: ${data.range.toUpperCase()}`, pageWidth / 2, y, { align: "center" });
  y += 12;

  // Summary section
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Summary", 14, y);
  y += 7;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  const summaryRows: [string, string | number][] = [
    ["Total Bookings", data.totalBookings],
    ["Cancelled Bookings", data.cancelledCount],
    ["New Member Registrations", data.newMemberRegistrations],
  ];

  for (const [label, value] of summaryRows) {
    doc.text(`${label}:`, 14, y);
    doc.text(String(value), 100, y);
    y += 6;
  }

  y += 6;

  // Bookings per Court section
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Bookings Per Court", 14, y);
  y += 7;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Court Name", 14, y);
  doc.text("Count", 140, y);
  y += 5;

  doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth - 14, y);
  y += 4;

  doc.setFont("helvetica", "normal");

  if (data.bookingsPerCourt.length === 0) {
    doc.text("No data for this period.", 14, y);
    y += 6;
  } else {
    for (const { courtName, count } of data.bookingsPerCourt) {
      doc.text(courtName, 14, y);
      doc.text(String(count), 140, y);
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    }
  }

  y += 6;

  // Peak Hours section
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Peak Booking Hours", 14, y);
  y += 7;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Hour (0–23)", 14, y);
  doc.text("Booking Count", 100, y);
  y += 5;

  doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth - 14, y);
  y += 4;

  doc.setFont("helvetica", "normal");

  if (data.peakHours.length === 0) {
    doc.text("No data for this period.", 14, y);
    y += 6;
  } else {
    for (const { hour, count } of data.peakHours) {
      const label = `${String(hour).padStart(2, "0")}:00`;
      doc.text(label, 14, y);
      doc.text(String(count), 100, y);
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    }
  }

  // jsPDF output returns string | ArrayBuffer depending on type parameter
  const pdfOutput = doc.output("arraybuffer");
  return Buffer.from(pdfOutput);
}

// ---------------------------------------------------------------------------
// Route Handler
// ---------------------------------------------------------------------------

/**
 * GET /api/reports/export
 *
 * Generates and streams an XLSX or PDF file of the report for the selected
 * time range. Requires `admin` or `super_admin` role.
 *
 * Query parameters:
 *   format — "xlsx" | "pdf"              (required)
 *   range  — "daily" | "weekly" | "monthly"  (required)
 *
 * Returns:
 *   200 — file stream with appropriate Content-Type + Content-Disposition
 *   400 — invalid or missing params
 *   401 — no valid session
 *   403 — authenticated user is not admin or super_admin
 *   500 — generation or database error
 *
 * Requirements: 16.3, 16.4
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // 1. Authenticate via server client (reads session cookie)
  // -------------------------------------------------------------------------
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // -------------------------------------------------------------------------
  // 2. Authorise — must be admin or super_admin
  // -------------------------------------------------------------------------
  const role =
    (user.app_metadata?.role as string | undefined) ??
    (user.user_metadata?.role as string | undefined);

  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // -------------------------------------------------------------------------
  // 3. Validate query parameters
  // -------------------------------------------------------------------------
  const { searchParams } = request.nextUrl;
  const formatParam = searchParams.get("format");
  const rangeParam = searchParams.get("range");

  if (formatParam !== "xlsx" && formatParam !== "pdf") {
    return NextResponse.json(
      { error: "Invalid format. Must be 'xlsx' or 'pdf'" },
      { status: 400 }
    );
  }

  if (
    rangeParam !== "daily" &&
    rangeParam !== "weekly" &&
    rangeParam !== "monthly"
  ) {
    return NextResponse.json(
      { error: "Invalid range. Must be 'daily', 'weekly', or 'monthly'" },
      { status: 400 }
    );
  }

  const format = formatParam as ExportFormat;
  const range = rangeParam as Range;

  // -------------------------------------------------------------------------
  // 4. Compute metrics
  // -------------------------------------------------------------------------
  const data = await computeMetrics(range);

  if (!data) {
    return NextResponse.json(
      { error: "Failed to compute report metrics" },
      { status: 500 }
    );
  }

  // -------------------------------------------------------------------------
  // 5. Generate file and stream response
  // -------------------------------------------------------------------------
  if (format === "xlsx") {
    let fileBuffer: Buffer;
    try {
      fileBuffer = generateXlsx(data);
    } catch {
      return NextResponse.json(
        { error: "Failed to generate XLSX report" },
        { status: 500 }
      );
    }

    const body = new Uint8Array(fileBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="report-${range}.xlsx"`,
        "Content-Length": String(body.byteLength),
      },
    });
  }

  // format === "pdf"
  let fileBuffer: Buffer;
  try {
    fileBuffer = generatePdf(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate PDF report" },
      { status: 500 }
    );
  }

  const body = new Uint8Array(fileBuffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${range}.pdf"`,
      "Content-Length": String(body.byteLength),
    },
  });
}
