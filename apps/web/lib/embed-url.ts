export function embeddableUrl(raw: string): string {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:') throw new Error('Chỉ hỗ trợ URL HTTPS.');
  const host = parsed.hostname.toLowerCase();
  const youtube = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host);
  const videoId =
    host === 'youtu.be'
      ? parsed.pathname.slice(1)
      : youtube && parsed.pathname === '/watch'
        ? parsed.searchParams.get('v')
        : youtube && /^\/(shorts|live)\//.test(parsed.pathname)
          ? parsed.pathname.split('/')[2]
          : null;
  if (videoId && /^[\w-]{11}$/.test(videoId))
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  const tiktokId = /\/(?:@[^/]+\/video|player\/v1)\/(\d+)/.exec(parsed.pathname)?.[1];
  if (['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(host) && tiktokId)
    return `https://www.tiktok.com/player/v1/${tiktokId}`;
  return parsed.href;
}
