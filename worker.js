export default {
  async fetch(request, env) {

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400, cors);
    }

    const { url } = body;

    if (!url || typeof url !== 'string') {
      return json({ error: 'يرجى إرسال رابط TikTok' }, 400, cors);
    }

    const isTikTok = /tiktok\.com|vm\.tiktok|vt\.tiktok/i.test(url);
    if (!isTikTok) {
      return json({ error: 'الرابط غير صحيح، يرجى نسخ رابط من تطبيق TikTok' }, 400, cors);
    }

    const RAPIDAPI_KEY  = env.RAPIDAPI_KEY ?? '94786b2932mshfff2956a4250062p1ed670jsnb260e66b01a5';
    const RAPIDAPI_HOST = 'tiktok-video-feature-summary.p.rapidapi.com';

    let apiRes;
    try {
      apiRes = await fetch(
        `https://${RAPIDAPI_HOST}/?url=${encodeURIComponent(url)}&hd=1`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-key':  RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST,
            'Content-Type':    'application/json',
          },
        }
      );
    } catch (err) {
      return json({ error: 'تعذّر الاتصال بالخادم، حاول مجدداً' }, 502, cors);
    }

    if (!apiRes.ok) {
      return json({ error: `خطأ من API: ${apiRes.status}` }, 502, cors);
    }

    let data;
    try {
      data = await apiRes.json();
    } catch {
      return json({ error: 'استجابة غير صالحة من الخادم' }, 502, cors);
    }

    if (data.code !== 0 || !data.data) {
      return json({ error: data.msg || 'لم يتم العثور على الفيديو' }, 404, cors);
    }

    const v = data.data;

    const result = {
      success:   true,
      title:     v.title     || v.desc        || 'فيديو TikTok',
      author:    v.author?.nickname || v.author?.unique_id || v.author || 'مجهول',
      thumbnail: v.cover     || v.origin_cover || v.dynamic_cover || '',
      duration:  v.duration  || 0,
      formats:   buildFormats(v),
    };

    return json(result, 200, cors);
  },
};

function buildFormats(v) {
  const formats = [];

  if (v.hdplay || v.play_addr_h264?.url_list?.[0]) {
    formats.push({
      label:   'HD بدون علامة مائية',
      quality: '1080p',
      url:     v.hdplay || v.play_addr_h264.url_list[0],
      size:    fmtSize(v.hd_size || v.size || 0),
      type:    'video',
    });
  }

  if (v.play) {
    formats.push({
      label:   'SD بدون علامة مائية',
      quality: '720p',
      url:     v.play,
      size:    fmtSize(v.size || 0),
      type:    'video',
    });
  }

  if (v.wmplay && v.wmplay !== v.play) {
    formats.push({
      label:   'نسخة مع العلامة المائية',
      quality: '720p',
      url:     v.wmplay,
      size:    fmtSize(v.wm_size || 0),
      type:    'video',
    });
  }

  const musicUrl = v.music || v.music_info?.play_url?.uri
                || v.music_info?.play_url?.url_list?.[0];
  if (musicUrl) {
    formats.push({
      label:   'MP3 — الموسيقى فقط',
      quality: 'audio',
      url:     musicUrl,
      size:    fmtSize(v.music_info?.duration || 0),
      type:    'audio',
    });
  }

  return formats;
}

function fmtSize(bytes) {
  if (!bytes || bytes < 100) return 'غير معروف';
  const mb = bytes / (1024 * 1024);
  return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
