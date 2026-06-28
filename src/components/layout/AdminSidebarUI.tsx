"use client";

import Link from "next/link";
import {
  Box,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import EventIcon from "@mui/icons-material/Event";
import SportsIcon from "@mui/icons-material/Sports";
import WebIcon from "@mui/icons-material/Web";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";
import MessageIcon from "@mui/icons-material/Message";
import SettingsIcon from "@mui/icons-material/Settings";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import ShieldIcon from "@mui/icons-material/Shield";
import HistoryIcon from "@mui/icons-material/History";
import BackupIcon from "@mui/icons-material/Backup";
import TuneIcon from "@mui/icons-material/Tune";

// ---------------------------------------------------------------------------
// Link definitions (also exported for tests)
// ---------------------------------------------------------------------------

export interface SidebarLink {
  label: string;
  href: string;
}

export const ADMIN_SIDEBAR_LINKS: SidebarLink[] = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Courts", href: "/admin/courts" },
  { label: "Website", href: "/admin/website" },
  { label: "Gallery", href: "/admin/gallery" },
  { label: "Users", href: "/admin/users" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Settings", href: "/admin/settings" },
];

export const SUPER_ADMIN_SIDEBAR_LINKS: SidebarLink[] = [
  { label: "Admins", href: "/superadmin/admins" },
  { label: "Roles", href: "/superadmin/roles" },
  { label: "Audit Logs", href: "/superadmin/audit-logs" },
  { label: "Database Backup", href: "/superadmin/backup" },
  { label: "Website Settings", href: "/superadmin/website-settings" },
];

const ADMIN_ICONS: Record<string, React.ReactNode> = {
  "/admin/dashboard": <DashboardIcon fontSize="small" />,
  "/admin/bookings": <EventIcon fontSize="small" />,
  "/admin/courts": <SportsIcon fontSize="small" />,
  "/admin/website": <WebIcon fontSize="small" />,
  "/admin/gallery": <PhotoLibraryIcon fontSize="small" />,
  "/admin/users": <PeopleIcon fontSize="small" />,
  "/admin/reports": <BarChartIcon fontSize="small" />,
  "/admin/messages": <MessageIcon fontSize="small" />,
  "/admin/settings": <SettingsIcon fontSize="small" />,
};

const SUPER_ADMIN_ICONS: Record<string, React.ReactNode> = {
  "/superadmin/admins": <AdminPanelSettingsIcon fontSize="small" />,
  "/superadmin/roles": <ShieldIcon fontSize="small" />,
  "/superadmin/audit-logs": <HistoryIcon fontSize="small" />,
  "/superadmin/backup": <BackupIcon fontSize="small" />,
  "/superadmin/website-settings": <TuneIcon fontSize="small" />,
};

// ---------------------------------------------------------------------------
// SidebarLinkList
// ---------------------------------------------------------------------------

function SidebarLinkList({
  links,
  iconMap,
}: {
  links: SidebarLink[];
  iconMap: Record<string, React.ReactNode>;
}) {
  return (
    <List disablePadding>
      {links.map(({ label, href }) => (
        <ListItem key={href} disablePadding>
          <ListItemButton
            component={Link}
            href={href}
            sx={{
              px: 2,
              py: 1,
              borderRadius: 1,
              mx: 0.5,
              "&:hover": { bgcolor: "primary.dark", color: "primary.contrastText" },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
              {iconMap[href]}
            </ListItemIcon>
            <ListItemText
              primary={label}
              slotProps={{ primary: { fontSize: "0.875rem", fontWeight: 500 } }}
            />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

// ---------------------------------------------------------------------------
// AdminSidebarUI — pure client component, receives isSuperAdmin as prop
// ---------------------------------------------------------------------------

export default function AdminSidebarUI({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  return (
    <Box
      component="nav"
      aria-label="Admin navigation"
      sx={{
        width: 240,
        minHeight: "100%",
        bgcolor: "primary.main",
        color: "primary.contrastText",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Brand header */}
      <Box sx={{ px: 2, py: 2, borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
        <Link
          href="/admin/dashboard"
          style={{ color: "inherit", textDecoration: "none", display: "block" }}
        >
          <Typography variant="h6" fontWeight={700}>
            Sky Court
          </Typography>
        </Link>
        <Typography
          variant="caption"
          sx={{ color: "rgba(255,255,255,0.7)", mt: 0.25, display: "block" }}
        >
          Admin Panel
        </Typography>
      </Box>

      {/* Standard admin links */}
      <Box sx={{ pt: 1, flex: 1 }}>
        <SidebarLinkList links={ADMIN_SIDEBAR_LINKS} iconMap={ADMIN_ICONS} />

        {/* Super admin-only section */}
        {isSuperAdmin && (
          <>
            <Divider sx={{ my: 1, borderColor: "rgba(255,255,255,0.2)" }} />
            <Typography
              variant="caption"
              sx={{
                px: 2.5,
                py: 0.5,
                display: "block",
                color: "rgba(255,255,255,0.6)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 600,
              }}
            >
              Super Admin
            </Typography>
            <SidebarLinkList
              links={SUPER_ADMIN_SIDEBAR_LINKS}
              iconMap={SUPER_ADMIN_ICONS}
            />
          </>
        )}
      </Box>
    </Box>
  );
}
