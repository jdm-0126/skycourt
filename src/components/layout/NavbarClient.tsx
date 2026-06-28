"use client";

import { useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
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
  /** Links always shown (Home, Locate Us, Contact Us). */
  commonLinks: NavLink[];
  /** Role-specific links (Book a Court, Dashboard, Admin Panel, Login, Register). */
  roleLinks: NavLink[];
  /** Whether a Logout button should be shown. */
  showLogout: boolean;
  /** Site name displayed in the AppBar. */
  siteName?: string;
}

// ---------------------------------------------------------------------------
// NavbarClient
// ---------------------------------------------------------------------------

/**
 * Client component that renders the top AppBar and a mobile drawer.
 * Receives pre-computed nav links from the parent server component so it
 * doesn't need to know about roles directly.
 */
export default function NavbarClient({
  commonLinks,
  roleLinks,
  showLogout,
  siteName = "Sky Court",
}: NavbarClientProps) {
  // Collapse into drawer below 768 px
  const isMobile = useMediaQuery("(max-width:767px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  const allLinks = [...commonLinks, ...roleLinks];

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const toggleDrawer = (open: boolean) => () => setDrawerOpen(open);

  // ---- Shared desktop link buttons ----
  const desktopLinks = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      {commonLinks.map((link) => (
        <Button
          key={link.href}
          component={Link}
          href={link.href}
          color="inherit"
          sx={{ fontSize: "0.875rem" }}
        >
          {link.label}
        </Button>
      ))}

      {roleLinks.map((link) => (
        <Button
          key={link.href}
          component={Link}
          href={link.href}
          color="inherit"
          sx={{ fontSize: "0.875rem" }}
        >
          {link.label}
        </Button>
      ))}

      {showLogout && (
        <Button
          onClick={handleLogout}
          color="inherit"
          variant="outlined"
          sx={{
            fontSize: "0.875rem",
            borderColor: "rgba(255,255,255,0.5)",
            ml: 1,
            "&:hover": { borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.1)" },
          }}
        >
          Logout
        </Button>
      )}
    </Box>
  );

  // ---- Mobile drawer content ----
  const mobileDrawer = (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={toggleDrawer(false)}
      slotProps={{ paper: { sx: { width: 260 } } }}
    >
      {/* Drawer header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          bgcolor: "primary.main",
          color: "primary.contrastText",
        }}
      >
        <Image
          src="/assets/sky-court-logo.png"
          alt="Sky Court logo"
          width={100}
          height={34}
          style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
        />
        <IconButton
          color="inherit"
          onClick={toggleDrawer(false)}
          aria-label="Close navigation menu"
          size="small"
        >
          <CloseIcon />
        </IconButton>
      </Box>

      <Divider />

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

  return (
    <>
      <AppBar position="sticky" color="primary" enableColorOnDark>
        <Toolbar sx={{ gap: 1 }}>
          {/* Brand / logo */}
          <Box
            component={Link}
            href="/"
            sx={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              flexGrow: isMobile ? 1 : 0,
              mr: isMobile ? 0 : 3,
            }}
            aria-label="Sky Court — go to home page"
          >
            <Image
              src="/assets/sky-court-logo.png"
              alt="Sky Court logo"
              width={120}
              height={40}
              style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }}
              priority
            />
          </Box>

          {/* Desktop nav — spacer + links */}
          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: "flex", justifyContent: "flex-end" }}>
              {desktopLinks}
            </Box>
          )}

          {/* Mobile hamburger */}
          {isMobile && (
            <IconButton
              color="inherit"
              edge="end"
              aria-label="Open navigation menu"
              onClick={toggleDrawer(true)}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile drawer (rendered outside AppBar so it overlays the whole page) */}
      {mobileDrawer}
    </>
  );
}
