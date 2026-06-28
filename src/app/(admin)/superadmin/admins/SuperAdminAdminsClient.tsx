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
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import AddIcon from "@mui/icons-material/Add";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminAccountStatus = "active" | "inactive";

export interface AdminAccount {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  status: AdminAccountStatus;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialAdmins: AdminAccount[];
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
  status: AdminAccountStatus
): { label: string; color: "success" | "default" } {
  return status === "active"
    ? { label: "Active", color: "success" }
    : { label: "Inactive", color: "default" };
}

// ---------------------------------------------------------------------------
// Create Admin Dialog
// ---------------------------------------------------------------------------

interface CreateAdminDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (admin: AdminAccount) => void;
}

function CreateAdminDialog({ open, onClose, onCreated }: CreateAdminDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setError(null);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/users/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });

      const json = (await res.json()) as { data?: AdminAccount; error?: string };

      if (!res.ok) {
        setError(json.error ?? "Failed to create admin account.");
        return;
      }

      if (json.data) {
        onCreated(json.data);
        handleClose();
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="span" fontWeight={700}>
          Create Admin Account
        </Typography>
      </DialogTitle>

      <Box component="form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <DialogContent sx={{ pt: 1, pb: 1 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            autoFocus
            margin="normal"
            disabled={loading}
            inputProps={{ maxLength: 100 }}
          />

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            margin="normal"
            disabled={loading}
            inputProps={{ maxLength: 200 }}
          />

          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            margin="normal"
            disabled={loading}
            helperText="Minimum 8 characters"
            inputProps={{ minLength: 8, maxLength: 72 }}
          />
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading || !name.trim() || !email.trim() || password.length < 8}
            startIcon={
              loading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <AddIcon fontSize="small" />
              )
            }
          >
            Create
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Super Admin — Admins Client Component
//
// Renders a table of all admin accounts with activate/deactivate actions and
// a button to create a new admin.
//
// Requirements: 18.1, 18.2, 18.3, 18.4
// ---------------------------------------------------------------------------

export default function SuperAdminAdminsClient({ initialAdmins }: Props) {
  const [admins, setAdmins] = useState<AdminAccount[]>(initialAdmins);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
    admin: AdminAccount,
    action: "activate" | "deactivate"
  ) {
    if (actionLoading) return;
    clearRowError(admin.id);
    setActionLoading(admin.id);

    try {
      const res = await fetch(`/api/users/${admin.id}/admin-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (res.status === 409) {
        setRowErrors((prev) => ({
          ...prev,
          [admin.id]: "Account is already active.",
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

      const json = (await res.json()) as { data: AdminAccount };
      setAdmins((prev) =>
        prev.map((a) => (a.id === admin.id ? { ...a, ...json.data } : a))
      );
      setSnack({
        message:
          action === "activate"
            ? "Admin account activated successfully."
            : "Admin account deactivated successfully.",
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

  function handleAdminCreated(newAdmin: AdminAccount) {
    setAdmins((prev) => [newAdmin, ...prev]);
    setSnack({
      message: `Admin account for ${newAdmin.full_name ?? newAdmin.email} created successfully.`,
      severity: "success",
    });
  }

  return (
    <Box>
      {/* ===================================================================
          Toolbar
      =================================================================== */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="h6" component="h2" fontWeight={700}>
          Admin Accounts{" "}
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            fontWeight={400}
          >
            ({admins.length})
          </Typography>
        </Typography>

        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          aria-label="Create new admin account"
        >
          New Admin
        </Button>
      </Box>

      {/* ===================================================================
          Admins Table
      =================================================================== */}
      <Card>
        <CardContent sx={{ pb: "16px !important" }}>
          {admins.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ py: 4, textAlign: "center" }}
            >
              No admin accounts found.
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              <Table aria-label="Admin accounts table" size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, textAlign: "center" }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {admins.map((admin) => {
                    const chip = statusChipProps(admin.status);
                    const isActioning = actionLoading === admin.id;
                    const rowError = rowErrors[admin.id];

                    return (
                      <React.Fragment key={admin.id}>
                        <TableRow
                          hover
                          sx={{
                            "&:last-child td, &:last-child th": { border: 0 },
                          }}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={600} noWrap>
                              {admin.full_name ?? "—"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              noWrap
                            >
                              {admin.email}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap>
                              {formatDate(admin.created_at)}
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
                                    aria-label={`Activate account for ${admin.full_name ?? admin.email}`}
                                    disabled={
                                      isActioning || admin.status === "active"
                                    }
                                    onClick={() =>
                                      void handleStatusChange(admin, "activate")
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
                                    aria-label={`Deactivate account for ${admin.full_name ?? admin.email}`}
                                    disabled={
                                      isActioning ||
                                      admin.status === "inactive"
                                    }
                                    onClick={() =>
                                      void handleStatusChange(
                                        admin,
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

                        {/* Inline error row — shown on 409 conflict (req 18.4) */}
                        {rowError && (
                          <TableRow>
                            <TableCell colSpan={5} sx={{ py: 0, border: 0 }}>
                              <Alert
                                severity="warning"
                                onClose={() => clearRowError(admin.id)}
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

      {/* ===================================================================
          Create Admin Dialog
      =================================================================== */}
      <CreateAdminDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreated={handleAdminCreated}
      />

      {/* ===================================================================
          Feedback Snackbar
      =================================================================== */}
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
