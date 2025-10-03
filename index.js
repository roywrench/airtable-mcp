// Airtable MCP/Actions server (read-only tools + optional SSE)
// Env vars required in Vercel: AIRTABLE_PAT, AIRTABLE_BASE_ID, ACTIONS_KEY

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ---- Health + Root
app.get("/health", (_req, res) => res.json({ ok: true, service: "airtable-mcp" }));
app.get("/", (_req, res) => res.json({ ok: true, service: "airtable-mcp" }));

// ---- Optional SSE manifest (not needed for Actions; safe to keep)
app.get("/sse", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*"
  });

  const manifest = {
    name: "Airtable MCP",
    version: "0.1.0",
    tools: [
      {
        name: "list_records",
        description:
          "List records from any table. Optional: view, max, fields[], filterByFormula.",
        input_schema: {
          type: "object",
          properties: {
            table: { type: "string" },
            view: { type: "string" },
            max: { type: "number" },
            fields: { type: "array", items: { type: "string" } },
            filterByFormula: { type: "string" }
          },
          required: ["table"],
          additionalProperties: false
        }
      },
      {
        name: "get_record",
        description: "Get one record by id.",
        input_schema: {
          type: "object",
          properties: { table: { type: "string" }, id: { type: "string" } },
          required: ["table", "id"],
          additionalProperties: false
        }
      }
    ]
  };

  res.write(`retry: 1000\n`);
  res.write(`event: manifest\n`);
  res.write(`data: ${JSON.stringify(manifest)}\n\n`);
  res.write(`event: ready\n`);
  res.write(`data: {}\n\n`);

  const iv = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);
  }, 2000);

  req.on("close", () => clearInterval(iv));
});

// ---- Airtable config
const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const BASE = process.env.AIRTABLE_BASE_ID;
if (!AIRTABLE_PAT || !BASE) {
  console.warn("Missing AIRTABLE_PAT or AIRTABLE_BASE_ID");
}

// ---- Simple API key auth for Custom GPT Actions
const ACTIONS_KEY = process.env.ACTIONS_KEY;
app.use((req, res, next) => {
  if (req.path.startsWith("/mcp/tools/")) {
    const key = req.headers["x-actions-key"];
    if (!ACTIONS_KEY) {
      return res.status(500).json({ ok: false, error: "Server missing ACTIONS_KEY" });
    }
    if (key !== ACTIONS_KEY) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
  }
  next();
});

// ---- Helper: Airtable GET
async function airtableGet(path, params = {}) {
  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(path)}`;
  const r = await axios.get(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_PAT}` },
    params
  });
  return r.data;
}

// --- Helper: list available tables (from env or default)
const TABLES = (process.env.TABLES_CSV || "Projects,Freelancers,Quotes,Clients,Deliverables,Communications,ProjectTeam")
  .split(",")
  .map(s => s.trim());

app.post("/mcp/tools/list_tables", (_req, res) => {
  res.json({ ok: true, data: TABLES });
});

// ---- Tool: list_records
app.post("/mcp/tools/list_records", async (req, res) => {
  try {
    const { table, view, max = 50, fields, filterByFormula } = req.body || {};
    if (!table) return res.status(400).json({ ok: false, error: "table is required" });

    const params = { pageSize: Math.min(Number(max) || 50, 100) };
    if (view) params.view = view;
    if (Array.isArray(fields) && fields.length) params.fields = fields;
    if (filterByFormula) params.filterByFormula = filterByFormula;

    const data = await airtableGet(table, params);
    const rows = (data.records || []).map(r => ({ id: r.id, ...r.fields }));
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || String(e) });
  }
});

// ---- Tool: get_record
app.post("/mcp/tools/get_record", async (req, res) => {
  try {
    const { table, id } = req.body || {};
    if (!table || !id) return res.status(400).json({ ok: false, error: "table and id are required" });

    const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
    const r = await axios.get(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_PAT}` }
    });
    res.json({ ok: true, data: { id: r.data.id, ...r.data.fields } });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || String(e) });
  }
});

// ---- Export for Vercel serverless
module.exports = app;
