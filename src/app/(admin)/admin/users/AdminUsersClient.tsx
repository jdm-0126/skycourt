"use client";

import React, { useState, useCallback } from "react";
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
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import PersonOffIcon from "@mui/icons-material/PersonOff";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserStatus = "active" | "inactive";

export interface AdminUser {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  status: UserStatus;
  contact_number: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialUsers: AdminUser[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusChipProps(
  status: UserStatus
): { label: string; color: "success" | "default" } {
  return status === "active"
    ? { label: "Active", color: "success" }
    : { label: "Inactive", color: "default" };
}

// ---------------------------------------------------------------------------
// Admin Users Client Component
//
// Renders a data table of all member accounts with per-row activate/deactivate
// actions. On 409 response (account already active), shows an inline alert
// in the affected row rather than a toast.
//
// Requirements: 17.1, 17.2, 17.3
// ---------------------------------------------------------------------------

export default function AdminUsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Map of userId → inline error message (for 409 conflicts)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [snack, setSnack] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const clearRowError = useCallback((id: string) => {
    setRowErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  async function handleStatusChange(
    user: AdminUser,
    action: "activate" | "deactivate"
  ) {
    if (actionLoading) return;
    clearRowError(user.id);
    setActionLoading(user.id);

    try {
      const res = await fetch(`/api/users/${user.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.status === 409) {
        // Inline error — account is already active (req 17.3)
        setRowErrors((prev) => ({
          ...prev,
          [user.id]: "Account is already active",
        }));
        return;
      }

      if (!res.ok) {
        const err = (await res
          .json()
          .catch(() => ({} as { error?: string }))) as { error?: string };
        setSnack({
          message: err.error ?? "Failed to update account status.",
          severity: "error",
        });
        return;
      }

      const json = (await res.json()) as { data: AdminUser };
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, ...json.data } : u))
      );
      setSnack({
        message:
          action === "activate"
            ? "Account activated successfully."
            : "Account deactivated successfully.",
        severity: "success",
      });
    } catch {
      setSnack({
        message: "An unexpected error occurred.",
        severity: "error",
      });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <Box>
      <Card>
        <CardContent sx={{ pb: "16px !important" }}>
          <Typography variant="h6" component="h2" fontWeight={700} mb={2}>
            All Members{" "}
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              fontWeight={400}
            >
              ({users.length})
            </Typography>
          </Typography>

          {users.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ py: 4, textAlign: "center" }}
            >
              No member accounts found.
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              <Table aria-label="Members table" size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      Registration Date
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, textAlign: "center" }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((user) => {
                    const chip = statusChipProps(user.status);
                    const isActioning = actionLoading === user.id;
                    const rowError = rowErrors[user.id];

                    return (
                      <React.Fragment key={user.id}>
                        <TableRow
                          hover
                          sx={{
                            "&:last-child td, &:last-child th": { border: 0 },
                          }}
                        >
                          <TableCell>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              noWrap
                            >
                              {user.full_name ?? "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              noWrap
                            >
                              {user.email}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap>
                              {formatDate(user.created_at)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={chip.label}
                              color={chip.color}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "center",
                                gap: 0.5,
                              }}
                            >
                              {/* Activate */}
                              <Tooltip title="Activate account">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="success"
                                    aria-label={`Activate account for ${user.full_name ?? user.email}`}
                                    disabled={
                                      isActioning ||
                                      user.status === "active"
                                    }
                                    onClick={() =>
                                      void handleStatusChange(user, "activate")
                                    }
                                  >
                                    {isActioning ? (
                                      <CircularProgress
                                        size={16}
                                        color="inherit"
                                      />
                                    ) : (
                                      <PersonAddAltIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>

                              {/* Deactivate */}
                              <Tooltip title="Deactivate account">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label={`Deactivate account for ${user.full_name ?? user.email}`}
                                    disabled={
                                      isActioning ||
                                      user.status === "inactive"
                                    }
                                    onClick={() =>
                                      void handleStatusChange(
                                        user,
                                        "deactivate"
                                      )
                                    }
                                  >
                                    <PersonOffIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>

                        {/* Inline error row — shown on 409 conflict (req 17.3) */}
                        {rowError && (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              sx={{ py: 0, border: 0 }}
                            >
                              <Alert
                                severity="warning"
                                onClose={() => clearRowError(user.id)}
                                sx={{ borderRadius: 0, py: 0.5 }}
                              >
                                {rowError}
                              </Alert>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Feedback Snackbar */}
      <Snackbar
        open={snack !== null}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity ?? "info"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
