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
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import MarkEmailReadOutlinedIcon from "@mui/icons-material/MarkEmailReadOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageStatus = "unread" | "replied" | "archived";

export interface ContactMessage {
  id: string;
  sender_name: string;
  sender_email: string;
  message: string;
  status: MessageStatus;
  created_at: string;
}

interface Props {
  initialMessages: ContactMessage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusChipProps(
  status: MessageStatus
): { label: string; color: "default" | "success" | "error" } {
  switch (status) {
    case "unread":   return { label: "Unread",   color: "default"  };
    case "replied":  return { label: "Replied",  color: "success"  };
    case "archived": return { label: "Archived", color: "error"    };
  }
}

// ---------------------------------------------------------------------------
// Message Detail Dialog
// ---------------------------------------------------------------------------

interface MessageDialogProps {
  open: boolean;
  message: ContactMessage | null;
  onClose: () => void;
  onAction: (id: string, action: "reply" | "archive") => void;
  actionLoading: string | null;
}

function MessageDialog({ open, message, onClose, onAction, actionLoading }: MessageDialogProps) {
  if (!message) return null;

  const isActioning = actionLoading === message.id;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="span" fontWeight={700}>
          Message from {message.sender_name}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>From:</strong> {message.sender_name} &lt;{message.sender_email}&gt;
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>Date:</strong> {formatDate(message.created_at)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Status:</strong>{" "}
              <Chip
                label={statusChipProps(message.status).label}
                color={statusChipProps(message.status).color}
                size="small"
                sx={{ ml: 0.5 }}
              />
            </Typography>
          </Box>
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 2, bgcolor: "grey.50" }}
          >
            <Typography
              variant="body2"
              sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
            >
              {message.message}
            </Typography>
          </Paper>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isActioning}>
          Close
        </Button>
        {message.status !== "archived" && (
          <Button
            onClick={() => onAction(message.id, "archive")}
            color="error"
            disabled={isActioning}
            startIcon={
              isActioning ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <ArchiveOutlinedIcon fontSize="small" />
              )
            }
          >
            Archive
          </Button>
        )}
        {message.status !== "replied" && message.status !== "archived" && (
          <Button
            onClick={() => onAction(message.id, "reply")}
            variant="contained"
            color="success"
            disabled={isActioning}
            startIcon={
              isActioning ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <MarkEmailReadOutlinedIcon fontSize="small" />
              )
            }
          >
            Mark Replied
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
//
// Renders a table of contact messages with:
//   - Toggle to show/hide archived messages (default: hidden — Req 15.1)
//   - Per-row mark replied / archive actions (Req 15.2, 15.3)
//   - Click row to view full message content in a dialog
// ---------------------------------------------------------------------------

/**
 * Admin Messages client component.
 *
 * Renders a DataTable of contact messages with:
 *   - Sender name, email, date, reply status columns
 *   - Default inbox hides archived messages (toggle to show all)
 *   - Per-row inline actions: Mark Replied, Archive
 *   - Click row to view full message in a dialog
 *
 * Requirements: 15.1, 15.2, 15.3
 */
export default function AdminMessagesClient({ initialMessages }: Props) {
  // ---- State ----------------------------------------------------------------
  const [messages, setMessages] = useState<ContactMessage[]>(initialMessages);
  const [showArchived, setShowArchived] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [snack, setSnack] = useState<{
    message: string;
    severity: "success" | "error" | "info";
  } | null>(null);
  const [, startTransition] = useTransition();

  // ---- Derived data ---------------------------------------------------------
  const visibleMessages = showArchived
    ? messages
    : messages.filter((m) => m.status !== "archived");

  // ---- Re-fetch all messages (non-archived) --------------------------------
  const refetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/contact");
      if (!res.ok) return;
      const json = (await res.json()) as { messages: ContactMessage[] };
      startTransition(() => setMessages(json.messages ?? []));
    } catch {
      // silently ignore re-fetch errors
    }
  }, [startTransition]);

  // ---- Patch local message state -------------------------------------------
  const updateLocalMessage = useCallback((updated: ContactMessage) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === updated.id ? updated : m))
    );
  }, []);

  // ---- Action handler -------------------------------------------------------
  const handleAction = useCallback(
    async (id: string, action: "reply" | "archive") => {
      if (actionLoading) return; // prevent concurrent actions
      setActionLoading(id);

      try {
        const res = await fetch(`/api/contact/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (!res.ok) {
          const err = (await res
            .json()
            .catch(() => ({} as { error?: string }))) as { error?: string };
          setSnack({
            message: err.error ?? `Failed to ${action} message.`,
            severity: "error",
          });
          return;
        }

        const json = (await res.json()) as { message: ContactMessage };
        updateLocalMessage(json.message);

        // Close the detail dialog if we actioned from there
        setSelectedMessage((prev) =>
          prev?.id === id ? json.message : prev
        );

        const label = action === "reply" ? "marked as replied" : "archived";
        setSnack({
          message: `Message ${label} successfully.`,
          severity: "success",
        });

        // Re-fetch if we archived so inbox count stays accurate
        if (action === "archive") {
          await refetchMessages();
        }
      } catch {
        setSnack({
          message: "An unexpected error occurred.",
          severity: "error",
        });
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, updateLocalMessage, refetchMessages]
  );

  // ---- Render ---------------------------------------------------------------

  return (
    <Box>
      {/* =====================================================================
          Toolbar — inbox toggle
      ===================================================================== */}
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
          Inbox{" "}
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            fontWeight={400}
          >
            ({visibleMessages.length})
          </Typography>
        </Typography>

        <FormControlLabel
          control={
            <Switch
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              size="small"
              inputProps={{ "aria-label": "Show archived messages" }}
            />
          }
          label={
            <Typography variant="body2" color="text.secondary">
              Show archived
            </Typography>
          }
          labelPlacement="start"
        />
      </Box>

      {/* =====================================================================
          Messages Table
      ===================================================================== */}
      <Card>
        <CardContent sx={{ pb: "16px !important" }}>
          {visibleMessages.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ py: 4, textAlign: "center" }}
            >
              {showArchived
                ? "No messages found."
                : 'No unread or replied messages. Toggle "Show archived" to see all.'}
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ borderRadius: 2 }}
            >
              <Table
                aria-label="Contact messages table"
                size="small"
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
                    <TableCell sx={{ fontWeight: 700 }}>Sender</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell
                      sx={{ fontWeight: 700, textAlign: "center" }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleMessages.map((msg) => {
                    const chip = statusChipProps(msg.status);
                    const isActioning = actionLoading === msg.id;

                    return (
                      <TableRow
                        key={msg.id}
                        hover
                        sx={{
                          cursor: "pointer",
                          "&:last-child td, &:last-child th": { border: 0 },
                          ...(msg.status === "unread" && {
                            bgcolor: "rgba(46,125,50,0.04)",
                          }),
                        }}
                        onClick={() => setSelectedMessage(msg)}
                        aria-label={`View message from ${msg.sender_name}`}
                      >
                        <TableCell>
                          <Typography
                            variant="body2"
                            fontWeight={
                              msg.status === "unread" ? 700 : 400
                            }
                            noWrap
                          >
                            {msg.sender_name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                          >
                            {msg.sender_email}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap>
                            {formatDate(msg.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={chip.label}
                            color={chip.color}
                            size="small"
                          />
                        </TableCell>
                        <TableCell
                          align="center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "center",
                              gap: 0.5,
                            }}
                          >
                            {/* Mark Replied */}
                            <Tooltip title="Mark as replied">
                              <span>
                                <IconButton
                                  size="small"
                                  color="success"
                                  aria-label={`Mark message from ${msg.sender_name} as replied`}
                                  disabled={
                                    isActioning ||
                                    msg.status === "replied" ||
                                    msg.status === "archived"
                                  }
                                  onClick={() =>
                                    void handleAction(msg.id, "reply")
                                  }
                                >
                                  {isActioning ? (
                                    <CircularProgress
                                      size={16}
                                      color="inherit"
                                    />
                                  ) : (
                                    <MarkEmailReadOutlinedIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>

                            {/* Archive */}
                            <Tooltip title="Archive message">
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  aria-label={`Archive message from ${msg.sender_name}`}
                                  disabled={
                                    isActioning ||
                                    msg.status === "archived"
                                  }
                                  onClick={() =>
                                    void handleAction(msg.id, "archive")
                                  }
                                >
                                  <ArchiveOutlinedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
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

      {/* =====================================================================
          Message Detail Dialog
      ===================================================================== */}
      <MessageDialog
        open={selectedMessage !== null}
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        onAction={(id, action) => void handleAction(id, action)}
        actionLoading={actionLoading}
      />

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
