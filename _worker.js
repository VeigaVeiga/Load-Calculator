const PREVIEW_KEY = "Veiga2026";
const COOKIE_NAME = "load_preview";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cookies = request.headers.get("Cookie") || "";

    // ?preview=Veiga2026
    if (url.searchParams.get("preview") === PREVIEW_KEY) {
      return new Response(null, {
        status: 302,
        headers: {
          "Location": "https://logisticslink.net/",
          "Set-Cookie":
            `${COOKIE_NAME}=1; Max-Age=${COOKIE_MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }

    // Check Preview Cookie
    const hasPreviewCookie = cookies
      .split(";")
      .some(
        (cookie) =>
          cookie.trim() === `${COOKIE_NAME}=1`
      );

    // Preview user → real website
    if (hasPreviewCookie) {
      return env.ASSETS.fetch(request);
    }

    // Normal visitor → construction page
    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LogisticsLink</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f7f8fa;
      color: #222;
      font-family: Arial, sans-serif;
    }

    .container {
      text-align: center;
    }

    h1 {
      font-size: 32px;
      margin-bottom: 12px;
    }

    p {
      color: #777;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Website Under Construction</h1>
    <p>LogisticsLink is coming soon.</p>
  </div>
</body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
        },
      }
    );
  },
};
