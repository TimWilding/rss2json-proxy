

import { parseStringPromise } from 'xml2js';

function text(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === 'object' && '_' in value) {
    return text(value._);
  }
  return '';
}

function normaliseDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, '');
}

function mapItem(item: any) {
  const content =
    text(item['content:encoded']) ||
    text(item.description);

  const thumbnail =
    text(item['media:thumbnail']?.$?.url) ||
    text(item.enclosure?.$?.url);

  return {
    title: text(item.title),
    pubDate: normaliseDate(text(item.pubDate)),
    link: text(item.link),
    guid: text(item.guid?._) || text(item.guid),
    author:
      text(item['dc:creator']) ||
      text(item.author),
    thumbnail,
    description: text(item.description),
    content,
    enclosure: item.enclosure?.$ ?? {},
    categories: item.category
      ? (Array.isArray(item.category)
          ? item.category
          : [item.category]
        ).map(text)
      : [],
  };
}

const allowedOrigins = [
  'https://homesheatandhealthykids.github.io',
  'https://icu-heart.github.io/',
];

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin');

  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Origin': '*',
  });

//  if (origin && allowedOrigins.includes(origin)) {
//    headers.set('Access-Control-Allow-Origin', origin);
//  }

  return headers;
}

function isAllowedRssUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      (url.hostname === 'medium.com' ||
        url.hostname.endsWith('.medium.com')) &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}

export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(request: Request) {
  const corsHeaders = getCorsHeaders(request);
  const url = new URL(request.url);
  const rss = url.searchParams.get('rss');

  if (!rss) {
    return Response.json(
      { error: 'No rss parameter specified' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!isAllowedRssUrl(rss)) {
    return Response.json(
      { error: 'Only HTTPS RSS URLs hosted on medium.com are allowed' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const res = await fetch(rss, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return Response.json(
        { error: `RSS request failed: ${res.status}` },
        { status: 502, headers: corsHeaders }
      );
    }


    const data = await res.text();

    const parsed = await parseStringPromise(data, {
      explicitArray: false,
    });

    const channel = parsed.rss?.channel;

    if (!channel) {
      return Response.json(
        { status: 'error', message: 'Invalid RSS feed' },
        { status: 502, headers: corsHeaders }
      );
    }

    const rawItems = channel.item
      ? Array.isArray(channel.item)
        ? channel.item
        : [channel.item]
      : [];

    const feed = {
      url: rss,
      title: text(channel.title),
      link: text(channel.link),
      author: text(channel['dc:creator']),
      description: text(channel.description),
      image: text(channel.image?.url),
    };

    return Response.json(
      {
        status: 'ok',
        feed,
        items: rawItems.map(mapItem),
      },
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: error instanceof Error
          ? error.message
          : 'An unexpected error occurred',
      },
      { status: 502, headers: corsHeaders }
    );
  }
}
