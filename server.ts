import express from "express";
import { createServer as createViteServer } from "vite";
import { generateDailyProfile, DEFAULT_EV_CONFIG, EVConfig } from "./src/lib/simulation";
import Database from "better-sqlite3";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  app.use(express.json());

  // Initialize Database
  const db = new Database("grid.db");
  db.exec(`
    CREATE TABLE IF NOT EXISTS grid_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      hour INTEGER NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_date ON grid_history(date);
  `);

  // Simulation State
  let evConfig: EVConfig = { ...DEFAULT_EV_CONFIG };
  let dailyProfile = generateDailyProfile(evConfig);
  let currentIndex = 0;
  let simulationDate = new Date();

  // Advance simulation every 2 seconds
  setInterval(() => {
    // 1. Store current data point to history
    const currentData = dailyProfile[currentIndex];
    const dateStr = simulationDate.toISOString().split('T')[0];
    
    try {
      const stmt = db.prepare('INSERT INTO grid_history (date, hour, data) VALUES (?, ?, ?)');
      stmt.run(dateStr, currentIndex, JSON.stringify(currentData));
    } catch (err) {
      console.error("Failed to log history:", err);
    }

    // 2. Advance time
    currentIndex = (currentIndex + 1) % 24;
    
    // 3. If new day, increment date and regenerate profile (for variety)
    if (currentIndex === 0) {
      simulationDate.setDate(simulationDate.getDate() + 1);
      dailyProfile = generateDailyProfile(evConfig); // New day, new random variations
    }
  }, 2000);

  // API Routes
  app.get("/api/grid-data", (req, res) => {
    const currentData = dailyProfile[currentIndex];
    res.json({
      current: currentData,
      forecast: dailyProfile,
      serverTime: simulationDate.toISOString(),
      currentIndex,
      evConfig
    });
  });

  app.post("/api/ev-config", (req, res) => {
    const newConfig = req.body;
    // Validate config (basic)
    if (typeof newConfig.enabled !== 'boolean') {
      return res.status(400).json({ error: "Invalid config" });
    }
    
    evConfig = { ...evConfig, ...newConfig };
    
    // Regenerate profile with new config immediately
    // Note: This might cause a "jump" in the graph, but acceptable for simulation
    dailyProfile = generateDailyProfile(evConfig);
    
    res.json({ success: true, config: evConfig });
  });

  app.get("/api/history", (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: "Date parameter (YYYY-MM-DD) is required" });
    }

    try {
      const stmt = db.prepare('SELECT * FROM grid_history WHERE date = ? ORDER BY hour ASC');
      const rows = stmt.all(date);
      const data = rows.map((row: any) => JSON.parse(row.data));
      res.json(data);
    } catch (err) {
      console.error("History fetch error:", err);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
