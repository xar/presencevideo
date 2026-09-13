/**
 * Trend-informed short-form video FORMATS, as data.
 *
 * This is a curated snapshot of the structural formats that were performing on
 * TikTok / Reels / Shorts as of September 2026, compiled from public creative
 * research (TikTok Creative Center trend write-ups, SocialInsider, Metricool,
 * Sprout Social, Wistia and Vidyard benchmark reports, plus agency teardowns of
 * ad creative). Each entry keeps its `source` so the claim behind it can be
 * re-checked when this list is refreshed.
 *
 * It is deliberately STRUCTURE, not trend chasing: a format is a beat skeleton
 * ("hook, agitate, solve, CTA"), which turns over on a scale of months, unlike
 * a trending sound, which turns over in days. Nothing here reaches for a live
 * API — refreshing this file by hand is the maintenance model.
 *
 * `templateKey` must name a key of `config('agent_video_templates.templates')`;
 * the producer agent resolves that to a recipe. `trend-formats.test.ts` pins the
 * two lists together so a renamed template cannot silently orphan a card.
 */

export type TrendCategory = 'ads' | 'education' | 'story' | 'demo' | 'brand';

export type TrendPlatform = 'tiktok' | 'reels' | 'shorts';

/** Template keys defined in config/agent_video_templates.php. */
export type TrendTemplateKey = 'general_video' | 'ugc_ad' | 'short_drama' | 'education';

export type TrendBeat = {
    /** Short beat name, e.g. "Hook". */
    label: string;
    /** Human-readable time range within the video, e.g. "0-3s". */
    seconds: string;
    /** What the viewer sees during the beat. */
    onScreen: string;
};

export type TrendFormat = {
    id: string;
    name: string;
    /** One line describing what the viewer actually sees. */
    description: string;
    category: TrendCategory;
    platforms: TrendPlatform[];
    /** Inclusive runtime range in seconds. */
    durationSeconds: [number, number];
    templateKey: TrendTemplateKey;
    beats: TrendBeat[];
    /** The retention mechanic — why the format holds attention. */
    whyItWorks: string;
    /** Niches the format suits. */
    niches: string[];
    /** Brief handed to the producer agent. `[...]` marks what the user fills in. */
    prompt: string;
    /** Shown on the card grid before a category is chosen. */
    featured: boolean;
    /** Public write-up backing the beat structure. */
    source: string;
};

export const TREND_CATEGORY_LABELS: Record<TrendCategory, string> = {
    ads: 'Ads & UGC',
    education: 'Educational',
    story: 'Story',
    demo: 'Product demo',
    brand: 'Personal brand',
};

