const PREVIEW_TOKEN = "Veiga2026";
const PREVIEW_COOKIE = "load_calculator_preview";
const PREVIEW_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const UNDER_CONSTRUCTION = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>网站建设中</title>
  <style>
    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      width: 100%;
      height: 100%;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f6f8;
      color: #333;
      font-family:
        Arial,
        "Microsoft YaHei",
        "PingFang SC",
        sans-serif;
    }

    .box {
      text-align: center;
      padding: 40px 24px;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 28px;
      font-weight: 500;
    }

    p {
      margin: 0;
      color: #888;
      font-size: 14px;
    }
  </style>
</head>

<body>
  <div class="box">
    <h1>网站建设中</h1>
    <p>Website Under Construction</p>
  </div>
</body>
</html>`;


/**
 * 检查请求是否已经拥有预览 Cookie
 */
function hasPreviewCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";

  return cookieHeader
    .split(";")
    .some(
      (item) =>
        item.trim() === `${PREVIEW_COOKIE}=1`
    );
}


/**
 * 设置预览 Cookie
 */
function createPreviewCookie() {
  return [
    `${PREVIEW_COOKIE}=1`,
    "Path=/",
    `Max-Age=${PREVIEW_MAX_AGE}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ==========================================
     * 1. 预览入口
     * ==========================================
     *
     * 访问：
     *
     * /?preview=Veiga2026
     *
     * 设置 Cookie，然后跳转到干净 URL。
     */
    if (url.searchParams.get("preview") === PREVIEW_TOKEN) {
      url.searchParams.delete("preview");

      const cleanUrl =
        url.pathname +
        (url.searchParams.toString()
          ? `?${url.searchParams.toString()}`
          : "");

      return new Response(null, {
        status: 302,
        headers: {
          Location: cleanUrl,

          "Set-Cookie": createPreviewCookie(),

          "Cache-Control": "no-store"
        }
      });
    }


    /*
     * ==========================================
     * 2. 已经进入预览模式
     * ==========================================
     *
     * Cookie 有效：
     * → 正常显示 Vite 构建出来的 dist 网站
     */
    if (hasPreviewCookie(request)) {
      return env.ASSETS.fetch(request);
    }


    /*
     * ==========================================
     * 3. 普通访客
     * ==========================================
     *
     * 没有 Cookie：
     * → 显示建设中页面
     */
    return new Response(UNDER_CONSTRUCTION, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-store"
      }
    });
  }
};
