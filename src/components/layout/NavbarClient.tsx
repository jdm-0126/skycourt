"use client";

import { useState } from "react";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useScrollTrigger,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavLink {
  label: string;
  href: string;
}

export type UserRole = "member" | "admin" | "super_admin" | null;

export interface NavbarClientProps {
  /** Links always shown (Home, Locate Us, Contact Us). */
  commonLinks: NavLink[];
  /** Role-specific links (Book a Court, Dashboard, Admin Panel, Login, Register). */
  roleLinks: NavLink[];
  /** Whether a Logout button should be shown. */
  showLogout: boolean;
  /** Site name from system_settings (falls back to "Sky Court"). */
  siteName?: string;
  /** Display name of the logged-in user, null for guests. */
  displayName?: string | null;
  /** Current user role for badge display. */
  userRole?: UserRole;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns initials for the avatar chip (up to 2 chars). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/** Human-readable role badge label. */
function roleLabel(role: UserRole): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "member") return "Member";
  return "";
}

// ---------------------------------------------------------------------------
// NavbarClient
// ---------------------------------------------------------------------------

/**
 * Client component that renders the transparent/glass top AppBar and a
 * mobile drawer. The bar becomes solid on scroll.
 *
 * - Logo: uses the .png asset without forced colour inversion so colours
 *   display correctly against the glass backdrop.
 * - Site name: passed from server; sourced from system_settings.
 * - Logged-in user: shown as an avatar chip with name + role badge.
 *
 * Requirements: 23.1, 23.2, 23.3, 23.4
 */
