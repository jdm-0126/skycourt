"use client";

import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import FormHelperText from "@mui/material/FormHelperText";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import SaveIcon from "@mui/icons-material/Save";
import BuildIcon from "@mui/icons-material/Build";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemSettings {
  site_name: string;
  contact_email: string;
  maintenance_mode: boolean;
}

interface Props {
  initialSettings: SystemSettings;
}

// ---------------------------------------------------------------------------
// Website Settings Client Component
//
// Form for updating global system settings: site name, contact email, and
// maintenance mode toggle.
//
// Uses React Hook Form + Zod for validation, submits via PATCH /api/settings.
//
// Requirements: 22.1, 22.2, 22.3
// ---------------------------------------------------------------------------

export default function WebsiteSettingsClient({ initialSettings }: Props) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{
    message: string;
    severity: "success" | "error";
  } | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      site_name: initialSettings.site_name,
      contact_email: initialSettings.contact_email,
      maintenance_mode: initialSettings.maintenance_mode,
    },
  });

  const maintenanceMode = watch("maintenance_mode");

  // ---- Submit ---------------------------------------------------------------
  async function onSubmit(data: SettingsInput) {
    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = (await res.json()) as {
        data?: SystemSettings;
        error?: string;
      };

      if (!res.ok) {
        setSaveError(json.error ?? "Failed to save settings. Please try again.");
        return;
      }

      if (json.data) {
        // Reset form dirty state with the newly saved values
        reset({
          site_name: json.data.site_name,
          contact_email: json.data.contact_email,
          maintenance_mode: json.data.maintenance_mode,
        });
      }

      setSnack({
        message: "Settings saved successfully.",
        severity: "success",
      });
    } catch {
      setSaveError("An unexpected error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <Box
      component="form"
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      noValidate
      aria-label="System settings form"
    >
      {/* =====================================================================
          General Settings Card
      ===================================================================== */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
            General
          </Typography>

          {/* Site Name */}
          <TextField
            {...register("site_name")}
            label="Site Name"
            fullWidth
            required
            margin="normal"
            disabled={saving}
            error={!!errors.site_name}
            helperText={
              errors.site_name?.message ??
              "The name displayed in the browser tab and email footers."
            }
            inputProps={{ maxLength: 200 }}
          />

          {/* Contact Email */}
          <TextField
            {...register("contact_email")}
            label="Contact Email"
            type="email"
            fullWidth
            required
            margin="normal"
            disabled={saving}
            error={!!errors.contact_email}
            helperText={
              errors.contact_email?.message ??
              "The email address displayed on the public Contact Us page."
            }
            inputProps={{ maxLength: 200 }}
          />
        </CardContent>
      </Card>

      {/* =====================================================================
          Maintenance Mode Card
      ===================================================================== */}
      <Card
        variant="outlined"
        sx={{
          mb: 3,
          borderColor: maintenanceMode ? "warning.main" : "divider",
          transition: "border-color 0.2s",
        }}
      >
        <CardContent>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <BuildIcon
              fontSize="small"
              color={maintenanceMode ? "warning" : "action"}
            />
            <Typography variant="subtitle1" fontWeight={700}>
              Maintenance Mode
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            When enabled, all public pages are replaced with a maintenance
            message. Guests and Members will be unable to access the site.
            Admin and Super Admin accounts are not affected.
          </Typography>

          <Divider sx={{ mb: 2 }} />

          <Controller
            name="maintenance_mode"
            control={control}
            render={({ field }) => (
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={field.value ?? false}
                      onChange={(e) => field.onChange(e.target.checked)}
                      disabled={saving}
                      color="warning"
                      inputProps={{
                        "aria-label": "Toggle maintenance mode",
                      }}
                    />
                  }
                  label={
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={
                        field.value ? "warning.dark" : "text.secondary"
                      }
                    >
                      {field.value
                        ? "Maintenance mode is ON — public access is restricted"
                        : "Maintenance mode is OFF — public access is normal"}
                    </Typography>
                  }
                />
                {errors.maintenance_mode && (
                  <FormHelperText error>
                    {errors.maintenance_mode.message}
                  </FormHelperText>
                )}
              </Box>
            )}
          />

          {maintenanceMode && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Saving will immediately restrict public access to the website.
              Ensure you are ready before proceeding.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* =====================================================================
          Save error banner
      ===================================================================== */}
      {saveError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setSaveError(null)}
        >
          {saveError}
        </Alert>
      )}

      {/* =====================================================================
          Save button
      ===================================================================== */}
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
          disabled={saving || !isDirty}
          startIcon={
            saving ? (
              <CircularProgress size={18} color="inherit" />
            ) : (
              <SaveIcon />
            )
          }
          aria-label="Save settings"
          aria-busy={saving}
        >
          {saving ? "Saving…" : "Save Settings"}
        </Button>
      </Box>

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
          severity={snack?.severity ?? "success"}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snack?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
