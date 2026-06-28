import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import ThemeRegistry from "@/components/ui/ThemeRegistry";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sky Court — Pickleball Court Booking",
    template: "%s | Sky Court",
  },
  description:
    "Book a pickleball court at Sky Court. View availability, reserve your slot, and manage your bookings online.",
  icons: {
    icon: "/assets/favicon.png",
    shortcut: "/assets/favicon.png",
    apple: "/assets/favicon.png",
  },
};

async function getThemeMode(): Promise<"light" | "dark"> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "theme_mode")
      .maybeSingle<{ value: string }>();
    return data?.value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialMode = await getThemeMode();

  return (
    <html lang="en">
      <body>
        <ThemeRegistry initialMode={initialMode}>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
