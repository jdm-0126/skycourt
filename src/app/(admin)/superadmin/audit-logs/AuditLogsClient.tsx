"use client";

import React, { useState, useCallback, useTransition } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import FilterListIcon from "@mui/icons-material/FilterList";
import ClearIcon from "@mui/icons-material/Clear";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action_type: string;
  affected_record_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  users: { full_name: string | null; email: string } | null;
}

interface Props {
  initialEntries: AuditLogEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_TYPE_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "user_login", label: "User Login" },
  { value: "user_logout", label: "User Logout" },
  { value: "booking_created", label: "Booking Created" },
  { value: "booking_cancelled", label: "Booking Cancelled" },
  { value: "booking_cancellation", label: "Booking Cancellation" },
  { value: "booking_approval", label: "Booking Approved" },
  { value: "admin_created", label: "Admin Created" },
  { value: "admin_account_created", label: "Admin Account Created" },
  { value: "role_permission_changed", label: "Role Permission Changed" },
  { value: "database_backup", label: "Database Backup" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionTypeChipColor(
  actionType: string
): "default" | "success" | "error" | "warning" | "info" {
  if (actionType.includes("login") || actionType.includes("logout")) return "info";
  if (actionType.includes("booking_created") || actionType.includes("booking_approval") || actionType.includes("admin_created") || actionType.includes("admin_account_created")) return "success";
  if (actionType.includes("cancel") || actionType.includes("backup")) return "warning";
  if (actionType.includes("role") || actionType.includes("permission")) return "error";
  return "default";
}

function formatActionTypeLabel(actionType: string): string {
  return actionType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface FilterState {
  startDate: string;
  endDate: string;
  userId: string;
  actionType: string;
}

const DEFAULT_FILTERS: FilterState = {
  startDate: "",
  endDate: "",
  userId: "",
  actionType: "",
};

// ---------------------------------------------------------------------------
// Audit Logs Client Component
//
// Renders a DataTable of audit log entries with filter controls.
//
// Requirements: 20.1, 20.2, 20.3
// ---------------------------------------------------------------------------

/**
 * Super Admin Audit Logs client component.
 *
 * Renders a DataTable of audit log entries with:
 *   - Filter controls: date range, user ID, action type
 *   - Columns: Timestamp, User, Action Type, Affected Record ID
 *   - Fetches from GET /api/audit-logs with filter params on demand
 *
 * Requirements: 20.2, 20.3
 */
export default function AuditLogsClient({ initialEntries }: Props) {
  // ---- State ----------------------------------------------------------------
  const [entries, setEntries] = useState<AuditLogEntry[]>(initialEntries);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ---- Filter helpers -------------------------------------------------------
  const handleDraftChange = useCallback(
    (field: keyof FilterState, value: string) => {
      setDraftFilters((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  // ---- Fetch entries with current filters ----------------------------------
  const fetchEntries = useCallback(async (activeFilters: FilterState) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (activeFilters.startDate) params.set("startDate", activeFilters.startDate);
      if (activeFilters.endDate) params.set("endDate", activeFilters.endDate);
      if (activeFilters.userId.trim()) params.set("userId", activeFilters.userId.trim());
      if (activeFilters.actionType) params.set("actionType", activeFilters.actionType);

      const url = `/api/audit-logs${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url);

      if (!res.ok) {
        const json = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        setError(json.error ?? "Failed to fetch audit logs.");
        return;
      }

      const json = (await res.json()) as { data: AuditLogEntry[]; count: number };
      startTransition(() => setEntries(json.data ?? []));
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [startTransition]);

  // ---- Apply filters --------------------------------------------------------
  const handleApplyFilters = useCallback(() => {
    setFilters(draftFilters);
    void fetchEntries(draftFilters);
  }, [draftFilters, fetchEntries]);

  // ---- Clear filters --------------------------------------------------------
  const handleClearFilters = useCallback(() => {
    const cleared = DEFAULT_FILTERS;
    setDraftFilters(cleared);
    setFilters(cleared);
    void fetchEntries(cleared);
  }, [fetchEntries]);

  // ---- Derived ---------------------------------------------------------------
  const hasActiveFilters =
    filters.startDate !== "" ||
    filters.endDate !== "" ||
    filters.userId !== "" ||
    filters.actionType !== "";

  // ---- Render ---------------------------------------------------------------

  return (
    <Box>
      {/* =====================================================================
          Filter Controls (Req 20.3)
      ===================================================================== */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ mb: 2, display: "flex", alignItems: "center", gap: 0.5 }}
          >
            <FilterListIcon fontSize="small" />
            Filter Logs
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "1fr 1fr",
                md: "1fr 1fr 1fr 1fr",
              },
              gap: 2,
              mb: 2,
            }}
          >
            {/* Start Date */}
            <TextField
              label="Start Date"
              type="date"
              value={draftFilters.startDate}
              onChange={(e) => handleDraftChange("startDate", e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ "aria-label": "Filter by start date" }}
            />

            {/* End Date */}
            <TextField
              label="End Date"
              type="date"
              value={draftFilters.endDate}
              onChange={(e) => handleDraftChange("endDate", e.target.value)}
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              inputProps={{ "aria-label": "Filter by end date" }}
            />

            {/* User ID */}
            <TextField
              label="User ID"
              placeholder="Enter user UUID"
              value={draftFilters.userId}
              onChange={(e) => handleDraftChange("userId", e.target.value)}
              size="small"
              fullWidth
              inputProps={{ "aria-label": "Filter by user ID" }}
            />

            {/* Action Type */}
            <TextField
              select
              label="Action Type"
              value={draftFilters.actionType}
              onChange={(e) => handleDraftChange("actionType", e.target.value)}
              size="small"
              fullWidth
              inputProps={{ "aria-label": "Filter by action type" }}
            >
              {ACTION_TYPE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={handleApplyFilters}
              disabled={loading}
              startIcon={
                loading ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <FilterListIcon fontSize="small" />
                )
              }
              aria-label="Apply filters"
            >
              Apply Filters
            </Button>

            {hasActiveFilters && (
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                onClick={handleClearFilters}
                disabled={loading}
                startIcon={<ClearIcon fontSize="small" />}
                aria-label="Clear all filters"
              >
                Clear
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* =====================================================================
          Error Banner
      ===================================================================== */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* =====================================================================
          Results Table (Req 20.2)
      ===================================================================== */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 1.5,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="h6" component="h2" fontWeight={700}>
          Audit Log Entries{" "}
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            fontWeight={400}
          >
            ({entries.length})
          </Typography>
        </Typography>
      </Box>

      <Card>
        <CardContent sx={{ pb: "16px !important" }}>
          {loading && entries.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : entries.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ py: 4, textAlign: "center" }}
            >
              No audit log entries found
              {hasActiveFilters ? " matching the current filters." : "."}
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              <Table aria-label="Audit log entries table" size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      Timestamp
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Action Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      Affected Record ID
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      hover
                      sx={{
                        "&:last-child td, &:last-child th": { border: 0 },
                      }}
                    >
                      {/* Timestamp */}
                      <TableCell>
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                        >
                          {formatTimestamp(entry.created_at)}
                        </Typography>
                      </TableCell>

                      {/* User */}
                      <TableCell>
                        {entry.users ? (
                          <Box>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              noWrap
                            >
                              {entry.users.full_name ?? "—"}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              noWrap
                              component="p"
                            >
                              {entry.users.email}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                          >
                            {entry.user_id ?? "System"}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Action Type */}
                      <TableCell>
                        <Chip
                          label={formatActionTypeLabel(entry.action_type)}
                          color={actionTypeChipColor(entry.action_type)}
                          size="small"
                          sx={{ fontFamily: "monospace", fontSize: "0.7rem" }}
                        />
                      </TableCell>

                      {/* Affected Record ID */}
                      <TableCell>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          noWrap
                          sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
                        >
                          {entry.affected_record_id ?? "—"}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
