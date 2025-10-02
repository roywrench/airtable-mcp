export const config = { runtime: "edge" };

export default function handler(req) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
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
      controller.enqueue(enc.encode(`event: manifest\n`));
      controller.enqueue(enc.encode(`data: ${JSON.stringify(manifest)}\n\n`));
      const iv = setInterval(() => {
        controller.enqueue(enc.encode(`event: ping\n`));
        controller.enqueue(enc.encode(`data: {}\n\n`));
      }, 15000);
      req.signal.addEventListener("abort", () => clearInterval(iv));
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
