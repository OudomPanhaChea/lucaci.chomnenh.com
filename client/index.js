import express from "express";
import http from "http";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import routes from "./routes/index.js";
import { initSocket } from "./config/socket.js";
import { UPLOADS_DIR, serveStoredImage } from "./middleware/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Images are stored in the DB (see middleware/upload.js); the static fallback
// serves files uploaded before that change. Cache hard: ids/filenames never repeat.
app.get("/uploads/img/:id", serveStoredImage);
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, { maxAge: "30d", immutable: true })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", routes);

// Central error handler — async controller throws land here (Express 5)
app.use((err, _req, res, _next) => {
  if (err.message === "Only image files are allowed" || err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "Image must be under 5MB" : err.message });
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong, please try again" });
});

initSocket(server, CLIENT_ORIGIN);

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Chamnenh API running on http://localhost:${PORT}`);
});
