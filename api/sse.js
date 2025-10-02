export const config = { runtime: "edge" };

export default function handler(req) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
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

      controller.enqueue(encoder.encode(`event: manifest\n`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(manifest)}\n\n`));

      const iv = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\n`));
        controller.enqueue(encoder.encode(`data: {}\n\n`));
      }, 15000);

      // close/cleanup when client disconnects
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
