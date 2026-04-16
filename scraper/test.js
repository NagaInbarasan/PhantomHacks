const axios = require('axios');
const cheerio = require('cheerio');

async function testMLH() {
    try {
        const { data } = await axios.get('https://mlh.io/seasons/2025/events');
        const $ = cheerio.load(data);
        const events = [];
        $('.event-wrapper').each((i, el) => {
            if (i > 3) return; // limit to 4
            const title = $(el).find('.event-name').text().trim();
            const date = $(el).find('.event-date').text().trim();
            const loc = $(el).find('.event-location').text().trim();
            const url = $(el).find('.event-link').attr('href');
            events.push({ title, date, loc, url });
        });
        console.log("MLH Events:", events);
    } catch (e) {
        console.error("MLH Error:", e.message);
    }
}
testMLH();
