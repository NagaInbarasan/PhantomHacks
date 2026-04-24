'use strict';
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

const SUPA_URL = 'https://frffynlzejbtnapooqvu.supabase.co';
const SUPA_KEY = 'sb_publishable_QW3l1XzcOGcvKIKeGVUv9w_jfe0IUtS';
const supabase = createClient(SUPA_URL, SUPA_KEY);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

/* ============================================================ HELPERS */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function determineStatus(startDate, endDate) {
  if (!startDate && !endDate) return 'open';
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (end && end < now) return 'closed';
  if (start && start > now) return 'upcoming';
  if (start && start <= now && (!end || end >= now)) return 'ongoing';
  return 'open';
}

function pickEmoji(tags = [], title = '') {
  const t = (Array.isArray(tags) ? tags.join(' ') : '') + ' ' + title.toLowerCase();
  if (/\bai\b|machine.learn|deep.learn|llm|gpt|nlp/.test(t)) return '🤖';
  if (/web3|blockchain|crypto|defi|nft|solana|ethereum/.test(t)) return '⛓️';
  if (/health|medical|clinic|pharma|biotech/.test(t)) return '🏥';
  if (/climate|green|sustain|environment|energy/.test(t)) return '🌱';
  if (/finance|fintech|banking|upi|payment/.test(t)) return '💰';
  if (/iot|robot|hardware|embedd/.test(t)) return '⚙️';
  if (/security|cyber|ctf|hack/.test(t)) return '🔐';
  if (/edtech|education|learn|teach/.test(t)) return '📚';
  if (/game|gaming|unity|unreal/.test(t)) return '🎮';
  if (/data|analytic|datathon|visuali/.test(t)) return '📊';
  if (/open.source|github/.test(t)) return '🌐';
  if (/agri|farm|rural/.test(t)) return '🌾';
  if (/space|astro|nasa/.test(t)) return '🚀';
  return '👻';
}

function cleanText(str = '') {
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 600);
}

function normalizeMode(str = '') {
  if (!str) return 'online';
  const s = str.toLowerCase();
  if (s.includes('hybrid')) return 'hybrid';
  if (s.includes('offline') || s.includes('in-person') || s.includes('onsite')) return 'offline';
  return 'online';
}

function normalizeTeam(max = 1) {
  if (max <= 1) return 'solo';
  if (max <= 4) return 'small';
  return 'large';
}

/* ============================================================ DEVPOST API */
async function scrapeDevpost() {
  console.log('[Devpost] Starting...');
  const results = [];
  try {
    for (let page = 1; page <= 4; page++) {
      const { data } = await axios.get('https://devpost.com/api/hackathons', {
        params: { page, per_page: 24, status: 'open', order_by: 'deadline', sort_by: 'ascending' },
        headers: HEADERS, timeout: 12000
      });
      const list = data.hackathons || [];
      if (!list.length) break;

      for (const h of list) {
        const tags = (h.themes || []).map(t => t.name).filter(Boolean);
        const prizeNum = parseInt(h.prize_amount) || 0;
        results.push({
          title:       h.title,
          org:         h.organization_name || 'Devpost Host',
          type:        'hackathon',
          mode:        (h.displayed_location?.location || '').toLowerCase().includes('online') || !h.displayed_location?.location ? 'online' : 'offline',
          prize:       prizeNum ? `$${prizeNum.toLocaleString()}` : 'Prizes Available',
          location:    h.displayed_location?.location || 'Online',
          date:        h.submission_period_dates || 'TBD',
          deadline:    h.submission_period_dates?.split('–')[1]?.trim() || 'Ongoing',
          url:         h.url?.startsWith('http') ? h.url : `https://devpost.com${h.url || ''}`,
          description: cleanText(h.description) || `${h.title} is a premier hackathon on Devpost.`,
          tags,
          status:      h.open_state === 'open' ? 'open' : h.open_state === 'upcoming' ? 'upcoming' : 'closed',
          source:      'devpost',
          source_id:   `devpost-${h.id}`,
          emoji:       pickEmoji(tags, h.title),
          team:        normalizeTeam(h.maximum_team_size),
          level:       'intermediate',
          cost:        'free',
          featured:    h.featured || false,
          image_url:   h.thumbnail_url || null,
          logo_url:    h.thumbnail_url || null,
          approved:    true,
          extended_details: {
            problem_statements: [{ category: 'Main Track', title: 'Open Innovation', desc: cleanText(h.description).slice(0, 300) || 'Build something amazing.' }],
            prizes_breakdown: prizeNum ? [
              { tier: '🥇 1st Place', reward: `$${Math.round(prizeNum * 0.5).toLocaleString()}` },
              { tier: '🥈 2nd Place', reward: `$${Math.round(prizeNum * 0.3).toLocaleString()}` },
              { tier: '🥉 3rd Place', reward: `$${Math.round(prizeNum * 0.2).toLocaleString()}` },
            ] : [],
            rules: ['Original work only.', 'Must submit before the stated deadline.', 'Teams must register on Devpost.'],
          }
        });
      }
      if (list.length < 24) break;
      await sleep(600);
    }
    console.log(`[Devpost] ✓ ${results.length} hackathons`);
  } catch (e) { console.error('[Devpost] ✗', e.message); }
  return results;
}

