import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import express from "express";
import { app } from "./api/[...path].ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // In AI Studio, Nginx listens on port 8080 and proxies requests to port 3000.
  // The app must bind to port 3000 (never 8080, which causes EADDRINUSE).
  const portArgIndex = process.argv.indexOf("--port");
  const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : NaN;
  const PORT = !isNaN(cliPort) && cliPort !== 8080 ? cliPort : 3000;

  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌿 Servidor PlantAI rodando na porta ${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error("Erro no servidor Express:", err);
  });
}

startServer();
