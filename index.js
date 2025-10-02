// Minimal Airtable MCP (read-only)
// Exposes two tools via HTTP for Custom Connector (BETA):
// - list_records: list rows from any table in your base
// - get_record: fetch one row by recordId
//
// Env vars required (set in Vercel):
// AIRTABLE_PAT, AIRTABLE_BASE_ID
//
// Security: keep PAT read-only; rotate if exposed.

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

// --- Minimal MCP SSE endpoint required by Custom Connector (BETA)
app.get("/sse", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const manifest = {
    name: "Airtable MCP",
    version: "0.1.0",
    tools: [
      {
        name: "list_records",
        description:
          "List records from any table in the base. Optional: view, max, fields[], filterByFormula.",
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
        description: "Get one record by recordId from a table.",
        input_schema: {
          type: "object",
          properties: { table: { type: "string" }, id: { type: "string" } },
          required: ["table", "id"],
          additionalProperties: false
        }
      }
    ]
  };

  // send the manifest once, then keep the stream open
  res.write(`event: manifest\n`);
  res.write(`data: ${JSON.stringify(manifest)}\n\n`);

  // keep-alive pings
  const iv = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 20000);
  req.on("close", () => clearInterval(iv));
});

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const BASE = process.env.AIRTABLE_BASE_ID;

if (!AIRTABLE_PAT || !BASE) {
  console.warn("Missing AIRTABLE_PAT or AIRTABLE_BASE_ID");
}

// ---- Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---- MCP manifest: describe available tools
app.get("/mcp/manifest", (_req, res) => {
  res.json({
    name: "Airtable MCP",
    version: "0.1.0",
    tools: [
      {
        name: "list_records",
        description:
          "List records from any table in the base. Optional: view, max, fields[], filterByFormula.",
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
        description: "Get one record by recordId from a table.",
        input_schema: {
          type: "object",
          properties: {
            table: { type: "string" },
            id: { type: "string" }
          },
          required: ["table", "id"],
          additionalProperties: false
        }
      }
    ]
  });
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

// ---- Tool: list_records
app.post("/mcp/tools/list_records", async (req, res) => {
  try {
    const { table, view, max = 50, fields, filterByFormula } = req.body || {};
    if (!table) return res.status(400).json({ ok: false, error: "table is required" });

    const params = {
      pageSize: Math.min(Number(max) || 50, 100)
    };
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

// Export for Vercel serverless
module.exports = app;

app.get("/", (_req, res) => res.json({ ok: true, service: "airtable-mcp" }));
