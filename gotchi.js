/**
 * RepoGotchi - Client-Side Game Engine
 * Handles GitHub activity parsing, gotchi state math, and dynamic SVG graphics rendering.
 */

// Mapping of GitHub language names to Gotchi Element Types
const LANGUAGE_TYPES = {
    // Web Type (JS, TS, HTML, CSS, Svelte, Vue, etc.)
    "javascript": "web",
    "typescript": "web",
    "html": "web",
    "css": "web",
    "vue": "web",
    "svelte": "web",
    "coffeescript": "web",
    
    // System Type (Rust, Go, C++, C, Go, Java, Swift)
    "rust": "system",
    "go": "system",
    "cpp": "system",
    "c": "system",
    "c++": "system",
    "c#": "system",
    "java": "system",
    "kotlin": "system",
    "swift": "system",
    "zig": "system",
    
    // Data Type (Python, SQL, R, Julia)
    "python": "data",
    "sql": "data",
    "r": "data",
    "julia": "data",
    "plsql": "data",
    
    // Cloud Type (YAML, shell, Dockerfile, Ruby)
    "shell": "cloud",
    "dockerfile": "cloud",
    "ruby": "cloud",
    "powershell": "cloud",
    "perl": "cloud"
};

// Helper: Format date to local date string (YYYY-MM-DD)
function formatDateString(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Fetch GitHub events and repo language stats
 */
export async function fetchGotchiData(username, token = "") {
    const headers = {
        "Accept": "application/vnd.github.v3+json"
    };
    if (token.trim()) {
        headers["Authorization"] = `token ${token.trim()}`;
    }

    async function apiFetch(url) {
        const res = await fetch(url, { headers });
        if (res.status === 401) {
            throw new Error("Unauthorized: GitHub Personal Access Token is invalid.");
        }
        if (res.status === 403) {
            throw new Error("Rate limit exceeded. Please configure a GitHub Token in settings to continue.");
        }
        if (res.status === 404) {
            throw new Error(`GitHub user '${username}' not found.`);
        }
        if (!res.ok) {
            throw new Error(`GitHub API error: ${res.status}`);
        }
        return res.json();
    }

    // Fetch user public events (to calculate commits and streaks)
    const events = await apiFetch(`https://api.github.com/users/${username}/events?per_page=60`);
    
    // Fetch recently updated repositories (to calculate language/gotchi type)
    const repos = await apiFetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=5`);

    return { events, repos };
}

/**
 * Compute Gotchi State based on GitHub data
 */
export function computeGotchiState(data, username) {
    const { events, repos } = data;
    
    // 1. Calculate languages weight
    const langCounts = { web: 0, system: 0, data: 0, cloud: 0, neutral: 0 };
    
    repos.forEach((repo) => {
        const lang = (repo.language || "").toLowerCase();
        if (lang) {
            const type = LANGUAGE_TYPES[lang] || "neutral";
            langCounts[type] += 1;
        }
    });
    
    // Determine Gotchi Type
    let gotchiType = "neutral";
    let maxCount = 0;
    for (const [type, count] of Object.entries(langCounts)) {
        if (count > maxCount) {
            maxCount = count;
            gotchiType = type;
        }
    }
    if (maxCount === 0) {
        gotchiType = "neutral";
    }

    // 2. Scan commits and streaks in the last 7 days
    const today = new Date();
    const past7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(today.getDate() - i);
        return formatDateString(d);
    });

    const activeDays = new Set();
    let totalCommits = 0;
    let totalPRs = 0;
    let totalReviews = 0;
    let lastCommitDate = null;

    events.forEach((evt) => {
        const eventDateStr = formatDateString(new Date(evt.created_at));
        const isIn7Days = past7Days.includes(eventDateStr);

        if (evt.type === "PushEvent") {
            const commitCount = evt.payload.size || 0;
            if (isIn7Days) {
                totalCommits += commitCount;
                activeDays.add(eventDateStr);
            }
            if (!lastCommitDate) {
                lastCommitDate = evt.created_at;
            }
        } else if (evt.type === "PullRequestEvent" && isIn7Days) {
            totalPRs += 1;
            activeDays.add(eventDateStr);
        } else if (evt.type === "PullRequestReviewEvent" && isIn7Days) {
            totalReviews += 1;
            activeDays.add(eventDateStr);
        }
    });

    // Calculate Streak
    let currentStreak = 0;
    for (let i = 0; i < 7; i++) {
        const checkDate = formatDateString(new Date(today.getDate() - i));
        // If today is active or check date is active, increment streak
        if (activeDays.has(formatDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)))) {
            currentStreak++;
        } else {
            // Break streak only if not checking today (allow streak continuity on current day)
            if (i > 0) break;
        }
    }

    // Calculate XP
    const totalXP = (totalCommits * 10) + (totalPRs * 15) + (totalReviews * 5);
    
    // Level Math: lvl = Math.floor(Math.sqrt(totalXP / 10)) + 1
    const level = Math.floor(Math.sqrt(totalXP / 10)) + 1;
    const nextLevelXP = Math.pow(level, 2) * 10;
    const prevLevelXP = Math.pow(level - 1, 2) * 10;
    const xpProgress = totalXP - prevLevelXP;
    const xpNeeded = nextLevelXP - prevLevelXP;
    const progressPercent = Math.min(100, Math.round((xpProgress / xpNeeded) * 100)) || 0;

    // Calculate Health
    // Base 100, deduct 15 points for every inactive day in the last 7 days
    const inactiveDaysCount = 7 - activeDays.size;
    let health = 100 - (inactiveDaysCount * 15);
    health = Math.max(0, health);

    // Determine status
    let status = "active";
    if (health === 0) {
        status = "deceased";
    } else if (health < 30) {
        status = "sick";
    } else if (!lastCommitDate || (new Date() - new Date(lastCommitDate) > 24 * 60 * 60 * 1000)) {
        status = "repose"; // Sleeping if no commits in 24h
    }

    // Friendly names for types
    const typeNames = {
        web: "Web Sprite (HTML/JS)",
        system: "System Golem (Rust/C++)",
        data: "Data Serpent (Python/SQL)",
        cloud: "Cloud Phoenix (YAML/Ops)",
        neutral: "Neutral Slime"
    };

    return {
        username,
        type: gotchiType,
        typeName: typeNames[gotchiType],
        level,
        xp: totalXP,
        progressPercent,
        health,
        status,
        streak: activeDays.size,
        commits: totalCommits,
        lastCommit: lastCommitDate ? new Date(lastCommitDate).toLocaleDateString() : "Never"
    };
}

/**
 * Generate animated SVG code for RepoGotchi
 */
export function generateGotchiSVG(name, type, status, level, accessories = [], skin = "default") {
    // Skins configuration (Color Palettes)
    const palettes = {
        default: {
            web: { primary: "#059669", secondary: "#34d399", border: "#047857" },      // Green
            system: { primary: "#4b5563", secondary: "#9ca3af", border: "#1f2937" },   // Slate
            data: { primary: "#2563eb", secondary: "#60a5fa", border: "#1d4ed8" },     // Blue
            cloud: { primary: "#ea580c", secondary: "#fb923c", border: "#c2410c" },    // Orange
            neutral: { primary: "#6b7280", secondary: "#d1d5db", border: "#374151" }  // Gray
        },
        cyber: {
            web: { primary: "#d946ef", secondary: "#f472b6", border: "#86198f" },
            system: { primary: "#06b6d4", secondary: "#67e8f9", border: "#0891b2" },
            data: { primary: "#8b5cf6", secondary: "#c084fc", border: "#6d28d9" },
            cloud: { primary: "#f43f5e", secondary: "#fb7185", border: "#be123c" },
            neutral: { primary: "#ec4899", secondary: "#f472b6", border: "#be185d" }
        },
        golden: {
            web: { primary: "#d97706", secondary: "#fbbf24", border: "#78350f" },
            system: { primary: "#d97706", secondary: "#fbbf24", border: "#78350f" },
            data: { primary: "#d97706", secondary: "#fbbf24", border: "#78350f" },
            cloud: { primary: "#d97706", secondary: "#fbbf24", border: "#78350f" },
            neutral: { primary: "#d97706", secondary: "#fbbf24", border: "#78350f" }
        },
        void: {
            web: { primary: "#1e1b4b", secondary: "#312e81", border: "#030712" },
            system: { primary: "#1e1b4b", secondary: "#312e81", border: "#030712" },
            data: { primary: "#1e1b4b", secondary: "#312e81", border: "#030712" },
            cloud: { primary: "#1e1b4b", secondary: "#312e81", border: "#030712" },
            neutral: { primary: "#1e1b4b", secondary: "#312e81", border: "#030712" }
        }
    };

    const colors = (palettes[skin] || palettes.default)[type] || palettes.default.neutral;

    // Body Shapes by Element Type
    let gotchiBody = "";
    if (status === "deceased") {
        // Render a floating ghost body (wavy base)
        gotchiBody = `
            <!-- Ghost Body -->
            <path class="gotchi-body-ghost" d="M 35 60 C 35 40, 65 40, 65 60 C 65 68, 62 70, 60 67 C 58 65, 56 68, 54 67 C 52 65, 50 68, 48 67 C 46 65, 44 68, 42 67 C 40 65, 38 68, 35 60 Z" fill="#e5e7eb" fill-opacity="0.8" stroke="#9ca3af" stroke-width="2.5" />
        `;
    } else {
        switch (type) {
            case "web": // Agile Sprite (curved blob with ears)
                gotchiBody = `
                    <path class="gotchi-body" d="M 32 68 C 24 55, 30 32, 50 32 C 70 32, 76 55, 68 68 C 64 74, 36 74, 32 68 Z" fill="${colors.primary}" stroke="${colors.border}" stroke-width="3" />
                    <!-- Antenna ears -->
                    <path d="M 38 35 Q 32 25, 28 30" fill="none" stroke="${colors.border}" stroke-width="3" stroke-linecap="round" />
                    <path d="M 62 35 Q 68 25, 72 30" fill="none" stroke="${colors.border}" stroke-width="3" stroke-linecap="round" />
                `;
                break;
            case "system": // Sturdy Golem (robotic square box)
                gotchiBody = `
                    <rect class="gotchi-body" x="30" y="32" width="40" height="38" rx="6" fill="${colors.primary}" stroke="${colors.border}" stroke-width="3.5" />
                    <!-- Rivets/Gears -->
                    <circle cx="35" cy="37" r="2" fill="${colors.secondary}" />
                    <circle cx="65" cy="37" r="2" fill="${colors.secondary}" />
                `;
                break;
            case "data": // Clever Serpent (snake tail/coils)
                gotchiBody = `
                    <path class="gotchi-body" d="M 32 68 C 30 50, 42 34, 50 34 C 58 34, 70 50, 68 68 C 60 72, 40 72, 32 68 Z" fill="${colors.primary}" stroke="${colors.border}" stroke-width="3" />
                    <!-- Serpent Tail curl -->
                    <path d="M 34 68 Q 24 74, 28 80 Q 32 82, 36 76" fill="none" stroke="${colors.border}" stroke-width="3" stroke-linecap="round" />
                `;
                break;
            case "cloud": // Majestic Phoenix (fire flames wings)
                gotchiBody = `
                    <path class="gotchi-body" d="M 50 28 C 34 36, 32 54, 36 68 C 42 74, 58 74, 64 68 C 68 54, 66 36, 50 28 Z" fill="${colors.primary}" stroke="${colors.border}" stroke-width="3" />
                    <!-- Flame Wings -->
                    <path class="gotchi-wing-left" d="M 32 52 Q 18 48, 24 60 Z" fill="${colors.secondary}" stroke="${colors.border}" stroke-width="2.5" />
                    <path class="gotchi-wing-right" d="M 68 52 Q 82 48, 76 60 Z" fill="${colors.secondary}" stroke="${colors.border}" stroke-width="2.5" />
                `;
                break;
            default: // Neutral Slime (simple rounded jelly drop)
                gotchiBody = `
                    <path class="gotchi-body" d="M 30 68 C 28 56, 36 36, 50 36 C 64 36, 72 56, 70 68 C 65 74, 35 74, 30 68 Z" fill="${colors.primary}" stroke="${colors.border}" stroke-width="3" />
                `;
        }
    }

    // Eyes and Face Expressions by status
    let gotchiFace = "";
    if (status === "deceased") {
        // Ghost dead eyes (x x)
        gotchiFace = `
            <path d="M 40 46 L 46 52 M 46 46 L 40 52" stroke="#6b7280" stroke-width="2.5" stroke-linecap="round" />
            <path d="M 54 46 L 60 52 M 60 46 L 54 52" stroke="#6b7280" stroke-width="2.5" stroke-linecap="round" />
            <path d="M 46 60 Q 50 63, 54 60" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" />
        `;
    } else if (status === "repose") {
        // Sleeping eyes closed (- -) and floating Zzz bubbles
        gotchiFace = `
            <path d="M 38 50 L 46 50" stroke="#111827" stroke-width="3" stroke-linecap="round" />
            <path d="M 54 50 L 62 50" stroke="#111827" stroke-width="3" stroke-linecap="round" />
            <path d="M 47 58 Q 50 55, 53 58" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round" />
            
            <!-- Animated Zzz elements -->
            <g class="sleep-bubbles">
                <text x="68" y="32" class="sleep-z1">z</text>
                <text x="74" y="24" class="sleep-z2">Z</text>
            </g>
        `;
    } else if (status === "sick") {
        // Worried eyes and sad mouth
        gotchiFace = `
            <circle cx="42" cy="49" r="3.5" fill="#111827" />
            <circle cx="58" cy="49" r="3.5" fill="#111827" />
            <!-- Worried eyebrows -->
            <path d="M 37 42 Q 42 45, 46 41" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" />
            <path d="M 54 41 Q 58 45, 63 42" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" />
            <!-- Sad curve mouth -->
            <path d="M 46 62 Q 50 57, 54 62" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round" />
            <!-- Green sickness spot -->
            <circle cx="34" cy="44" r="2.5" fill="#10B981" />
        `;
    } else {
        // Active/Happy open eyes and smiling mouth
        gotchiFace = `
            <circle cx="42" cy="49" r="3.5" fill="#111827" />
            <circle cx="58" cy="49" r="3.5" fill="#111827" />
            <circle cx="40" cy="47" r="1" fill="#ffffff" />
            <circle cx="56" cy="47" r="1" fill="#ffffff" />
            <!-- Cute pink cheeks -->
            <circle cx="36" cy="55" r="2" fill="#f472b6" opacity="0.6" />
            <circle cx="64" cy="55" r="2" fill="#f472b6" opacity="0.6" />
            <!-- Smiling mouth -->
            <path d="M 45 58 Q 50 63, 55 58" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round" />
        `;
    }

    // Accessories render
    let gotchiAccessories = "";
    if (accessories.includes("wizard")) {
        // Purple pointed hat
        gotchiAccessories += `
            <g class="acc-wizard">
                <polygon points="34,34 50,12 66,34" fill="#6d28d9" stroke="#4c1d95" stroke-width="2.5" />
                <polygon points="30,34 70,34 66,38 34,38" fill="#5b21b6" stroke="#4c1d95" stroke-width="2.5" />
                <polygon points="50,18 52,21 49,23 48,20 45,19 48,18 49,15 51,17" fill="#f59e0b" />
            </g>
        `;
    }
    if (accessories.includes("crown")) {
        // Floating golden crown
        gotchiAccessories += `
            <g class="acc-crown">
                <polygon points="40,28 42,20 47,24 50,18 53,24 58,20 60,28" fill="#d97706" stroke="#78350f" stroke-width="2" />
                <circle cx="42" cy="18" r="1.5" fill="#ef4444" />
                <circle cx="50" cy="16" r="1.5" fill="#3b82f6" />
                <circle cx="58" cy="18" r="1.5" fill="#10b981" />
            </g>
        `;
    }
    if (accessories.includes("sunglasses")) {
        // Cool shades over eyes
        gotchiAccessories += `
            <g class="acc-glasses">
                <rect x="36" y="44" width="10" height="7" fill="#111827" rx="1" />
                <rect x="54" y="44" width="10" height="7" fill="#111827" rx="1" />
                <line x1="46" y1="47" x2="54" y2="47" stroke="#111827" stroke-width="2.5" />
                <!-- White lens glare -->
                <rect x="38" y="46" width="3" height="3" fill="#ffffff" />
                <rect x="56" y="46" width="3" height="3" fill="#ffffff" />
            </g>
        `;
    }
    if (accessories.includes("sword")) {
        // Holding small sword on right side
        gotchiAccessories += `
            <g class="acc-sword">
                <!-- Blade -->
                <rect x="71" y="40" width="4" height="20" fill="#cbd5e1" stroke="#475569" stroke-width="1.5" rx="1" />
                <!-- Hilt -->
                <rect x="67" y="58" width="12" height="3" fill="#d97706" stroke="#78350f" stroke-width="1.5" rx="0.5" />
                <rect x="72" y="61" width="2" height="5" fill="#78350f" />
            </g>
        `;
    }

    // Compile SVG String
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <!-- Background Grid pattern for profile integration -->
    <pattern id="dotGrid" width="10" height="10" patternUnits="userSpaceOnUse">
      <circle cx="5" cy="5" r="0.8" fill="#e5e7eb" />
    </pattern>
  </defs>

  <style>
    /* CSS Animations inside SVG */
    .gotchi-body, .gotchi-body-ghost {
      transform-origin: 50px 65px;
    }
    
    /* Idle breathing bounce for active/healthy gotchis */
    @keyframes breathing {
      0%, 100% { transform: translateY(0) scaleY(1); }
      50% { transform: translateY(-2px) scaleY(1.03); }
    }
    
    /* Sleep rhythmic scaling */
    @keyframes sleeping {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(0.93) translateY(2.5px); }
    }
    
    /* Ghost float translation */
    @keyframes ghost-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }

    /* Assign animations dynamically based on status */
    ${status === "deceased" ? `
    .gotchi-body-ghost, .gotchi-face, .acc-wizard, .acc-crown, .acc-glasses, .acc-sword {
      animation: ghost-float 2.5s ease-in-out infinite;
    }
    ` : status === "repose" ? `
    .gotchi-body, .gotchi-face, .acc-wizard, .acc-crown, .acc-glasses, .acc-sword {
      animation: sleeping 3s ease-in-out infinite;
    }
    ` : `
    .gotchi-body, .gotchi-face, .acc-wizard, .acc-crown, .acc-glasses, .acc-sword {
      animation: breathing 2s ease-in-out infinite;
    }
    `}

    /* Flame wing flutter */
    @keyframes wing-flap-left {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(8deg); }
    }
    @keyframes wing-flap-right {
      0%, 100% { transform: rotate(0deg); }
      50% { transform: rotate(-8deg); }
    }
    .gotchi-wing-left {
      transform-origin: 32px 52px;
      animation: wing-flap-left 1.2s ease-in-out infinite;
    }
    .gotchi-wing-right {
      transform-origin: 68px 52px;
      animation: wing-flap-right 1.2s ease-in-out infinite;
    }

    /* Floating Zzz animations */
    @keyframes z-float1 {
      0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
      30% { opacity: 0.8; }
      100% { opacity: 0; transform: translate(3px, -10px) scale(1); }
    }
    @keyframes z-float2 {
      0% { opacity: 0; transform: translate(0, 0) scale(0.6); }
      30% { opacity: 0.9; }
      100% { opacity: 0; transform: translate(5px, -12px) scale(1.1); }
    }
    .sleep-z1 {
      font-family: var(--font-mono, monospace);
      font-size: 8px;
      font-weight: 700;
      fill: #4b5563;
      animation: z-float1 3s infinite;
      animation-delay: 0s;
    }
    .sleep-z2 {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      font-weight: 700;
      fill: #374151;
      animation: z-float2 3s infinite;
      animation-delay: 1.2s;
    }

    /* Gotchi name card styling */
    .gotchi-name {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 6.5px;
      font-weight: 800;
      fill: #1f2937;
      text-anchor: middle;
    }
    .gotchi-level {
      font-family: 'JetBrains Mono', monospace;
      font-size: 5px;
      font-weight: 700;
      fill: #4b5563;
      text-anchor: middle;
    }
  </style>

  <!-- Cage Grid Background -->
  <rect width="100%" height="100%" fill="#ffffff" rx="10" stroke="#111827" stroke-width="3" />
  <rect width="100%" height="100%" fill="url(#dotGrid)" rx="10" />

  <!-- Gotchi Group Container -->
  <g>
    ${gotchiBody}
    <g class="gotchi-face">
      ${gotchiFace}
    </g>
    ${gotchiAccessories}
  </g>

  <!-- Name and Level Card Plate -->
  <g transform="translate(0, 85)">
    <text x="50" y="0" class="gotchi-name">${name.toUpperCase()}</text>
    <text x="50" y="6" class="gotchi-level">LVL ${level} | ${type.toUpperCase()}</text>
  </g>
</svg>
`;
    return svg;
}
