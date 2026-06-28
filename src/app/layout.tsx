import type { Metadata } from "next";
import ThemeRegistry from "@/components/ui/ThemeRegistry";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