/* ============================================================ MLH */
async function scrapeMLH() {
  console.log('[MLH] Starting...');
  const results = [];
  try {
    for (const season of ['2025', '2026']) {
      const { data } = await axios.get(`https://mlh.io/seasons/${season}/events`, { headers: HEADERS, timeout: 12000 });
      const $ = cheerio.load(data);

      $('.event-wrapper').each((_, el) => {
        const title  = $(el).find('.event-name').text().trim();
        const date   = $(el).find('.event-date').text().trim();
        let   loc    = $(el).find('.event-location span').last().text().trim() || 'Multiple Locations';
        let   url    = $(el).find('a.event-link').attr('href') || $(el).find('a[href]').first().attr('href') || '#';
        const logo   = $(el).find('.event-logo img').attr('src') || null;
        const banner = $(el).find('.event-image img').attr('src') || null;

        if (!url.startsWith('http')) url = `https://mlh.io${url}`;
        if (!title) return;

        const isOnline = /online|digital|virtual/i.test(loc);
        results.push({
          title, org: 'Major League Hacking (MLH)', type: 'hackathon',
          mode:    isOnline ? 'online' : 'offline',
          prize:   'MLH Swag & Awards',
          location: loc || 'Global',
          date, deadline: 'Check MLH Site', url,
          description: `${title} is an official MLH-sanctioned hackathon. Build amazing projects, meet fellow hackers, and compete for prizes. Open to all skill levels.`,
          tags: ['MLH', 'Student', 'Community', 'Beginner Friendly'],
          status: 'open', source: 'mlh',
          source_id: `mlh-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40)}-${season}`,
          emoji: '🚩', team: 'small', level: 'beginner', cost: 'free',
          featured: false, image_url: banner, logo_url: logo, approved: true,
          extended_details: {
            problem_statements: [{ category: 'MLH Sponsored', title: 'Best Use of Sponsor Tech', desc: 'Build the most innovative project using sponsor APIs and technologies.' }],
            rules: ['Must follow the MLH Code of Conduct.', 'Open to students and recent graduates.', 'Projects must be built during the event.'],
            judging_criteria: [
              { name: 'Innovation',          weight: '30%', detail: 'How novel and creative is the idea?' },
              { name: 'Tech Complexity',     weight: '30%', detail: 'How impressive is the implementation?' },
              { name: 'Impact',              weight: '20%', detail: 'How useful is the solution?' },
              { name: 'Presentation',        weight: '20%', detail: 'How well is the project presented?' },
            ]
          }
        });
      });
      await sleep(500);
    }
    console.log(`[MLH] ✓ ${results.length} events`);
  } catch (e) { console.error('[MLH] ✗', e.message); }
  return results;
}