export const TREND_FORMATS: TrendFormat[] = [
    {
        id: 'problem-agitate-solve',
        name: 'Problem / Agitate / Solve',
        description: 'Names a pain point, sits in the discomfort, then resolves it with the product.',
        category: 'ads',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [15, 30],
        templateKey: 'ugc_ad',
        beats: [
            { label: 'Hook', seconds: '0-3s', onScreen: 'Talking head names the pain out loud' },
            { label: 'Agitate', seconds: '3-10s', onScreen: 'B-roll of the problem at its worst' },
            { label: 'Solve', seconds: '10-20s', onScreen: 'Product in use, one clear benefit' },
            { label: 'CTA', seconds: '20-30s', onScreen: 'Offer card over a product shot' },
        ],
        whyItWorks: 'Realistic agitation makes the viewer feel seen before the pitch lands.',
        niches: ['Ecommerce', 'DTC', 'Apps', 'SaaS'],
        prompt:
            'Make a 25-second vertical UGC ad for [product or service]. Open by naming the problem out loud in the first 2 seconds, agitate it with a shot of the problem at its worst, then show the product solving it with one specific benefit, and close on a direct CTA. Keep captions burned in and inside the safe zone.',
        featured: true,
        source: 'https://reloop.so/blog/article/ugc-script-templates/',
    },
    {
        id: 'ugc-testimonial',
        name: 'Raw testimonial',
        description: 'A real customer talks to camera about their result, selfie-style, no b-roll.',
        category: 'ads',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [30, 45],
        templateKey: 'ugc_ad',
        beats: [
            { label: 'Hook', seconds: '0-3s', onScreen: 'The result, stated up front' },
            { label: 'Credibility', seconds: '3-15s', onScreen: 'Who I am, why I tried it' },
            { label: 'Proof', seconds: '15-30s', onScreen: 'The specific change, with numbers' },
            { label: 'Soft CTA', seconds: '30-45s', onScreen: 'Casual recommendation, handle on screen' },
        ],
        whyItWorks: 'Low production value reads as a peer recommendation rather than a brand pitch.',
        niches: ['Beauty', 'Supplements', 'Wellness', 'SaaS'],
        prompt:
            'Write and build a 40-second raw testimonial video for [product]. One chest-up talking head throughout, no b-roll. Lead with the result in the first 3 seconds, then who I am and why I tried it, then the specific change with a number, and end on a casual recommendation rather than a hard sell.',
        featured: true,
        source: 'https://reloop.so/blog/article/talking-head/',
    },
    {
        id: 'before-after',
        name: 'Before / After reveal',
        description: 'A held "before" shot, a hard-cut transition, then the "after" in identical framing.',
        category: 'ads',
        platforms: ['tiktok', 'reels', 'shorts'],
        durationSeconds: [15, 45],
        templateKey: 'general_video',
        beats: [
            { label: 'Before', seconds: '0-5s', onScreen: 'The problem state, held still' },
            { label: 'Transition', seconds: '5-7s', onScreen: 'Whip-pan or hard cut on a music sting' },
            { label: 'After', seconds: '7-20s', onScreen: 'Same angle, same light, transformed' },
            { label: 'CTA', seconds: '20-30s', onScreen: 'How it was done, in one line' },
        ],
        whyItWorks: 'Visual proof needs no claim to fact-check — but the before must look authentic or comments call it out.',
        niches: ['Fitness', 'Skincare', 'Home improvement', 'Local trades'],
        prompt:
            'Build a 30-second before/after transformation video for [subject]. Hold the before state for the first 5 seconds in a fixed frame, cut hard on a beat, then reveal the after in the exact same framing and hold it longer. Keep the before honest and unexaggerated. End with one line on how it was done.',
        featured: true,
        source: 'https://miraflow.ai/blog/how-to-go-viral-2026-what-actually-works-across-platforms',
    },
    {
        id: 'split-comparison',
        name: 'This vs. That',
        description: 'Screen split in two: the old way on one side, your product on the other, running at once.',
        category: 'ads',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [15, 60],
        templateKey: 'general_video',
        beats: [
            { label: 'Setup', seconds: '0-3s', onScreen: 'Split screen labelled on both sides' },
            { label: 'Race', seconds: '3-20s', onScreen: 'Both methods run simultaneously' },
            { label: 'Gap', seconds: '20-30s', onScreen: 'One side finishes, the other is still going' },
            { label: 'Verdict', seconds: '30-40s', onScreen: 'Winner card with the time or cost saved' },
        ],
        whyItWorks: 'Visual contrast sells without a claim, and it reliably starts a debate in the comments.',
        niches: ['Ecommerce', 'SaaS', 'Tools'],
        prompt:
            'Build a 30-second split-screen comparison for [product] versus [the old way]. Label both sides in the first 3 seconds, run them side by side so the gap becomes obvious on its own, then land a verdict card with the concrete time or money saved.',
        featured: false,
        source: 'https://www.stackmatix.com/blog/tiktok-ad-creative-trends-2026',
    },
    {
        id: 'skeptic-convert',
        name: 'Skeptic convert',
        description: 'Voices the doubt the viewer already has, then flips it with proof.',
        category: 'ads',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [20, 30],
        templateKey: 'ugc_ad',
        beats: [
            { label: 'Doubt', seconds: '0-3s', onScreen: 'The objection said out loud' },
            { label: 'Test', seconds: '3-15s', onScreen: 'Trying it anyway, unimpressed' },
            { label: 'Flip', seconds: '15-25s', onScreen: 'The moment it works, reaction included' },
            { label: 'CTA', seconds: '25-30s', onScreen: 'Recommendation with the caveat kept in' },
        ],
        whyItWorks: 'Pre-empting the objection defuses it; the reversal is the payoff the viewer stays for.',
        niches: ['Health', 'Beauty', 'High-ticket', 'Bold-claim categories'],
        prompt:
            'Build a 30-second skeptic-convert ad for [product]. Open by saying the exact objection people have about it, show me trying it unconvinced, then the moment it actually works with a genuine reaction. Keep one honest caveat in the close so it stays credible.',
        featured: false,
        source: 'https://www.cinerads.com/blog/ugc-ad-examples-that-convert',
    },
    {
        id: 'dream-state',
        name: 'Dream state',
        description: 'Sells the end-state feeling rather than the product features.',
        category: 'ads',
        platforms: ['tiktok', 'reels', 'shorts'],
        durationSeconds: [20, 40],
        templateKey: 'general_video',
        beats: [
            { label: 'Aspiration', seconds: '0-3s', onScreen: 'The outcome, no product in frame' },
            { label: 'Bridge', seconds: '3-20s', onScreen: 'How the product delivers that feeling' },
            { label: 'Proof', seconds: '20-30s', onScreen: 'One concrete detail that makes it real' },
            { label: 'Return', seconds: '30-40s', onScreen: 'Back to the feeling, not the features' },
        ],
        whyItWorks: 'Identity and end-state beat specification lists in categories bought on feeling.',
        niches: ['Lifestyle', 'Skincare', 'Fitness', 'Travel'],
        prompt:
            'Build a 35-second aspirational video for [product]. Open on the end-state the customer actually wants, with the product nowhere in frame. Bridge to how the product delivers that feeling, ground it with one concrete proof detail, then close back on the feeling rather than the features.',
        featured: false,
        source: 'https://www.pigeondigital.com/insight/video-ad-formats-founder-story-dream-state-ugly-ad',
    },
    {
        id: 'listicle-countdown',
        name: 'Countdown listicle',
        description: 'Numbered items counted down to a payoff, one card per item.',
        category: 'education',
        platforms: ['shorts', 'tiktok'],
        durationSeconds: [30, 60],
        templateKey: 'education',
        beats: [
            { label: 'Premise', seconds: '0-3s', onScreen: 'Number-teaser text card' },
            { label: 'Items', seconds: '3-45s', onScreen: 'Number badge + b-roll, 5-8s each' },
            { label: 'Number one', seconds: '45-55s', onScreen: 'Held longest, the real payoff' },
            { label: 'CTA', seconds: '55-60s', onScreen: 'Agree/disagree comment bait' },
        ],
        whyItWorks: 'The count is a built-in progress bar, and disagreement about the ranking drives comments.',
        niches: ['Education', 'Product roundups', 'Opinion'],
        prompt:
            'Build a 45-second countdown listicle about [topic]. Open with a number-teaser card, give each item its own beat with a number badge and supporting visual, hold number one the longest, and end by inviting disagreement in the comments.',
        featured: true,
        source: 'https://www.teleprompter.com/blog/trending-youtube-shorts',
    },
    {
        id: 'myth-buster',
        name: 'Myth buster',
        description: 'A contrarian claim, then rapid-fire facts that overturn the common belief.',
        category: 'education',
        platforms: ['tiktok', 'shorts', 'reels'],
        durationSeconds: [30, 60],
        templateKey: 'education',
        beats: [
            { label: 'Claim', seconds: '0-3s', onScreen: 'Bold contrarian text card' },
            { label: 'The myth', seconds: '3-15s', onScreen: 'What everyone believes, illustrated' },
            { label: 'The truth', seconds: '15-40s', onScreen: '2-3 rapid facts with b-roll each' },
            { label: 'Reframe', seconds: '40-50s', onScreen: 'What to do instead' },
        ],
        whyItWorks: 'Correcting a myth carries social currency, so viewers share it to look informed.',
        niches: ['Education', 'Science', 'Finance', 'Self-improvement'],
        prompt:
            'Build a 45-second myth-buster about [topic]. Open with a bold contrarian claim, state the myth everyone believes, overturn it with two or three rapid-fire facts each on its own beat, then close with what to do instead.',
        featured: false,
        source: 'https://miraflow.ai/blog/how-to-go-viral-2026-what-actually-works-across-platforms',
    },
    {
        id: 'tutorial-steps',
        name: 'How-to in N steps',
        description: 'Shows the finished result first, then the numbered steps that got there.',
        category: 'education',
        platforms: ['shorts', 'tiktok', 'reels'],
        durationSeconds: [30, 60],
        templateKey: 'education',
        beats: [
            { label: 'Result first', seconds: '0-3s', onScreen: 'The finished thing, already done' },
            { label: 'Steps', seconds: '3-45s', onScreen: 'Numbered steps, 5-10s each, hands-on' },
            { label: 'Validation', seconds: '45-55s', onScreen: 'Result again, now earned' },
            { label: 'CTA', seconds: '55-60s', onScreen: 'Save-this prompt' },
        ],
        whyItWorks: 'Highest save rate of any format — viewers bookmark it to do it later, and saves rank.',
        niches: ['Education', 'Cooking', 'Productivity', 'Beauty'],
        prompt:
            'Build a 50-second how-to for [task]. Show the finished result in the first 3 seconds, then walk through the numbered steps with a clear visual for each, return to the result at the end, and prompt the viewer to save it. Captions in the upper third so they never cover the demo.',
        featured: true,
        source: 'https://focusee.imobie.com/product-demo/product-demo-videos-for-tiktok.htm',
    },
    {
        id: 'saas-micro-demo',
        name: 'SaaS micro-demo',
        description: 'A screen recording that pays off a specific, measurable promise.',
        category: 'demo',
        platforms: ['shorts', 'tiktok'],
        durationSeconds: [30, 60],
        templateKey: 'education',
        beats: [
            { label: 'Promise', seconds: '0-3s', onScreen: 'Specific value claim over the app' },
            { label: 'Problem', seconds: '3-8s', onScreen: 'The tedious way, briefly' },
            { label: 'Walkthrough', seconds: '8-45s', onScreen: 'Screen recording, zoomed on each click' },
            { label: 'Payoff', seconds: '45-60s', onScreen: 'Result that proves the opening claim' },
        ],
        whyItWorks: 'Utility plus entertainment; referenceable content gets saved and re-watched.',
        niches: ['SaaS', 'B2B', 'Productivity tools'],
        prompt:
            'Build a 50-second product demo for [tool or feature]. Open with a specific measurable promise, show the tedious old way in one beat, walk through the feature as a zoomed screen recording, and close by proving the opening claim with the result.',
        featured: false,
        source: 'https://reap.video/blog/saas-founders-shorts-traffic',
    },
    {
        id: 'unboxing-asmr',
        name: 'Unboxing / ASMR reveal',
        description: 'Macro shots and product sound do the persuading — barely any talking.',
        category: 'demo',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [15, 45],
        templateKey: 'general_video',
        beats: [
            { label: 'Tease', seconds: '0-3s', onScreen: 'Texture or sound, cuts every second' },
            { label: 'Reveal', seconds: '3-20s', onScreen: 'Unboxing in close-up, sound-led' },
            { label: 'Reaction', seconds: '20-30s', onScreen: 'First genuine verdict' },
            { label: 'CTA', seconds: '30-35s', onScreen: 'Where to get it' },
        ],
        whyItWorks: 'Anticipation-and-reveal plus sound design; the pattern interrupt is sensory, not verbal.',
        niches: ['Gadgets', 'Beauty', 'Subscription boxes', 'Food'],
        prompt:
            'Build a 30-second unboxing video for [product]. Open on a close-up texture or sound tease with fast cuts, reveal the product in macro with the packaging sounds carried, land a genuine first reaction, and close on where to get it. Minimal narration — let the sound lead.',
        featured: false,
        source: 'https://creetr.com/blog/unboxing-video-guide',
    },
    {
        id: 'cost-breakdown',
        name: 'Cost breakdown',
        description: 'Item-by-item price reveal that builds to a surprising total.',
        category: 'demo',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [20, 30],
        templateKey: 'education',
        beats: [
            { label: 'Total tease', seconds: '0-3s', onScreen: 'The final number, stated up front' },
            { label: 'Items', seconds: '3-20s', onScreen: 'Each item with a price overlay' },
            { label: 'Total', seconds: '20-27s', onScreen: 'Sum card, larger than the rest' },
            { label: 'CTA', seconds: '27-30s', onScreen: 'Full list in the comments' },
        ],
        whyItWorks: 'Budget transparency reads as honesty, and the running total is its own open loop.',
        niches: ['Fashion', 'Home decor', 'Budget content'],
        prompt:
            'Build a 25-second cost breakdown for [collection or project]. Tease the surprising total in the first 3 seconds, go item by item with a price overlay on each, land the sum on a larger card, and point to the full list in the comments.',
        featured: false,
        source: 'https://www.cinerads.com/blog/ugc-ad-examples-that-convert',
    },
    {
        id: 'storytime',
        name: 'Storytime micro-drama',
        description: 'An open loop that keeps re-opening — a tiny screenplay with a twist.',
        category: 'story',
        platforms: ['tiktok', 'shorts'],
        durationSeconds: [30, 90],
        templateKey: 'short_drama',
        beats: [
            { label: 'Open loop', seconds: '0-3s', onScreen: 'Mid-sentence, already in the story' },
            { label: 'Escalate', seconds: '3-45s', onScreen: 'Quick-cut beats, each a mini-cliffhanger' },
            { label: 'Twist', seconds: '45-70s', onScreen: 'The reveal that recontextualises it' },
            { label: 'Loop back', seconds: '70-80s', onScreen: 'Line that sends the viewer to the start' },
        ],
        whyItWorks: 'Sustained open loops; every beat closes one question and opens another.',
        niches: ['Personal brand', 'Entertainment', 'Brand storytelling'],
        prompt:
            'Build a 60-second storytime about [what happened]. Start mid-sentence, already inside the story. Escalate across quick-cut beats where each one ends on a fresh unanswered question, land a twist that recontextualises the opening, and end on a line that makes the viewer want to rewatch.',
        featured: true,
        source: 'https://www.tokportal.com/post/the-10-best-formats-to-go-viral-on-tiktok-and-instagram-in-2026',
    },
    {
        id: 'pov-scenario',
        name: 'POV scenario',
        description: 'A first-person premise that makes the viewer a participant, not an observer.',
        category: 'story',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [20, 60],
        templateKey: 'short_drama',
        beats: [
            { label: 'Premise', seconds: '0-3s', onScreen: 'POV text card over the opening shot' },
            { label: 'Immersion', seconds: '3-40s', onScreen: 'Scene played from that camera position' },
            { label: 'Punchline', seconds: '40-55s', onScreen: 'The resolution or the joke' },
        ],
        whyItWorks: 'Second-person framing implicates the viewer directly, so scrolling past feels like leaving.',
        niches: ['Comedy', 'Relatable', 'Product discovery'],
        prompt:
            'Build a 40-second POV video with the premise "POV: [scenario]". Put the POV line on screen in the first 3 seconds, play the whole scene from that camera position so the viewer is inside it, and land a punchline or resolution at the end.',
        featured: false,
        source: 'https://miraflow.ai/blog/how-to-go-viral-2026-what-actually-works-across-platforms',
    },
    {
        id: 'founder-story',
        name: 'Founder story',
        description: 'The maker explains the frustration that made them build the thing.',
        category: 'brand',
        platforms: ['reels', 'tiktok'],
        durationSeconds: [30, 60],
        templateKey: 'ugc_ad',
        beats: [
            { label: 'Hook', seconds: '0-3s', onScreen: 'Who I am and the problem I had' },
            { label: 'Why', seconds: '3-30s', onScreen: 'What I tried, why nothing worked' },
            { label: 'Build', seconds: '30-50s', onScreen: 'What I made and the one thing it does better' },
            { label: 'Close', seconds: '50-60s', onScreen: 'Guarantee or invitation, spoken plainly' },
        ],
        whyItWorks: 'Founder credibility is not transferable, so it cannot be copied by a competitor.',
        niches: ['DTC', 'SaaS', 'Small business'],
        prompt:
            'Build a 55-second founder story for [company]. Open with who I am and the problem I personally had, cover what I tried that failed, explain what I built and the one thing it does better, and close with a plainly spoken guarantee or invitation.',
        featured: false,
        source: 'https://www.gethookd.ai/learn/founder-story-ads-examples-how-to-create-them/',
    },
    {
        id: 'day-in-the-life',
        name: 'Day in the life',
        description: 'A process vlog where each segment introduces a new task, place or decision.',
        category: 'brand',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [45, 90],
        templateKey: 'general_video',
        beats: [
            { label: 'Cold open', seconds: '0-5s', onScreen: 'An intriguing moment from later in the day' },
            { label: 'Montage', seconds: '5-60s', onScreen: 'Chronological segments, varied angles' },
            { label: 'Wind-down', seconds: '60-80s', onScreen: 'The quiet close, reflection line' },
        ],
        whyItWorks: 'Scene density, not brevity, is the retention rule here — audiences expect depth in this format.',
        niches: ['Founders', 'Local business', 'Makers', 'Personal brand'],
        prompt:
            'Build a 75-second day-in-the-life video for [role or business]. Cold open on the most interesting moment from later in the day, then run chronologically with a new task, location or decision in every segment and varied angles, and wind down on a quiet reflective close.',
        featured: false,
        source: 'https://lightreel.ai/blogs/day-in-the-life-ugc-videos',
    },
    {
        id: 'green-screen',
        name: 'Green screen commentary',
        description: 'You, pinned in front of the screenshot or chart you are reacting to.',
        category: 'brand',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [30, 60],
        templateKey: 'general_video',
        beats: [
            { label: 'Hook', seconds: '0-3s', onScreen: 'The screenshot itself, with a reaction line' },
            { label: 'Evidence', seconds: '3-40s', onScreen: 'Cuts between several documents or charts' },
            { label: 'Conclusion', seconds: '40-55s', onScreen: 'The take, stated plainly' },
        ],
        whyItWorks: 'Face and evidence share the frame, so the argument and the person land at the same time.',
        niches: ['Finance', 'Commentary', 'Analysis', 'B2B'],
        prompt:
            'Build a 45-second green-screen commentary about [topic]. Put me in front of the screenshot or chart from the first frame, cut between two or three pieces of evidence as I walk through them, and end on a plainly stated take.',
        featured: false,
        source: 'https://socialbaddie.com/lab-notes/smm/tiktok-video-formats/',
    },
    {
        id: 'grwm-product',
        name: 'GRWM with product',
        description: 'A routine narrated end to end, with the product woven in rather than pitched.',
        category: 'brand',
        platforms: ['tiktok', 'reels'],
        durationSeconds: [15, 60],
        templateKey: 'ugc_ad',
        beats: [
            { label: 'Hook', seconds: '0-3s', onScreen: 'Where I am going, said fast' },
            { label: 'Routine', seconds: '3-40s', onScreen: 'Steps in order, product used naturally' },
            { label: 'Reveal', seconds: '40-55s', onScreen: 'The finished look, full frame' },
        ],
        whyItWorks: 'Parasocial trust plus ritual comfort; the product arrives as part of a routine, not an ad break.',
        niches: ['Beauty', 'Fashion', 'Lifestyle'],
        prompt:
            'Build a 45-second get-ready-with-me for [occasion] featuring [product]. Open with where I am going, run the routine in order with the product used naturally at the point it would actually be used, and finish on the completed look in full frame.',
        featured: false,
        source: 'https://www.stackmatix.com/blog/tiktok-creative-center-trending-formats',
    },
];

/** Cards shown before the viewer picks a category. */
export function featuredTrendFormats(): TrendFormat[] {
    return TREND_FORMATS.filter((format) => format.featured);
}

export function trendFormatsByCategory(category: TrendCategory | 'all'): TrendFormat[] {
    if (category === 'all') {
        return featuredTrendFormats();
    }

    return TREND_FORMATS.filter((format) => format.category === category);
}

/** Categories that actually have formats, in the order the labels declare. */
export function trendCategories(): TrendCategory[] {
    const order = Object.keys(TREND_CATEGORY_LABELS) as TrendCategory[];

    return order.filter((category) => TREND_FORMATS.some((format) => format.category === category));
}

export function formatDurationLabel(format: TrendFormat): string {
    const [min, max] = format.durationSeconds;

    return min === max ? `${min}s` : `${min}-${max}s`;
}
