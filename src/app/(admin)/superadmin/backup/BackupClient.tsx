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
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import BackupIcon from "@mui/icons-material/Backup";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackupRecord {
  id: string;
  triggered_by: string | null;
  status: "in_progress" | "completed" | "failed";
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  users: { full_name: string | null; email: string } | null;
}

interface Props {
  initialHistory: BackupRecord[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(dateStr: string | null): string {
  if (!dateStr) return "—";
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

function statusChipProps(status: BackupRecord["status"]): {
  label: string;
  color: "default" | "success" | "error" | "warning";
  icon: React.ReactElement;
} {
  switch (status) {
    case "completed":
      return {
        label: "Completed",
        color: "success",
        icon: <CheckCircleOutlineIcon fontSize="small" />,
      };
    case "failed":
      return {
        label: "Failed",
        color: "error",
        icon: <ErrorOutlineIcon fontSize="small" />,
      };
    case "in_progress":
    default:
      return {
        label: "In Progress",
        color: "warning",
        icon: <HourglassEmptyIcon fontSize="small" />,
      };
  }
}

// ---------------------------------------------------------------------------
// Backup Client Component
//
// Provides a manual backup trigger button, live status display, and the
// backup history table.
//
// Requirements: 21.1, 21.2, 21.3, 21.4
// ---------------------------------------------------------------------------

/**
 * Super Admin — Backup client component.
 *
 * Features:
 *   - "Trigger Backup" button that POSTs to /api/backup
 *   - Inline status display while backup is running (in_progress)
 *   - Latest backup result card showing status, timestamps, and error details
 *   - Full backup history table (most recent first)
 *   - "Refresh History" button to re-poll GET /api/backup
 *
 * Requirements: 21.1, 21.2, 21.3, 21.4
 */
export default function BackupClient({ initialHistory }: Props) {
  // ---- State ----------------------------------------------------------------
  const [history, setHistory] = useState<BackupRecord[]>(initialHistory);
  const [triggering, setTriggering] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [latestResult, setLatestResult] = useState<BackupRecord | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ---- Trigger backup -------------------------------------------------------
  const handleTriggerBackup = useCallback(async () => {
    setTriggering(true);
    setTriggerError(null);
    setLatestResult(null);

    try {
      const res = await fetch("/api/backup", { method: "POST" });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        setTriggerError(
          json.error ?? "Backup trigger failed. Please try again."
        );
        return;
      }

      const json = (await res.json()) as { data: BackupRecord };
      const record = json.data;

      startTransition(() => {
        setLatestResult(record);
        // Prepend the new record to history (replace if same id already present)
        setHistory((prev) => {
          const filtered = prev.filter((r) => r.id !== record.id);
          return [record, ...filtered];
        });
      });
    } catch {
      setTriggerError("An unexpected error occurred. Please try again.");
    } finally {
      setTriggering(false);
    }
  }, [startTransition]);

  // ---- Refresh history ------------------------------------------------------
  const handleRefreshHistory = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);

    try {
      const res = await fetch("/api/backup");

      if (!res.ok) {
        const json = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        setRefreshError(
          json.error ?? "Failed to refresh backup history."
        );
        return;
      }

      const json = (await res.json()) as {
        data: BackupRecord[];
        count: number;
      };
      startTransition(() => setHistory(json.data ?? []));
    } catch {
      setRefreshError("An unexpected error occurred while refreshing.");
    } finally {
      setRefreshing(false);
    }
  }, [startTransition]);

  // ---- Render ---------------------------------------------------------------
  return (
    <Box>
      {/* =====================================================================
          Trigger Backup Section (Req 21.1)
      ===================================================================== */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            Manual Backup
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Trigger a Supabase database export. The backup will scan all
            application tables and record completion status atomically.
          </Typography>

          <Button
            variant="contained"
            color="primary"
            size="medium"
            onClick={() => void handleTriggerBackup()}
            disabled={triggering}
            startIcon={
              triggering ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <BackupIcon />
              )
            }
            aria-label="Trigger database backup"
            aria-busy={triggering}
          >
            {triggering ? "Backup In Progress…" : "Trigger Backup"}
          </Button>
        </CardContent>
      </Card>

      {/* =====================================================================
          Trigger error banner
      ===================================================================== */}
      {triggerError && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          onClose={() => setTriggerError(null)}
        >
          {triggerError}
        </Alert>
      )}

      {/* =====================================================================
          Latest Backup Result Card (Req 21.2, 21.3, 21.4)
      ===================================================================== */}
      {latestResult && (
        <Card
          variant="outlined"
          sx={{
            mb: 3,
            borderColor:
              latestResult.status === "completed"
                ? "success.main"
                : latestResult.status === "failed"
                  ? "error.main"
                  : "warning.main",
          }}
        >
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
              Latest Backup Result
            </Typography>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
                gap: 2,
              }}
            >
              {/* Status */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mb: 0.5 }}
                >
                  Status
                </Typography>
                {(() => {
                  const props = statusChipProps(latestResult.status);
                  return (
                    <Chip
                      label={props.label}
                      color={props.color}
                      icon={props.icon}
                      size="small"
                    />
                  );
                })()}
              </Box>

              {/* Started At */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mb: 0.5 }}
                >
                  Started At
                </Typography>
                <Typography variant="body2" fontFamily="monospace">
                  {formatTimestamp(latestResult.started_at)}
                </Typography>
              </Box>

              {/* Completed At */}
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mb: 0.5 }}
                >
                  Completed At
                </Typography>
                <Typography variant="body2" fontFamily="monospace">
                  {formatTimestamp(latestResult.completed_at)}
                </Typography>
              </Box>
            </Box>

            {/* Error message (Req 21.4) */}
            {latestResult.status === "failed" && latestResult.error_message && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Alert severity="error" icon={<ErrorOutlineIcon />}>
                  <Typography variant="body2" fontWeight={600}>
                    Failure reason:
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5, fontFamily: "monospace" }}>
                    {latestResult.error_message}
                  </Typography>
                </Alert>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* =====================================================================
          Backup History Table (Req 21.2)
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
          Backup History{" "}
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            fontWeight={400}
          >
            ({history.length})
          </Typography>
        </Typography>

        <Button
          variant="outlined"
          size="small"
          color="inherit"
          onClick={() => void handleRefreshHistory()}
          disabled={refreshing}
          startIcon={
            refreshing ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <RefreshIcon fontSize="small" />
            )
          }
          aria-label="Refresh backup history"
          aria-busy={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </Box>

      {/* Refresh error */}
      {refreshError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setRefreshError(null)}
        >
          {refreshError}
        </Alert>
      )}

      <Card>
        <CardContent sx={{ pb: "16px !important" }}>
          {history.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ py: 4, textAlign: "center" }}
            >
              No backup records found. Trigger a backup to get started.
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              <Table
                aria-label="Backup history table"
                size="small"
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      Started At
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                      Completed At
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Triggered By</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      Error / Notes
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((record) => {
                    const chip = statusChipProps(record.status);
                    return (
                      <TableRow
                        key={record.id}
                        hover
                        sx={{
                          "&:last-child td, &:last-child th": { border: 0 },
                        }}
                      >
                        {/* Started At */}
                        <TableCell>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{
                              fontFamily: "monospace",
                              fontSize: "0.75rem",
                            }}
                          >
                            {formatTimestamp(record.started_at)}
                          </Typography>
                        </TableCell>

                        {/* Completed At */}
                        <TableCell>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{
                              fontFamily: "monospace",
                              fontSize: "0.75rem",
                            }}
                          >
                            {formatTimestamp(record.completed_at)}
                          </Typography>
                        </TableCell>

                        {/* Status chip */}
                        <TableCell>
                          <Chip
                            label={chip.label}
                            color={chip.color}
                            icon={chip.icon}
                            size="small"
                          />
                        </TableCell>

                        {/* Triggered By */}
                        <TableCell>
                          {record.users ? (
                            <Box>
                              <Typography
                                variant="body2"
                                fontWeight={600}
                                noWrap
                              >
                                {record.users.full_name ?? "—"}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                component="p"
                              >
                                {record.users.email}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              noWrap
                            >
                              {record.triggered_by ?? "—"}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Error message or dash */}
                        <TableCell>
                          {record.error_message ? (
                            <Typography
                              variant="body2"
                              color="error.main"
                              sx={{
                                fontFamily: "monospace",
                                fontSize: "0.72rem",
                                maxWidth: 320,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={record.error_message}
                            >
                              {record.error_message}
                            </Typography>
                          ) : (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                            >
                              —
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
