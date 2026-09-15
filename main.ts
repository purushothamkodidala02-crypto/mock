import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

/**
 * Deno Deploy Entry Point - PaperExtract Studio & Multi-Exam Vault
 * Serves static assets, routes, and provides health check on edge infrastructure.
 */
const port = Number(Deno.env.get("PORT") || 8000);

Deno.serve({ port }, async (req: Request) => {
  const url = new URL(req.url);

  // Health check endpoint
  if (url.pathname === "/healthz" || url.pathname === "/api/health") {
    return new Response(
      JSON.stringify({
        status: "healthy",
        service: "PaperExtract Studio",
        platform: "Deno Deploy",
        timestamp: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  // Convenience route for test suite
  if (url.pathname === "/test") {
    return serveDir(new Request(new URL("/test.html", req.url)), {
      fsRoot: ".",
      showDirListing: false,
      enableCors: true,
      quiet: true,
    });
  }

  // Serve static assets (index.html, test.html, css/*, js/*)
  const response = await serveDir(req, {
    fsRoot: ".",
    showDirListing: false,
    enableCors: true,
    quiet: true,
  });

  // SPA fallback to /index.html if 404 on path without file extension
  if (response.status === 404 && !url.pathname.split("/").pop()?.includes(".")) {
    return serveDir(new Request(new URL("/index.html", req.url)), {
      fsRoot: ".",
      showDirListing: false,
      enableCors: true,
      quiet: true,
    });
  }

  return response;
});
