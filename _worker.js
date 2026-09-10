const PREVIEW_TOKEN = "Veiga2026";
const PREVIEW_COOKIE = "load_calculator_preview";

const UNDER_CONSTRUCTION = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>网站建设中</title>
  <style>
    body {
      margin: 0;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Arial, sans-serif;
      background: #f5f6f8;
      color: #333;
    }

    .box {
      text-align: center;
    }

    h1 {
      font-size: 28px;
      margin-bottom: 10px;
    }

    p {
      color: #888;
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="box">
      <h1>网站建设中</h1>
      <p>Website Under Construction</p>
    </div>
  </div>
</body>
</html>
`;

function hasPreviewCookie(request) {
  const cookie = request.headers.get("Cookie") || "";

  return cookie
    .split(";")
    .some(item => item.trim() === `${PREVIEW_COOKIE}=1`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 特殊 URL，开启预览
    if (url.searchParams.get("preview") === PREVIEW_TOKEN) {
      url.searchParams.delete("preview");

      const cleanUrl =
        url.pathname +
        (url.searchParams.toString()
          ? "?" + url.searchParams.toString()
          : "");

      return new Response(null, {
        status: 302,
        headers: {
          Location: cleanUrl,
          "Set-Cookie":
            `${PREVIEW_COOKIE}=1; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store"
        }
      });
    }

    // 已经进入预览模式
    if (hasPreviewCookie(request)) {
      return env.ASSETS.fetch(request);
    }

    // 普通访客
    return new Response(UNDER_CONSTRUCTION, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
