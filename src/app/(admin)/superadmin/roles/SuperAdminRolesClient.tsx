"use client";

import React, { useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Tooltip from "@mui/material/Tooltip";
import Divider from "@mui/material/Divider";
import LockIcon from "@mui/icons-material/Lock";
import SaveIcon from "@mui/icons-material/Save";
import type { Json } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Role {
  id: string;
  name: string;
  permissions: Json;
  updated_at: string;
}

interface Props {
  initialRoles: Role[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Core permissions that must never be removed from the super_admin role.
 * These match the server-side guard in PATCH /api/roles/:id.
 * Requirements: 19.3
 */
const SUPER_ADMIN_CORE_PERMISSIONS = new Set([
  "manage_admins",
  "manage_roles",
  "view_audit_logs",
  "manage_backups",
  "manage_settings",
]);

/**
 * All known permissions in the system, with human-readable labels.
 * Derived from the design and requirements.
 */
const ALL_PERMISSIONS: { key: string; label: string; description: string }[] =
  [
    {
      key: "manage_admins",
      label: "Manage Admins",
      description: "Create, activate, and deactivate admin accounts",
    },
    {
      key: "manage_roles",
      label: "Manage Roles",
      description: "View and modify role permissions",
    },
    {
      key: "view_audit_logs",
      label: "View Audit Logs",
      description: "Access and filter audit log entries",
    },
    {
      key: "manage_backups",
      label: "Manage Backups",
      description: "Trigger database backups and view backup history",
    },
    {
      key: "manage_settings",
      label: "Manage Settings",
      description: "Update global website settings and maintenance mode",
    },
    {
      key: "manage_bookings",
      label: "Manage Bookings",
      description: "Approve, cancel, and reschedule member bookings",
    },
    {
      key: "manage_courts",
      label: "Manage Courts",
      description: "Create and update courts, set unavailable dates",
    },
    {
      key: "manage_content",
      label: "Manage Content",
      description: "Edit public-facing website content sections",
    },
    {
      key: "manage_gallery",
      label: "Manage Gallery",
      description: "Upload, delete, and reorder gallery images",
    },
    {
      key: "manage_members",
      label: "Manage Members",
      description: "View and activate/deactivate member accounts",
    },
    {
      key: "view_reports",
      label: "View Reports",
      description: "View and export booking and activity reports",
    },
    {
      key: "manage_messages",
      label: "Manage Messages",
      description: "Read and reply to contact form submissions",
    },
    {
      key: "make_booking",
      label: "Make Bookings",
      description: "Create and cancel court reservations",
    },
  ];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roleDisplayName(name: string): string {
  const map: Record<string, string> = {
    member: "Member",
    admin: "Admin",
    super_admin: "Super Admin",
  };
  return map[name] ?? name;
}

function roleChipColor(
  name: string
): "default" | "primary" | "secondary" | "error" | "warning" | "success" | "info" {
  const map: Record<string, "default" | "primary" | "secondary" | "error" | "warning" | "success" | "info"> = {
    member: "default",
    admin: "primary",
    super_admin: "error",
  };
  return map[name] ?? "default";
}

/**
 * Coerce the JSON permissions stored in the DB into Record<string, boolean>.
 */
function parsePermissions(raw: Json): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, Json>)) {
    result[k] = v === true;
  }
  return result;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Super Admin — Roles Client Component
//
// Renders each role as a card with an inline permission toggle editor.
// The super_admin role's core permissions are locked (disabled checkboxes
// with a lock icon) per Requirements 19.3.
//
// Requirements: 19.1, 19.2, 19.3
// ---------------------------------------------------------------------------

export default function SuperAdminRolesClient({ initialRoles }: Props) {
  // Local state: a map from roleId → current permissions (mutable)
  const [permissionsMap, setPermissionsMap] = useState<
    Record<string, Record<string, boolean>>
  >(() => {
    const init: Record<string, Record<string, boolean>> = {};
    for (const role of initialRoles) {
      init[role.id] = parsePermissions(role.permissions);
    }
    return init;
  });

  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [roleErrors, setRoleErrors] = useState<Record<string, string>>({});
  const [snack, setSnack] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const clearRoleError = useCallback((id: string) => {
    setRoleErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  function handlePermissionToggle(
    roleId: string,
    roleName: string,
    permKey: string,
    checked: boolean
  ) {
    // Guard: never allow unchecking a core super_admin permission in the UI
    if (roleName === "super_admin" && SUPER_ADMIN_CORE_PERMISSIONS.has(permKey)) {
      return;
    }
    clearRoleError(roleId);
    setPermissionsMap((prev) => ({
      ...prev,
      [roleId]: {
        ...prev[roleId],
        [permKey]: checked,
      },
    }));
  }

  async function handleSave(role: Role) {
    if (savingRole) return;
    clearRoleError(role.id);
    setSavingRole(role.id);

    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: permissionsMap[role.id] }),
      });

      const json = (await res.json()) as { data?: Role; error?: string };

      if (!res.ok) {
        setRoleErrors((prev) => ({
          ...prev,
          [role.id]: json.error ?? "Failed to update permissions.",
        }));
        return;
      }

      setSnack({
        message: `Permissions for ${roleDisplayName(role.name)} updated successfully.`,
        severity: "success",
      });
    } catch {
      setSnack({
        message: "An unexpected error occurred.",
        severity: "error",
      });
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <Box>
      {/* ===================================================================
          Roles count header
      =================================================================== */}
      <Typography variant="h6" component="h2" fontWeight={700} sx={{ mb: 3 }}>
        Roles{" "}
        <Typography
          component="span"
          variant="body2"
          color="text.secondary"
          fontWeight={400}
        >
          ({initialRoles.length})
        </Typography>
      </Typography>

      {initialRoles.length === 0 ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ py: 4, textAlign: "center" }}
        >
          No roles found.
        </Typography>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" },
            gap: 3,
          }}
        >
          {initialRoles.map((role) => {
            const currentPerms = permissionsMap[role.id] ?? {};
            const isSaving = savingRole === role.id;
            const roleError = roleErrors[role.id];
            const isSuperAdmin = role.name === "super_admin";

            return (
              <Card
                key={role.id}
                variant="outlined"
                sx={{ borderRadius: 2 }}
                aria-label={`Permissions card for ${roleDisplayName(role.name)}`}
              >
                {/* -----------------------------------------------------------
                    Card Header — role name + chip + last-updated
                ----------------------------------------------------------- */}
                <CardHeader
                  title={
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      <Typography variant="h6" fontWeight={700} component="span">
                        {roleDisplayName(role.name)}
                      </Typography>
                      <Chip
                        label={role.name}
                        color={roleChipColor(role.name)}
                        size="small"
                        variant="outlined"
                      />
                      {isSuperAdmin && (
                        <Tooltip title="Core permissions are locked to prevent system lockout">
                          <Chip
                            icon={<LockIcon fontSize="small" />}
                            label="Has locked permissions"
                            size="small"
                            color="warning"
                            variant="outlined"
                          />
                        </Tooltip>
                      )}
                    </Box>
                  }
                  subheader={
                    <Typography
                      variant="caption"
                      color="text.secondary"
                    >
                      Last updated: {formatDate(role.updated_at)}
                    </Typography>
                  }
                  sx={{ pb: 0 }}
                />

                <Divider sx={{ mt: 1.5 }} />

                {/* -----------------------------------------------------------
                    Inline error
                ----------------------------------------------------------- */}
                {roleError && (
                  <Box sx={{ px: 2, pt: 2 }}>
                    <Alert
                      severity="error"
                      onClose={() => clearRoleError(role.id)}
                    >
                      {roleError}
                    </Alert>
                  </Box>
                )}

                {/* -----------------------------------------------------------
                    Permissions grid
                ----------------------------------------------------------- */}
                <CardContent>
                  <FormGroup
                    aria-label={`Permissions for ${roleDisplayName(role.name)}`}
                  >
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr",
                          sm: "repeat(2, 1fr)",
                        },
                        gap: 0.5,
                      }}
                    >
                      {ALL_PERMISSIONS.map((perm) => {
                        const isCorePermission =
                          isSuperAdmin &&
                          SUPER_ADMIN_CORE_PERMISSIONS.has(perm.key);
                        const isChecked = currentPerms[perm.key] === true;

                        return (
                          <Tooltip
                            key={perm.key}
                            title={
                              isCorePermission
                                ? `Locked: ${perm.description} — core super_admin permission`
                                : perm.description
                            }
                            placement="top"
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={isChecked}
                                    disabled={isCorePermission || isSaving}
                                    onChange={(e) =>
                                      handlePermissionToggle(
                                        role.id,
                                        role.name,
                                        perm.key,
                                        e.target.checked
                                      )
                                    }
                                    size="small"
                                    inputProps={{
                                      "aria-label": `${perm.label} permission for ${roleDisplayName(role.name)}${isCorePermission ? " (locked)" : ""}`,
                                    }}
                                  />
                                }
                                label={
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                    }}
                                  >
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        color: isCorePermission
                                          ? "text.disabled"
                                          : "text.primary",
                                      }}
                                    >
                                      {perm.label}
                                    </Typography>
                                    {isCorePermission && (
                                      <LockIcon
                                        fontSize="inherit"
                                        sx={{
                                          color: "text.disabled",
                                          fontSize: "0.875rem",
                                        }}
                                        aria-label="Locked permission"
                                      />
                                    )}
                                  </Box>
                                }
                                sx={{ m: 0, width: "100%" }}
                                disabled={isCorePermission || isSaving}
                              />
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                  </FormGroup>

                  {/* ---------------------------------------------------------
                      Save button
                  --------------------------------------------------------- */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "flex-end",
                      mt: 2,
                    }}
                  >
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      onClick={() => void handleSave(role)}
                      disabled={isSaving}
                      startIcon={
                        isSaving ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <SaveIcon fontSize="small" />
                        )
                      }
                      aria-label={`Save permissions for ${roleDisplayName(role.name)}`}
                    >
                      {isSaving ? "Saving…" : "Save Changes"}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* =====================================================================
          Feedback Snackbar
      ===================================================================== */}
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
