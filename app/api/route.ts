

import { parseStringPromise } from 'xml2js';

const allowedOrigins = [
  'https://homesheatandhealthykids.github.io',
  'https://icu-heart.github.io/',
];

function getCorsHeaders(request: Request) {
  const origin = request.headers.get('Origin');

  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  });

  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

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

    return Response.json(parsed, {
      headers: corsHeaders,
    });
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
