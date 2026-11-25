// pages/learn/shor.js
//
// Mockup (feature/shor-explorer-page, georgelake2 fork only; not proposed to ISU): the
// Shor's explorer as its own Redux page. The thesis plan splits Shor's into the solver flow,
// drawn by the existing generic renderers, and this page for the teaching parts those
// renderers can't draw: gate details, QFT charts, measurement, the chip view and scaling.

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Head from "next/head";
import ShorExplorer from "../../components/learn/shor/ShorExplorer";
import NavBar from "../../components/NavBar";

export default function ShorExplorerPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Head>
        <title>Shor&apos;s algorithm explorer | Redux</title>
      </Head>
      <NavBar />
      <Box
        component="main"
        sx={{ flex: 1, px: { xs: 2, sm: 5 }, py: 4, maxWidth: 1240, width: "100%", mx: "auto" }}
      >
        <Typography variant="h1" component="h1" sx={{ mb: 1 }}>
          Shor&apos;s algorithm explorer
        </Typography>
        <ShorExplorer />
      </Box>
    </Box>
  );
}