/* ============================================================ HACKEREARTH (API + HTML fallback) */
async function scrapeHackerEarth() {
  console.log('[HackerEarth] Starting...');
  const results = [];
  try {
    // HackerEarth public challenges endpoint
    const { data } = await axios.get('https://www.hackerearth.com/challenges/', {
      params: { format: 'json' },
      headers: { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 12000
    });

    const challenges = data?.results || data?.challenges || [];
    for (const c of challenges.slice(0, 40)) {
      const tags = (c.skills || c.tags || []).map(s => typeof s === 'string' ? s : s.name).filter(Boolean);
      results.push({
        title:       c.title,
        org:         c.company?.name || 'HackerEarth',
        type:        (c.type || '').includes('HACK') ? 'hackathon' : 'competition',
        mode:        'online',
        prize:       c.prize > 0 ? `$${parseInt(c.prize).toLocaleString()}` : 'Prizes Available',
        location:    'Online',
        date:        c.start_tz  ? new Date(c.start_tz).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
        deadline:    c.end_tz    ? new Date(c.end_tz).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Check Site',
        url:         `https://www.hackerearth.com${c.slug || c.url || ''}`,
        description: cleanText(c.description) || `${c.title} — compete on HackerEarth, solve real-world problems and win prizes.`,
        tags:        tags.length ? tags : ['HackerEarth', 'Competitive', 'Programming'],
        status:      determineStatus(c.start_tz, c.end_tz),
        source:      'hackerearth',
        source_id:   `hackerearth-${c.id || (c.slug || '').replace(/\//g, '-')}`,
        emoji:       pickEmoji(tags, c.title),
        team:        'solo',
        level:       (c.difficulty_score || 0) > 60 ? 'advanced' : (c.difficulty_score || 0) > 30 ? 'intermediate' : 'beginner',
        cost:        'free', featured: false, approved: true,
        extended_details: {
          problem_statements: [{ category: 'Challenge', title: c.title, desc: cleanText(c.description).slice(0, 300) || 'Build a solution.' }],
          rules: ['Submit solutions via HackerEarth.', 'Ranked by score + time.', 'Plagiarism disqualifies entry.'],
        }
      });
    }
    console.log(`[HackerEarth] ✓ ${results.length} challenges`);
  } catch (e) {
    console.error('[HackerEarth] API failed, trying HTML fallback:', e.message);
    try {
      const { data: html } = await axios.get('https://www.hackerearth.com/challenges/', { headers: HEADERS, timeout: 12000 });
      const $ = cheerio.load(html);
      $('.challenge-card, .challenge-list-item').each((_, el) => {
        const title = $(el).find('.challenge-name, h4').first().text().trim();
        const url   = 'https://www.hackerearth.com' + ($(el).find('a').first().attr('href') || '');
        const prize = $(el).find('.prize-money, .prize').first().text().trim();
        const date  = $(el).find('.date, .end-date').first().text().trim();
        if (!title) return;
        results.push({
          title, org: 'HackerEarth', type: 'competition', mode: 'online',
          prize: prize || 'Prizes Available', location: 'Online', date: date || 'TBD',
          deadline: date || 'Check Site', url,
          description: `${title} — a coding challenge on HackerEarth.`,
          tags: ['HackerEarth', 'Competitive Programming'], status: 'open',
          source: 'hackerearth',
          source_id: `hackerearth-html-${title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30)}`,
          emoji: '⚡', team: 'solo', level: 'intermediate', cost: 'free',
          featured: false, approved: true, extended_details: { rules: ['Submit via HackerEarth platform.'] }
        });
      });
      console.log(`[HackerEarth] HTML fallback ✓ ${results.length}`);
    } catch (e2) { console.error('[HackerEarth] HTML fallback ✗', e2.message); }
  }
  return results;
}

/* ============================================================ DEVFOLIO (API + HTML fallback) */
async function scrapeDevfolio() {
  console.log('[Devfolio] Starting...');
  const results = [];
  try {
    const { data } = await axios.post('https://api.devfolio.co/api/search/hackathons', {
      q: '', size: 30, from: 0
    }, {
      headers: { ...HEADERS, 'Content-Type': 'application/json', 'Origin': 'https://devfolio.co', 'Referer': 'https://devfolio.co/' },
      timeout: 12000
    });

    const hits = data?.hits?.hits || data?.hackathons || [];
    for (const item of hits) {
      const h = item._source || item;
      const tags = (h.themes || h.tags || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean);
      const slug = h.slug || h.id;
      results.push({
        title:       h.name || h.title,
        org:         h.team || h.organization || 'Devfolio Host',
        type:        'hackathon',
        mode:        h.is_online ? 'online' : (h.has_online && h.has_in_person ? 'hybrid' : 'offline'),
        prize:       h.prize_pool ? `₹${parseInt(h.prize_pool).toLocaleString()}` : 'Prizes Available',
        location:    h.city || (h.is_online ? 'Online' : 'India'),
        date:        h.starts_at ? new Date(h.starts_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
        deadline:    h.registration_closes_at ? new Date(h.registration_closes_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Check Devfolio',
        url:         slug ? `https://${slug}.devfolio.co/` : 'https://devfolio.co/hackathons',
        description: cleanText(h.description) || `${h.name || h.title} — a top India hackathon on Devfolio.`,
        tags:        tags.length ? tags : ['Devfolio', 'India'],
        status:      h.status === 'registrations_open' ? 'open' : h.status === 'ongoing' ? 'ongoing' : 'upcoming',
        source:      'devfolio',
        source_id:   `devfolio-${h.id || slug}`,
        emoji:       pickEmoji(tags, h.name),
        team:        normalizeTeam(h.max_team_size || 4),
        level:       'intermediate', cost: 'free',
        featured:    false,
        image_url:   h.cover_image || h.banner_image || null,
        logo_url:    h.logo || null,
        approved:    true,
        extended_details: {
          problem_statements: [{ category: 'Software', title: 'Open Innovation', desc: cleanText(h.description).slice(0, 300) || 'Build the future of tech.' }],
          rules: [
            `Team: ${h.min_team_size || 1}–${h.max_team_size || 4} members.`,
            'Projects must be built during the hackathon.',
            'Submit on Devfolio before the deadline.',
          ]
        }
      });
    }
    console.log(`[Devfolio] ✓ ${results.length} hackathons`);
  } catch (e) {
    console.error('[Devfolio] API failed, trying HTML fallback:', e.message);
    try {
      const { data: html } = await axios.get('https://devfolio.co/hackathons', { headers: HEADERS, timeout: 12000 });
      const $ = cheerio.load(html);
      // Devfolio renders React — try to get embedded JSON
      const scripts = $('script[type="application/json"], script#__NEXT_DATA__');
      scripts.each((_, el) => {
        try {
          const json = JSON.parse($(el).html());
          const hacks = json?.props?.pageProps?.hackathons || json?.pageProps?.hackathons || [];
          hacks.forEach(h => {
            results.push({
              title: h.name, org: 'Devfolio Host', type: 'hackathon', mode: 'online',
              prize: 'Prizes Available', location: h.city || 'Online', date: 'TBD',
              deadline: 'Check Devfolio', url: `https://${h.slug}.devfolio.co/`,
              description: cleanText(h.description) || `${h.name} — Devfolio hackathon.`,
              tags: ['Devfolio', 'India'], status: 'open', source: 'devfolio',
              source_id: `devfolio-${h.id || h.slug}`, emoji: '⚡', team: 'small',
              level: 'intermediate', cost: 'free', featured: false, approved: true,
              extended_details: { rules: ['Must submit on Devfolio.'] }
            });
          });
        } catch {}
      });
      console.log(`[Devfolio] HTML fallback ✓ ${results.length}`);
    } catch (e2) { console.error('[Devfolio] HTML fallback ✗', e2.message); }
  }
  return results;
}

/* ============================================================ UNSTOP API */
async function scrapeUnstop() {
  console.log('[Unstop] Starting...');
  const results = [];
  try {
    const { data } = await axios.get('https://unstop.com/api/public/opportunity/search-result', {
      params: { opportunity: 'hackathons', per_page: 30, page: 1, deadline: 'active', sort: 'deadline' },
      headers: { ...HEADERS, 'Accept': 'application/json', 'Referer': 'https://unstop.com' },
      timeout: 12000
    });

    const list = data?.data?.data || data?.opportunities || [];
    for (const o of list) {
      const tags = (o.skills || o.tags || []).map(s => typeof s === 'string' ? s : s.name).filter(Boolean);
      const prize = o.prize_money > 0 ? `₹${parseInt(o.prize_money).toLocaleString()}` : (o.prize || 'Prizes Available');
      results.push({
        title:       o.title,
        org:         o.organization?.name || o.company?.name || 'Unstop Host',
        type:        (o.type || '').toLowerCase().includes('hack') ? 'hackathon' : 'competition',
        mode:        o.is_online ? 'online' : (o.city?.toLowerCase() === 'online' ? 'online' : 'offline'),
        prize,
        location:    o.city || (o.is_online ? 'Online' : 'India'),
        date:        o.start_date ? new Date(o.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD',
        deadline:    o.registration_deadline ? new Date(o.registration_deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Check Unstop',
        url:         `https://unstop.com${o.public_url || '/hackathons/' + (o.id || '')}`,
        description: cleanText(o.description || o.description_text) || `${o.title} on Unstop — India's largest student competition platform.`,
        tags:        tags.length ? tags : ['Unstop', 'India', 'Competition'],
        status:      determineStatus(o.start_date, o.registration_deadline),
        source:      'unstop',
        source_id:   `unstop-${o.id}`,
        emoji:       pickEmoji(tags, o.title),
        team:        normalizeTeam(o.max_team_size || 4),
        level:       'intermediate',
        cost:        o.registration_fee > 0 ? 'paid' : 'free',
        featured:    o.is_featured || false,
        image_url:   o.banner || o.cover_image || null,
        logo_url:    o.logo || o.organization?.logo || null,
        approved:    true,
        extended_details: {
          problem_statements: [{ category: 'Challenge', title: 'Main Track', desc: cleanText(o.description).slice(0, 300) || 'Build something impactful.' }],
          rules: [
            `Team: ${o.min_team_size || 1}–${o.max_team_size || 4} members.`,
            ...(o.eligibility ? [`Eligibility: ${o.eligibility}`] : []),
            'Register on Unstop before the deadline.',
          ]
        }
      });
    }
    console.log(`[Unstop] ✓ ${results.length} hackathons`);
  } catch (e) { console.error('[Unstop] ✗', e.message); }
  return results;
}

/* ============================================================ DEVPOST RSS (backup/extra) */
async function scrapeDevpostRSS() {
  console.log('[Devpost RSS] Starting...');
  const results = [];
  try {
    const { data } = await axios.get('https://devpost.com/hackathons.rss', { headers: HEADERS, timeout: 10000 });
    const $ = cheerio.load(data, { xmlMode: true });
    $('item').each((_, el) => {
      const title   = $(el).find('title').text().trim();
      const url     = $(el).find('link').text().trim();
      const desc    = cleanText($(el).find('description').text());
      const pubDate = $(el).find('pubDate').text().trim();
      if (!title || !url) return;
      results.push({
        title, org: 'Devpost Community', type: 'hackathon', mode: 'online',
        prize: 'Prizes Available', location: 'Online',
        date: pubDate ? new Date(pubDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'TBD',
        deadline: 'Check Devpost', url,
        description: desc || `${title} — hosted on Devpost.`,
        tags: ['Devpost', 'Innovation'], status: 'open', source: 'devpost',
        source_id: `devpost-rss-${Buffer.from(url).toString('base64').slice(0, 20)}`,
        emoji: '💻', team: 'small', level: 'intermediate', cost: 'free',
        featured: false, approved: true,
        extended_details: { rules: ['Register on Devpost.', 'Original work only.'] }
      });
    });
    console.log(`[Devpost RSS] ✓ ${results.length} items`);
  } catch (e) { console.error('[Devpost RSS] ✗', e.message); }
  return results;
}

/* ============================================================ MAIN RUNNER */
async function runScraper() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 PhantomHacks Scraper v4 — ' + new Date().toLocaleString('en-IN'));
  console.log('='.repeat(60));
  const t0 = Date.now();

  // Run all scrapers in parallel
  const [dpRes, mlhRes, heRes, dfRes, usRes, rssRes] = await Promise.allSettled([
    scrapeDevpost(),
    scrapeMLH(),
    scrapeHackerEarth(),
    scrapeDevfolio(),
    scrapeUnstop(),
    scrapeDevpostRSS(),
  ]);

  // Flatten and deduplicate by source_id
  const allEvents = [
    ...(dpRes.value  || []),
    ...(mlhRes.value || []),
    ...(heRes.value  || []),
    ...(dfRes.value  || []),
    ...(usRes.value  || []),
    ...(rssRes.value || []),
  ];

  const uniqueMap = new Map();
  for (const ev of allEvents) {
    if (ev.source_id && !uniqueMap.has(ev.source_id)) uniqueMap.set(ev.source_id, ev);
  }
  const freshEvents = Array.from(uniqueMap.values());
  console.log(`\n📊 Total unique events scraped: ${freshEvents.length}`);

  // Fetch all existing hackathons from DB
  const { data: existingAll, error: fetchErr } = await supabase.from('hackathons').select('id, source, source_id, title');
  if (fetchErr) { console.error('❌ Could not fetch existing hackathons:', fetchErr.message); return; }

  const existingMap = new Map((existingAll || []).map(r => [r.source_id, r]));
  const freshIds = new Set(freshEvents.map(e => e.source_id));

  let inserted = 0, updated = 0, closed = 0, errors = 0;

  // Insert or Update
  for (const ev of freshEvents) {
    ev.scraped_at = new Date().toISOString();
    if (existingMap.has(ev.source_id)) {
      const { error } = await supabase.from('hackathons').update({
        deadline: ev.deadline, prize: ev.prize, status: ev.status,
        description: ev.description, tags: ev.tags,
        image_url: ev.image_url, logo_url: ev.logo_url,
        extended_details: ev.extended_details, scraped_at: ev.scraped_at,
      }).eq('source_id', ev.source_id);
      if (error) { console.error(`  ✗ Update (${ev.title}):`, error.message); errors++; }
      else updated++;
    } else {
      const { error } = await supabase.from('hackathons').insert([ev]);
      if (error) { console.error(`  ✗ Insert (${ev.title}):`, error.message); errors++; }
      else { inserted++; console.log(`  + ${ev.title} [${ev.source}]`); }
    }
  }

  // Mark stale as closed instead of deleting
  const scrapedSources = new Set(['devpost', 'mlh', 'hackerearth', 'devfolio', 'unstop']);
  for (const [sid, dbEv] of existingMap) {
    if (scrapedSources.has(dbEv.source) && !freshIds.has(sid)) {
      const { error } = await supabase.from('hackathons').update({ status: 'closed' }).eq('source_id', sid);
      if (!error) { closed++; }
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log(`✅  Done in ${elapsed}s`);
  console.log(`  ➕  Inserted : ${inserted}`);
  console.log(`  🔄  Updated  : ${updated}`);
  console.log(`  ✕   Closed   : ${closed}`);
  console.log(`  ❌  Errors   : ${errors}`);
  console.log('='.repeat(60) + '\n');
}

/* ============================================================ ENTRY POINT */
// Run immediately on start
runScraper().catch(console.error);

// Then every 6 hours via cron
if (require.main === module) {
  cron.schedule('0 */6 * * *', () => {
    console.log('⏰ Cron triggered — running scheduled scrape...');
    runScraper().catch(console.error);
  });
  console.log('📅 Scraper armed: runs every 6 hours (Ctrl+C to stop)\n');
}
