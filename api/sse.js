export const config = { runtime: "edge" };

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
  };
}

export default function handler(req) {
  // Preflight and health for connector handshakes
  if (req.method === "OPTIONS" || req.method === "HEAD") {
    return new Response(null, { status: 200, headers: sseHeaders() });
  }

  const enc = new TextEncoder();
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

  const stream = new ReadableStream({
    start(controller) {
      // retry hint
      controller.enqueue(enc.encode(`retry: 1000\n`));
      // manifest first
      controller.enqueue(enc.encode(`event: manifest\n`));
      controller.enqueue(enc.encode(`data: ${JSON.stringify(manifest)}\n\n`));
      // explicit readiness
      controller.enqueue(enc.encode(`event: ready\n`));
      controller.enqueue(enc.encode(`data: {}\n\n`));
      // frequent heartbeats
      const iv = setInterval(() => {
        controller.enqueue(enc.encode(`event: ping\n`));
        controller.enqueue(enc.encode(`data: {}\n\n`));
      }, 1000);

      req.signal.addEventListener("abort", () => clearInterval(iv));
    }
  });

  return new Response(stream, { headers: sseHeaders() });
}
