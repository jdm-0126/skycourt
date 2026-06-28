"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardMedia from "@mui/material/CardMedia";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import LinearProgress from "@mui/material/LinearProgress";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import DeleteIcon from "@mui/icons-material/Delete";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ImageIcon from "@mui/icons-material/Image";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GalleryImage {
  id: string;
  storage_path: string;
  public_url: string;
  display_order: number;
  uploaded_by: string | null;
  created_at: string;
}

interface Props {
  initialImages: GalleryImage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Human-readable file size */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  open: boolean;
  imageUrl: string;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

function DeleteDialog({ open, imageUrl, onClose, onConfirm, loading }: DeleteDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Image</DialogTitle>
      <DialogContent>
        {imageUrl && (
          <Box
            sx={{
              position: "relative",
              width: "100%",
              height: 160,
              mb: 2,
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: "grey.100",
            }}
          >
            <Image
              src={imageUrl}
              alt="Image to delete"
              fill
              style={{ objectFit: "cover" }}
              sizes="(max-width: 444px) 100vw"
              unoptimized
            />
          </Box>
        )}
        <DialogContentText>
          Are you sure you want to delete this image? This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Client Component
//
// Features:
//   - Grid display of all gallery images
//   - Upload button: opens hidden file input, validates type/size client-side,
//     POSTs to /api/gallery, shows inline upload error on failure
//   - Delete button per image: opens confirmation dialog, calls DELETE /api/gallery/:id
//   - Up / Down arrows per image to reorder, calls PATCH /api/gallery/order
//
// Requirements: 14.1, 14.2, 14.3, 14.4
// ---------------------------------------------------------------------------

export default function AdminGalleryClient({ initialImages }: Props) {
  const [images, setImages] = useState<GalleryImage[]>(
    [...initialImages].sort((a, b) => a.display_order - b.display_order)
  );

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reorder state
  const [reordering, setReordering] = useState(false);

  // Snackbar
  const [snack, setSnack] = useState<{
    message: string;
    severity: "success" | "error" | "info";
  } | null>(null);

  // ---- Upload ----------------------------------------------------------------

  function handleUploadClick() {
    setUploadError(null);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset input so the same file can be re-selected after an error
    event.target.value = "";

    if (!file) return;

    // Client-side pre-validation (mirrors server checks for a faster UX)
    const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const MAX_SIZE = 5 * 1024 * 1024;

    if (file.size > MAX_SIZE) {
      setUploadError(
        `File too large (${formatBytes(file.size)}). Maximum allowed size is 5 MB.`
      );
      return;
    }

    if (!ACCEPTED.includes(file.type)) {
      setUploadError(
        "Unsupported file type. Please upload a JPEG, PNG, WebP, or GIF image."
      );
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/gallery", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string; code?: string }))) as {
          error?: string;
          code?: string;
        };

        if (err.code === "FILE_TOO_LARGE") {
          setUploadError("Upload failed: file exceeds the 5 MB size limit.");
        } else if (err.code === "UNSUPPORTED_TYPE") {
          setUploadError(
            "Upload failed: unsupported file type. Please use JPEG, PNG, WebP, or GIF."
          );
        } else {
          setUploadError(err.error ?? "Upload failed. Please try again.");
        }
        return;
      }

      const json = (await res.json()) as { image: GalleryImage };
      setImages((prev) =>
        [...prev, json.image].sort((a, b) => a.display_order - b.display_order)
      );
      setSnack({ message: "Image uploaded successfully.", severity: "success" });
    } catch {
      setUploadError("An unexpected error occurred. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  // ---- Delete ----------------------------------------------------------------

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/gallery/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        setSnack({
          message: err.error ?? "Failed to delete image.",
          severity: "error",
        });
        return;
      }

      setImages((prev) => prev.filter((img) => img.id !== deleteTarget.id));
      setSnack({ message: "Image deleted successfully.", severity: "success" });
      setDeleteTarget(null);
    } catch {
      setSnack({ message: "An unexpected error occurred.", severity: "error" });
    } finally {
      setDeleting(false);
    }
  }

  // ---- Reorder ---------------------------------------------------------------

