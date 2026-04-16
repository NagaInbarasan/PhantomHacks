const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const cheerio = require('cheerio');

const SUPA_URL = 'https://frffynlzejbtnapooqvu.supabase.co';
const SUPA_KEY = 'sb_publishable_QW3l1XzcOGcvKIKeGVUv9w_jfe0IUtS';
const supabase = createClient(SUPA_URL, SUPA_KEY);

/**
 * Modular Hackathon Scraper v2
 * Goal: Aggregate data from Devpost, MLH, Unstop, and Devfolio.
 */

/* ============================================================ DEVPOST */
async function scrapeDevpost() {
    console.log('[+] Scraping Devpost API...');
    try {
        const { data } = await axios.get('https://devpost.com/api/hackathons', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const hackathons = data.hackathons || [];
        console.log(`[+] Found ${hackathons.length} hackathons from Devpost.`);
        
        return hackathons.map(h => ({
            title: h.title,
            org: h.organization_name || "Devpost Host",
            type: "hackathon",
            mode: h.displayed_location?.location?.toLowerCase().includes('online') ? "online" : (h.displayed_location?.location ? "offline" : "online"),
            prize: h.prize_amount ? `$${h.prize_amount.toLocaleString()}` : "Prizes Available",
            location: h.displayed_location?.location || "Online",
            date: h.submission_period_dates || "",
            deadline: h.time_left_to_submit || "Ongoing",
            url: h.url,
            description: h.description || `${h.title} is a premier developer event hosted on Devpost.`,
            tags: (h.themes || []).map(t => t.name),
            status: "open",
            source: "devpost",
            source_id: `devpost-${h.id}`,
            emoji: "💻",
            team: h.max_team_size > 1 ? "small" : "solo",
            level: "intermediate",
            cost: "free",
            featured: h.featured || false,
            image_url: h.thumbnail_url, // Devpost small image
            logo_url: h.thumbnail_url,  // On Devpost these are often the same or thumbnail is the best logo
            extended_details: {
                problem_statements: [
                    { category: "Main Track", title: "General Innovation", desc: h.description || "Building something novel using the requested technologies." }
                ],
                rules: [
                    "Must be original work.",
                    "Submissions close by the stated deadline on Devpost."
                ]
            }
        }));
    } catch (e) {
        console.error("[-] Devpost Scrape Error:", e.message);
        return [];
    }
}

/* ============================================================ MLH */
async function scrapeMLH() {
    console.log('[+] Scraping MLH Website...');
    try {
        const { data } = await axios.get('https://mlh.io/seasons/2025/events', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const events = [];
        
        $('.event-wrapper').each((i, el) => {
            const title = $(el).find('.event-name').text().trim();
            const date = $(el).find('.event-date').text().trim();
            const loc = $(el).find('.event-location span').text().trim() || $(el).find('.event-location').text().trim();
            const url = $(el).find('.event-link').attr('href');
            const logo = $(el).find('.event-logo img').attr('src');
            const banner = $(el).find('.event-image img').attr('src');
            
            if (title && url) {
                events.push({
                    title: title,
                    org: "Major League Hacking (MLH)",
                    type: "hackathon",
                    mode: loc.toLowerCase().includes('online') ? "online" : "offline",
                    prize: "MLH Swag & Prizes",
                    location: loc,
                    date: date,
                    deadline: "Check Site",
                    url: url,
                    description: `${title} is an official Major League Hacking event. Join hundreds of hackers for a weekend of building and learning.`,
                    tags: ["MLH", "Student", "Community"],
                    status: "open",
                    source: "mlh",
                    source_id: `mlh-${title.toLowerCase().replace(/\s+/g, '-')}-${date.replace(/\s+/g, '-')}`,
                    emoji: "🚩",
                    team: "small",
                    level: "beginner",
                    cost: "free",
                    featured: false,
                    image_url: banner || logo, 
                    logo_url: logo,
                    extended_details: {
                        problem_statements: [
                            { category: "MLH Track", title: "Best Use of Tech", desc: "Build the most innovative use of the sponsored technologies." }
                        ],
                        rules: [
                            "Must follow the MLH Code of Conduct.",
                            "Open to students and recent graduates."
                        ]
                    }
                });
            }
        });
        console.log(`[+] Found ${events.length} hackathons from MLH.`);
        return events;
    } catch (e) {
        console.error("[-] MLH Scrape Error:", e.message);
        return [];
    }
}

/* ============================================================ DEVFOLIO */
async function scrapeDevfolio() {
    console.log('[+] Scraping Devfolio Website...');
    try {
        const { data } = await axios.get('https://devfolio.co/hackathons', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const $ = cheerio.load(data);
        const events = [];

        // Devfolio often uses specific card classes
        $('div[class*="HackathonCard"]').each((i, el) => {
            const title = $(el).find('h3').first().text().trim();
            const org = $(el).find('p').first().text().trim();
            const link = $(el).find('a[href*="devfolio.co"]').attr('href');
            const logo = $(el).find('img[src*="logo"], img[class*="Logo"]').attr('src') || $(el).find('img').first().attr('src');
            const mainImg = $(el).find('img').last().attr('src') || logo;
            const prize = $(el).find('p:contains("$"), p:contains("₹")').text().trim() || "Prizes available";
            
            if (title && link) {
                events.push({
                    title: title,
                    org: org || "Devfolio Host",
                    type: "hackathon",
                    mode: "online", 
                    prize: prize,
                    location: "Online / India",
                    date: "TBD",
                    deadline: "Check Devfolio",
                    url: link,
                    description: `${title} is a top-tier hackathon hosted on Devfolio. Connect with mentors and build amazing things.`,
                    tags: ["Devfolio", "Web3", "AI"],
                    status: "open",
                    source: "devfolio",
                    source_id: `devfolio-${title.toLowerCase().replace(/\s+/g, '-')}`,
                    emoji: "⚡",
                    team: "small",
                    level: "intermediate",
                    cost: "free",
                    featured: false,
                    image_url: mainImg,
                    logo_url: logo,
                    extended_details: {
                        problem_statements: [{ category: "Software", title: "Open Innovation", desc: "Building the future of decentralized tech." }],
                        rules: ["Must submit on Devfolio.", "Eligibility depends on specific event tracks."]
                    }
                });
            }
        });
        console.log(`[+] Found ${events.length} hackathons from Devfolio.`);
        return events;
    } catch (e) {
        console.error("[-] Devfolio Scrape Error:", e.message);
        return [];
    }
}

/* ============================================================ UNSTOP FALLBACK */
async function scrapeUnstop() {
    console.log('[+] Scraping Unstop (Curated Fallback)...');
    try {
        return [
            {
                title: "Flipkart GRID 6.0",
                org: "Flipkart",
                type: "competition",
                mode: "online",
                prize: "₹5,00,000",
                location: "Online",
                date: "Aug - Oct 2026",
                deadline: "August 30, 2026",
                url: "https://unstop.com/hackathons/flipkart-grid-60-robotics-challenge-flipkart-grid-60-flipkart-896453",
                description: "GRID is Flipkart’s Flagship Engineering Campus Challenge.",
                tags: ["E-commerce", "Robotics", "AI"],
                status: "upcoming",
                source: "unstop",
                source_id: "unstop-flipkart-grid-6",
                emoji: "🛒",
                team: "small",
                level: "advanced",
                cost: "free",
                featured: true,
                image_url: "https://d8it4huxumps7.cloudfront.net/uploads/images/6618d3480327f_grid_6.png",
                logo_url: "https://d8it4huxumps7.cloudfront.net/uploads/images/6618d3480327f_grid_6.png",
                extended_details: {
                    problem_statements: [{ category: "Software", title: "Next-gen Supply Chain", desc: "Optimize delivery using AI." }],
                    rules: ["B.E/B.Tech students only."]
                }
            }
        ];
    } catch (e) {
        return [];
    }
}

/* ============================================================ RUNNER */
async function runScraper() {
    try {
        console.log('🤖 Starting PhantomHacks Modular Scraper v3...');
        
        const devpostEvents = await scrapeDevpost();
        const mlhEvents = await scrapeMLH();
        const devfolioEvents = await scrapeDevfolio();
        const unstopEvents = await scrapeUnstop();
        
        let freshEvents = [...devpostEvents, ...mlhEvents, ...devfolioEvents, ...unstopEvents];
        // Deduplicate fresh events by source_id to avoid double insertion in the same run
        const uniqueFreshMap = new Map();
        for (const ev of freshEvents) {
            if (!uniqueFreshMap.has(ev.source_id)) {
                uniqueFreshMap.set(ev.source_id, ev);
            }
        }
        freshEvents = Array.from(uniqueFreshMap.values());
        
        console.log(`[!] Total unique events extracted: ${freshEvents.length}`);

        // Get ALL existing hackathons from database
        const { data: existingAll } = await supabase.from('hackathons').select('id, source, source_id, title');
        const existingMap = new Map(existingAll?.map(r => [r.source_id, r]) || []);
        
        // Tracking IDs seen in this scrape to identify missing ones
        const freshIds = new Set(freshEvents.map(e => e.source_id));

        let inserted = 0;
        let updated = 0;
        let removed = 0;

        // 1. UPDATE or INSERT
        for (const event of freshEvents) {
            if (existingMap.has(event.source_id)) {
                // UPDATE (Refresh fields)
                const { error } = await supabase.from('hackathons').update({
                    deadline: event.deadline,
                    prize: event.prize,
                    status: event.status,
                    image_url: event.image_url,
                    logo_url: event.logo_url,
                    extended_details: event.extended_details,
                    scraped_at: new Date().toISOString()
                }).eq('source_id', event.source_id);
                if (error) console.error(`[-] Update Error (${event.title}):`, error.message);
                else updated++;
            } else {
                // INSERT
                event.scraped_at = new Date().toISOString();
                event.approved = true; 
                const { error } = await supabase.from('hackathons').insert([event]);
                if (!error) inserted++;
                else console.error(`[-] Insert Error (${event.title}):`, error.message);
            }
        }

        // 2. DETECT REMOVALS (If in DB but not in fresh scrape for that source)
        // Group by source to avoid deleting things from sources we didn't scrape this time
        const activeSources = ['devpost', 'mlh', 'devfolio', 'unstop'];
        
        for (const [sid, dbEv] of existingMap) {
            if (activeSources.includes(dbEv.source) && !freshIds.has(sid)) {
                console.log(`[!] Hackathon expired/removed from source: ${dbEv.title} (${sid})`);
                const { error } = await supabase.from('hackathons').delete().eq('source_id', sid);
                if (!error) removed++;
                else console.error(`[-] Deletion Error (${dbEv.title}):`, error.message);
            }
        }

        console.log(`✅ Scrape Complete.`);
        console.log(`[+] Inserted: ${inserted}`);
        console.log(`[*] Updated:  ${updated}`);
        console.log(`[-] Removed:  ${removed}`);
        
    } catch (error) {
        console.error('❌ Critical Scraper Failure:', error);
    }
}

runScraper();
