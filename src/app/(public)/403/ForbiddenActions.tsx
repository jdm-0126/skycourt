"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import NextLink from "next/link";

export default function ForbiddenActions() {
  return (
    <Box
      sx={{ display: "flex", justifyContent: "center", gap: 2, flexWrap: "wrap" }}
    >
      <Button
        component={NextLink}
        href="/"
        variant="contained"
        color="primary"
        startIcon={<HomeOutlinedIcon />}
      >
        Go to Home
      </Button>

      <Button
        component={NextLink}
        href="/auth/login"
        variant="outlined"
        color="primary"
      >
        Sign In
      </Button>
    </Box>
  );
}
