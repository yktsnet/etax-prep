// Cloudflare Access は自前ドメインにしか適用できず、pages.dev は Cloudflare 所有のため
// 本番・プレビューとも保護対象にできない。認証の無い入口を残さないよう、ここで塞ぐ。
export const onRequest = ({ request, next }) => {
  const host = new URL(request.url).hostname;
  if (host === 'pages.dev' || host.endsWith('.pages.dev')) {
    return new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return next();
};