  async function moveImage(index: number, direction: "up" | "down") {
    const newImages = [...images];
    const swapIndex = direction === "up" ? index - 1 : index + 1;

    if (swapIndex < 0 || swapIndex >= newImages.length) return;

    // Swap positions
    [newImages[index], newImages[swapIndex]] = [
      newImages[swapIndex],
      newImages[index],
    ];

    // Reassign display_order to match array position
    const reordered = newImages.map((img, i) => ({
      ...img,
      display_order: i,
    }));

    // Optimistic update
    setImages(reordered);
    setReordering(true);

    try {
      const res = await fetch("/api/gallery/order", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((img) => img.id) }),
      });

      if (!res.ok) {
        // Revert on failure
        setImages(images);
        const err = (await res.json().catch(() => ({} as { error?: string }))) as {
          error?: string;
        };
        setSnack({
          message: err.error ?? "Failed to update order.",
          severity: "error",
        });
      }
    } catch {
      // Revert on network error
      setImages(images);
      setSnack({ message: "An unexpected error occurred.", severity: "error" });
    } finally {
      setReordering(false);
    }
  }

  // ---- Render ----------------------------------------------------------------

  return (
    <Box>
      {/* =====================================================================
          Toolbar
      ===================================================================== */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Gallery Images{" "}
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              fontWeight={400}
            >
              ({images.length})
            </Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            Upload, delete, or reorder images. Changes are saved immediately.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={
            uploading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <AddPhotoAlternateIcon />
            )
          }
          onClick={handleUploadClick}
          disabled={uploading}
          aria-label="Upload new image"
        >
          {uploading ? "Uploading…" : "Upload Image"}
        </Button>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={(e) => void handleFileSelected(e)}
          aria-hidden="true"
        />
      </Box>

      {/* =====================================================================
          Upload progress indicator
      ===================================================================== */}
      {uploading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress aria-label="Uploading image…" />
        </Box>
      )}

      {/* =====================================================================
          Inline upload error
      ===================================================================== */}
      {uploadError && (
        <Alert
          severity="error"
          onClose={() => setUploadError(null)}
          sx={{ mb: 3 }}
          role="alert"
        >
          {uploadError}
        </Alert>
      )}

      {/* =====================================================================
          Reorder in-progress indicator
      ===================================================================== */}
      {reordering && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress color="secondary" aria-label="Saving order…" />
        </Box>
      )}

      {/* =====================================================================
          Empty state
      ===================================================================== */}
      {images.length === 0 && !uploading && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 10,
            border: "2px dashed",
            borderColor: "divider",
            borderRadius: 2,
            color: "text.secondary",
            gap: 1,
          }}
          aria-label="No gallery images"
        >
          <ImageIcon sx={{ fontSize: 48, opacity: 0.4 }} />
          <Typography variant="body1">No images yet.</Typography>
          <Typography variant="body2">
            Click "Upload Image" to add the first photo.
          </Typography>
        </Box>
      )}

      {/* =====================================================================
          Image grid
      ===================================================================== */}
      {images.length > 0 && (
        <Grid
          container
          spacing={2}
          component="ol"
          aria-label="Gallery images"
          sx={{ listStyle: "none", pl: 0, m: 0 }}
        >
          {images.map((image, index) => (
            <Grid
              item
              key={image.id}
              xs={12}
              sm={6}
              md={4}
              lg={3}
              component="li"
            >
              <Card
                sx={{
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  border: "1px solid",
                  borderColor: "divider",
                }}
                aria-label={`Gallery image ${index + 1}`}
              >
                {/* Image preview */}
                <CardMedia
                  sx={{
                    position: "relative",
                    height: 200,
                    bgcolor: "grey.100",
                    flexShrink: 0,
                  }}
                >
                  <Image
                    src={image.public_url}
                    alt={`Gallery image ${index + 1}`}
                    fill
                    style={{ objectFit: "cover" }}
                    sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, (max-width: 1200px) 33vw, 25vw"
                    unoptimized
                  />
                  {/* Order badge */}
                  <Box
                    sx={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      bgcolor: "rgba(0,0,0,0.55)",
                      color: "#fff",
                      borderRadius: 1,
                      px: 0.75,
                      py: 0.25,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      lineHeight: 1.5,
                      userSelect: "none",
                    }}
                    aria-hidden="true"
                  >
                    #{index + 1}
                  </Box>
                </CardMedia>

                {/* Actions */}
                <CardActions
                  sx={{
                    justifyContent: "space-between",
                    px: 1,
                    py: 0.5,
                    mt: "auto",
                  }}
                >
                  {/* Reorder arrows */}
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Move up">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Move image ${index + 1} up`}
                          disabled={index === 0 || reordering}
                          onClick={() => void moveImage(index, "up")}
                        >
                          <KeyboardArrowUpIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move down">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Move image ${index + 1} down`}
                          disabled={index === images.length - 1 || reordering}
                          onClick={() => void moveImage(index, "down")}
                        >
                          <KeyboardArrowDownIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>

                  {/* Delete */}
                  <Tooltip title="Delete image">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Delete image ${index + 1}`}
                      onClick={() => setDeleteTarget(image)}
                      disabled={deleting}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* =====================================================================
          Delete Confirmation Dialog
      ===================================================================== */}
      <DeleteDialog
        open={deleteTarget !== null}
        imageUrl={deleteTarget?.public_url ?? ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
        loading={deleting}
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
