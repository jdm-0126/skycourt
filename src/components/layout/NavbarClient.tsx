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
  useScrollTrigger,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import CloseIcon from "@mui/icons-material/Close";
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
  commonLinks: NavLink[];
  roleLinks: NavLink[];
  /** Super_admin-only links rendered after a divider in the mobile drawer. */
  superAdminLinks?: NavLink[];
  showLogout: boolean;
  siteName?: string;
  displayName?: string | null;
  userRole?: UserRole;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

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
 * Top navigation bar.
 *
 * Desktop (md+): all links inline in the AppBar.
 * Mobile  (< md): burger icon → slide-out Drawer with all links.
 *
 * The Drawer is always available regardless of login state — logged-in
 * users see their identity info + role links; guests see login/register.
 *
 * Requirements: 23.1 – 23.4
 */
export default function NavbarClient({
  commonLinks,
  roleLinks,
  superAdminLinks = [],
  showLogout,
  siteName = "Sky Court",
  displayName,
  userRole,
}: NavbarClientProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  const scrolled = useScrollTrigger({
    disableHysteresis: true,
    threshold: 20,
  });

  const allLinks = [...commonLinks, ...roleLinks];
  const isLoggedIn = !!displayName;
  const hasSuperAdminLinks = superAdminLinks.length > 0;

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  // ---------------------------------------------------------------------------
  // AppBar styles
  // ---------------------------------------------------------------------------
  const appBarSx = {
    backgroundColor: scrolled ? "primary.dark" : "rgba(27, 94, 32, 0.55)",
    backdropFilter: scrolled ? "none" : "blur(12px)",
    WebkitBackdropFilter: scrolled ? "none" : "blur(12px)",
    boxShadow: scrolled ? 4 : "none",
    borderBottom: scrolled ? "none" : "1px solid rgba(255,255,255,0.12)",
    transition: "background-color 0.3s ease, box-shadow 0.3s ease",
  };

  // ---------------------------------------------------------------------------
  // Desktop nav links (md and up — rendered inside AppBar)
  // ---------------------------------------------------------------------------
  const desktopNav = (
    <Box
      sx={{
        display: { xs: "none", md: "flex" },
        alignItems: "center",
        gap: 0,
        flexGrow: 1,
        justifyContent: "flex-end",
        overflowX: "auto",
        // Hide scrollbar on desktop nav
        "&::-webkit-scrollbar": { display: "none" },
        scrollbarWidth: "none",
      }}
    >
      {allLinks.map((link) => (
        <Button
          key={link.href}
          component={Link}
          href={link.href}
          sx={{
            fontSize: "0.8rem",
            color: "#fff",
            fontWeight: 500,
            px: 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
            "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
          }}
        >
          {link.label}
        </Button>
      ))}

      {/* Super_admin-only links with a subtle divider */}
      {hasSuperAdminLinks && (
        <>
          <Box
            sx={{
              width: "1px",
              height: 20,
              bgcolor: "rgba(255,255,255,0.3)",
              mx: 0.5,
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          {superAdminLinks.map((link) => (
            <Button
              key={link.href}
              component={Link}
              href={link.href}
              sx={{
                fontSize: "0.8rem",
                color: "rgba(255,255,255,0.85)",
                fontWeight: 500,
                px: 1,
                whiteSpace: "nowrap",
                flexShrink: 0,
                "&:hover": { bgcolor: "rgba(255,255,255,0.12)" },
              }}
            >
              {link.label}
            </Button>
          ))}
        </>
      )}

      {/* User identity chip */}
      {isLoggedIn && (
        <Tooltip title={`${displayName}${userRole ? ` · ${roleLabel(userRole)}` : ""}`}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, ml: 1, flexShrink: 0 }}>
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
              {initials(displayName!)}
            </Avatar>
            <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "#fff",
                  fontWeight: 600,
                  lineHeight: 1.2,
                  maxWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
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
          </Box>
        </Tooltip>
      )}

      {showLogout && (
        <Button
          onClick={handleLogout}
          sx={{
            fontSize: "0.8rem",
            color: "#fff",
            fontWeight: 500,
            border: "1px solid rgba(255,255,255,0.45)",
            ml: 0.5,
            flexShrink: 0,
            whiteSpace: "nowrap",
            "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,0.12)" },
          }}
        >
          Logout
        </Button>
      )}
    </Box>
  );

  // ---------------------------------------------------------------------------
  // Mobile Drawer (xs / sm — opened by burger icon)
  // ---------------------------------------------------------------------------
  const mobileDrawer = (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      slotProps={{ paper: { sx: { width: 280 } } }}
    >
      {/* ---- Drawer header ---- */}
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
            width={36}
            height={36}
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
          onClick={() => setDrawerOpen(false)}
          aria-label="Close navigation menu"
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </Box>

      {/* ---- User identity (logged-in only) ---- */}
      {isLoggedIn && (
        <>
          <Box
            sx={{
              px: 2,
              py: 1.5,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              bgcolor: "grey.50",
            }}
          >
            <Avatar
              sx={{
                width: 40,
                height: 40,
                bgcolor: "primary.main",
                fontSize: "0.85rem",
                fontWeight: 700,
              }}
            >
              {initials(displayName!)}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight={700}>
                {displayName}
              </Typography>
              {userRole && (
                <Chip
                  label={roleLabel(userRole)}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem", mt: 0.25 }}
                />
              )}
            </Box>
          </Box>
          <Divider />
        </>
      )}

      {/* ---- Nav links ---- */}
      <List disablePadding>
        {allLinks.map((link) => (
          <ListItem key={link.href} disablePadding>
            <ListItemButton
              component={Link}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
            >
              <ListItemText
                primary={link.label}
                slotProps={{ primary: { fontWeight: 500 } }}
              />
            </ListItemButton>
          </ListItem>
        ))}

        {/* Super_admin-only section */}
        {hasSuperAdminLinks && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ px: 2, py: 0.5 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontWeight: 700,
                  fontSize: "0.65rem",
                }}
              >
                Super Admin
              </Typography>
            </Box>
            {superAdminLinks.map((link) => (
              <ListItem key={link.href} disablePadding>
                <ListItemButton
                  component={Link}
                  href={link.href}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ListItemText
                    primary={link.label}
                    slotProps={{ primary: { fontWeight: 500, color: "primary.main" } }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </>
        )}

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
                  slotProps={{ primary: { color: "error", fontWeight: 600 } }}
                />
              </ListItemButton>
            </ListItem>
          </>
        )}
      </List>
    </Drawer>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <AppBar position="fixed" elevation={0} sx={appBarSx}>
        <Toolbar sx={{ gap: 1 }}>
          {/* Brand */}
          <Box
            component={Link}
            href="/"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              textDecoration: "none",
              flexGrow: { xs: 1, md: 0 },
              mr: { xs: 0, md: 3 },
            }}
            aria-label={`${siteName} — go to home page`}
          >
            <Image
              src="/assets/sky-court-logo.png"
              alt={`${siteName} logo`}
              width={44}
              height={44}
              style={{
                objectFit: "contain",
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

          {/* Desktop links — hidden on mobile */}
          {desktopNav}

          {/* Mobile burger — hidden on desktop */}
          <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", gap: 0.5 }}>
            {/* Avatar preview when logged in */}
            {isLoggedIn && (
              <Avatar
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  bgcolor: "rgba(255,255,255,0.25)",
                  color: "#fff",
                  border: "1.5px solid rgba(255,255,255,0.6)",
                }}
              >
                {initials(displayName!)}
              </Avatar>
            )}
            <IconButton
              sx={{ color: "#fff" }}
              edge="end"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Spacer so content doesn't hide behind the fixed AppBar */}
      <Toolbar />

      {/* Mobile drawer */}
      <Box id="mobile-nav-drawer">{mobileDrawer}</Box>
    </>
  );
}