export default function NavbarClient({
  commonLinks,
  roleLinks,
  showLogout,
  siteName = "Sky Court",
  displayName,
  userRole,
}: NavbarClientProps) {
  // Collapse into drawer below 768 px
  const isMobile = useMediaQuery("(max-width:767px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  // Become opaque once the user scrolls down 20 px
  const scrolled = useScrollTrigger({
    disableHysteresis: true,
    threshold: 20,
  });

  const allLinks = [...commonLinks, ...roleLinks];

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const toggleDrawer = (open: boolean) => () => setDrawerOpen(open);

  // ---------------------------------------------------------------------------
  // User identity chip (shown when logged in)
  // ---------------------------------------------------------------------------
  const userChip = displayName ? (
    <Tooltip title={`Logged in as ${displayName}${userRole ? ` (${roleLabel(userRole)})` : ""}`}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, ml: 1 }}>
        <Avatar
          sx={{
            width: 30,
            height: 30,
            fontSize: "0.75rem",
            fontWeight: 700,
            bgcolor: "rgba(255,255,255,0.25)",
            color: "#fff",
            border: "1.5px solid rgba(255,255,255,0.6)",
          }}
        >
          {initials(displayName)}
        </Avatar>
        {!isMobile && (
          <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <Typography
              variant="caption"
              sx={{ color: "#fff", fontWeight: 600, lineHeight: 1.2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {displayName}
            </Typography>
            {userRole && (
              <Typography
                variant="caption"
                sx={{ color: "rgba(255,255,255,0.7)", fontSize: "0.65rem", lineHeight: 1 }}
              >
                {roleLabel(userRole)}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Tooltip>
  ) : null;

  // ---------------------------------------------------------------------------
  // Desktop nav links
  // ---------------------------------------------------------------------------
  const desktopLinks = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {commonLinks.map((link) => (
        <Button
          key={link.href}
          component={Link}
          href={link.href}
          sx={{
            fontSize: "0.875rem",
            color: "#fff",
            fontWeight: 500,
            "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
          }}
        >
          {link.label}
        </Button>
      ))}

      {roleLinks.map((link) => (
        <Button
          key={link.href}
          component={Link}
          href={link.href}
          sx={{
            fontSize: "0.875rem",
            color: "#fff",
            fontWeight: 500,
            "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
          }}
        >
          {link.label}
        </Button>
      ))}

      {/* User identity */}
      {userChip}

      {showLogout && (
        <Button
          onClick={handleLogout}
          sx={{
            fontSize: "0.875rem",
            color: "#fff",
            fontWeight: 500,
            border: "1px solid rgba(255,255,255,0.45)",
            ml: 0.5,
            "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,0.12)" },
          }}
        >
          Logout
        </Button>
      )}
    </Box>
  );

  // ---------------------------------------------------------------------------
  // Mobile drawer
  // ---------------------------------------------------------------------------
  const mobileDrawer = (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={toggleDrawer(false)}
      slotProps={{ paper: { sx: { width: 280 } } }}
    >
      {/* Drawer header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          background: "linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)",
          color: "#fff",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Image
            src="/assets/sky-court-logo.png"
            alt={`${siteName} logo`}
            width={40}
            height={40}
            style={{
              objectFit: "contain",
              filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))",
            }}
          />
          <Typography variant="subtitle1" fontWeight={700} sx={{ color: "#fff" }}>
            {siteName}
          </Typography>
        </Box>
        <IconButton
          color="inherit"
          onClick={toggleDrawer(false)}
          aria-label="Close navigation menu"
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Logged-in user info in drawer */}
      {displayName && (
        <>
          <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5, bgcolor: "grey.50" }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", fontSize: "0.8rem", fontWeight: 700 }}>
              {initials(displayName)}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight={600}>{displayName}</Typography>
              {userRole && (
                <Chip
                  label={roleLabel(userRole)}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
            </Box>
          </Box>
          <Divider />
        </>
      )}

      <List disablePadding>
        {allLinks.map((link) => (
          <ListItem key={link.href} disablePadding>
            <ListItemButton
              component={Link}
              href={link.href}
              onClick={toggleDrawer(false)}
            >
              <ListItemText primary={link.label} />
            </ListItemButton>
          </ListItem>
        ))}

        {showLogout && (
          <>
            <Divider sx={{ my: 1 }} />
            <ListItem disablePadding>
              <ListItemButton
                onClick={async () => {
                  setDrawerOpen(false);
                  await handleLogout();
                }}
              >
                <ListItemText
                  primary="Logout"
                  slotProps={{ primary: { color: "error" } }}
                />
              </ListItemButton>
            </ListItem>
          </>
        )}
      </List>
    </Drawer>
  );

  // ---------------------------------------------------------------------------
  // AppBar styles — transparent glass on top, solid on scroll
  // ---------------------------------------------------------------------------
  const appBarSx = {
    // Glass background when at top, solid primary when scrolled
    backgroundColor: scrolled
      ? "primary.dark"
      : "rgba(27, 94, 32, 0.55)",
    backdropFilter: scrolled ? "none" : "blur(12px)",
    WebkitBackdropFilter: scrolled ? "none" : "blur(12px)",
    boxShadow: scrolled ? 4 : "none",
    borderBottom: scrolled ? "none" : "1px solid rgba(255,255,255,0.12)",
    transition: "background-color 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease",
  };

  return (
    <>
      <AppBar position="fixed" elevation={0} sx={appBarSx}>
        <Toolbar sx={{ gap: 1 }}>
          {/* Brand: logo + site name */}
          <Box
            component={Link}
            href="/"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              textDecoration: "none",
              flexGrow: isMobile ? 1 : 0,
              mr: isMobile ? 0 : 3,
            }}
            aria-label={`${siteName} — go to home page`}
          >
            {/* Logo — no background, no colour filter; PNG renders its own colours */}
            <Image
              src="/assets/sky-court-logo.png"
              alt={`${siteName} logo`}
              width={isMobile ? 48 : 44}
              height={isMobile ? 48 : 44}
              style={{
                objectFit: "contain",
                // Drop-shadow makes the logo pop against any background
                filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.35))",
              }}
              priority
            />
            <Typography
              variant="h6"
              component="span"
              sx={{
                color: "#fff",
                fontWeight: 700,
                fontSize: { xs: "1rem", sm: "1.1rem" },
                letterSpacing: 0.3,
                textShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }}
            >
              {siteName}
            </Typography>
          </Box>

          {/* Desktop nav */}
          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "flex-end" }}>
              {desktopLinks}
            </Box>
          )}

          {/* Mobile: user avatar + hamburger */}
          {isMobile && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {userChip}
              <IconButton
                sx={{ color: "#fff" }}
                edge="end"
                aria-label="Open navigation menu"
                onClick={toggleDrawer(true)}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Spacer so content doesn't hide behind the fixed AppBar */}
      <Toolbar />

      {mobileDrawer}
    </>
  );
}
