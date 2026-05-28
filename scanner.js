/**
 * RepoSec Automated Scanner Engine (Pure Client-Side)
 * Runs security audits directly in the browser via the GitHub REST API.
 */

// Helper to decode Base64 content from GitHub API, supporting UTF-8
function decodeBase64(str) {
    try {
        const cleanStr = str.replace(/\s/g, '');
        return new TextDecoder().decode(
            Uint8Array.from(atob(cleanStr), (c) => c.charCodeAt(0))
        );
    } catch (e) {
        console.error("Failed to decode base64 content", e);
        return "";
    }
}

// Helper to check if a string matches common secret patterns
function scanForSecrets(content, filePath) {
    const secretPattern = /\b(api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key)\b\s*[:=]\s*["']([^"']{8,})["']/gi;
    const hits = [];
    let match;
    
    // Reset regex state
    secretPattern.lastIndex = 0;
    
    while ((match = secretPattern.exec(content)) !== null) {
        const value = match[2] || "";
        // Skip common placeholder values
        if (/^(changeme|example|sample|placeholder|your-|test_|mock|dummy)/i.test(value)) {
            continue;
        }
        
        // Find line number
        const lineNum = content.slice(0, match.index).split(/\r?\n/).length;
        hits.push({
            file: filePath,
            line: lineNum,
            type: match[1]
        });
    }
    return hits;
}

// Parses GitHub repository URL or shorthand (owner/repo)
export function parseGitHubUrl(url) {
    const cleanUrl = url.trim().replace(/\.git$/, '');
    
    // Handle SSH format (git@github.com:owner/repo)
    if (cleanUrl.startsWith('git@github.com:')) {
        const parts = cleanUrl.slice('git@github.com:'.length).split('/');
        if (parts.length === 2) {
            return { owner: parts[0], repo: parts[1] };
        }
    }
    
    // Handle HTTPS format (https://github.com/owner/repo)
    try {
        const parsed = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://github.com/${cleanUrl}`);
        if (parsed.hostname === 'github.com') {
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            if (pathParts.length >= 2) {
                return { owner: pathParts[0], repo: pathParts[1] };
            }
        }
    } catch (e) {
        // Fallback to simple slash splitting
    }
    
    const simpleParts = cleanUrl.split('/').filter(Boolean);
    if (simpleParts.length === 2) {
        return { owner: simpleParts[0], repo: simpleParts[1] };
    }
    
    return null;
}

/**
 * Main scan runner
 * @param {string} repoUrl GitHub Repo URL or owner/repo shorthand
 * @param {string} token Optional Personal Access Token
 * @param {Function} onProgress Callback for logging progress messages
 */
export async function runRepoScan(repoUrl, token = "", onProgress = () => {}) {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        throw new Error("Invalid GitHub repository path or URL. Use 'owner/repo' or 'https://github.com/owner/repo'.");
    }
    
    const { owner, repo } = parsed;
    const headers = {
        "Accept": "application/vnd.github.v3+json"
    };
    if (token.trim()) {
        headers["Authorization"] = `token ${token.trim()}`;
    }
    
    // API client wrapper
    async function apiFetch(endpoint) {
        const res = await fetch(`https://api.github.com${endpoint}`, { headers });
        if (res.status === 401) {
            throw new Error("Unauthorized: The GitHub Personal Access Token is invalid.");
        }
        if (res.status === 403) {
            const limit = res.headers.get("X-RateLimit-Limit");
            const resetTime = new Date(Number(res.headers.get("X-RateLimit-Reset")) * 1000).toLocaleTimeString();
            throw new Error(`Rate limit exceeded. GitHub restricts unauthenticated IPs to ${limit || 60} requests/hr. Please wait or configure a Personal Access Token (PAT) under settings. Reset at ${resetTime}.`);
        }
        if (res.status === 404) {
            throw new Error(`Repository '${owner}/${repo}' not found or is private. If it is private, please configure a Personal Access Token in the settings.`);
        }
        if (!res.ok) {
            throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
        }
        return res.json();
    }

    onProgress("Connecting to GitHub API...");
    const repoInfo = await apiFetch(`/repos/${owner}/${repo}`);
    const defaultBranch = repoInfo.default_branch || "main";
    onProgress(`Repository loaded: ${owner}/${repo} (Default Branch: ${defaultBranch})`);
    
    onProgress("Fetching full repository file structure...");
    const treeData = await apiFetch(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
    
    if (!treeData.tree || !Array.isArray(treeData.tree)) {
        throw new Error("Failed to retrieve repository file structure.");
    }
    
    const files = treeData.tree.map((entry) => entry.path);
    onProgress(`Checked file list: ${files.length} files found.`);
    
    // Categorize files
    const packageFiles = files.filter((file) => file.endsWith("package.json"));
    const lockfiles = files.filter((file) =>
        /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(file)
    );
    const workflowFiles = files.filter((file) => file.startsWith(".github/workflows/") && (file.endsWith(".yml") || file.endsWith(".yaml")));
    const envFiles = files.filter((file) => /(^|\/)\.env($|\.|\/)/.test(file));
    const exampleEnvFiles = envFiles.filter((file) => /\.(example|sample|template)$/.test(file));
    const nonExampleEnvFiles = envFiles.filter((file) => !exampleEnvFiles.includes(file));
    const securityFile = files.find((file) => /^(SECURITY\.md|\.github\/SECURITY\.md)$/i.test(file));
    const dependabotFile = files.find((file) => /^\.github\/dependabot\.(yml|yaml)$/i.test(file));
    const hasGitignore = files.includes(".gitignore");
    
    const findings = [];
    const evidenceList = [`Checked repository: **${owner}/${repo}**`, `Scanned file index containing **${files.length}** entries.`];
    
    if (packageFiles.length) evidenceList.push(`Found Node.js package manifests: ${packageFiles.map(f => `\`${f}\``).join(", ")}`);
    if (lockfiles.length) evidenceList.push(`Found lockfiles: ${lockfiles.map(f => `\`${f}\``).join(", ")}`);
    if (workflowFiles.length) evidenceList.push(`Found GitHub Actions workflows: ${workflowFiles.map(f => `\`${f}\``).join(", ")}`);
    if (securityFile) evidenceList.push(`Found Security Policy: \`${securityFile}\``);
    if (dependabotFile) evidenceList.push(`Found Dependabot settings: \`${dependabotFile}\``);
    
    // Check 1: SECURITY.md
    if (!securityFile) {
        findings.push({
            id: "missing-security-md",
            title: "No visible SECURITY.md",
            risk: "Low",
            category: "Security Policy",
            evidence: ["No security policy found in root or `.github/` folder."],
            why: "A security policy acts as a safe-harbor contract for security researchers, letting them report vulnerabilities privately instead of opening public issues.",
            fix: "Add a `SECURITY.md` file listing a secure contact email, PGPs (if any), expected response times, and disclosure policy."
        });
    }
    
    // Check 2: Dependabot
    if (!dependabotFile) {
        findings.push({
            id: "missing-dependabot",
            title: "No visible Dependabot configuration",
            risk: packageFiles.length ? "Medium" : "Low",
            category: "Dependency Updates",
            evidence: ["No Dependabot configuration file found."],
            why: "Without automated updates, dependency versions and action runners drift out-of-date, leaving the codebase vulnerable to known security issues.",
            fix: "Create a `.github/dependabot.yml` configuration monitoring your packages (npm, yarn, etc.) and GitHub actions."
        });
    }
    
    // Check 3: Lockfile matching
    if (packageFiles.length > 0 && lockfiles.length === 0) {
        findings.push({
            id: "missing-lockfile",
            title: "Package manifest present without a lockfile",
            risk: "Medium",
            category: "Dependency Management",
            evidence: [`Found manifest files but no npm/yarn/pnpm/bun lockfile.`],
            why: "Lockfiles pin transitive dependency versions. Without them, fresh installations (e.g., in CI or by developers) can install different versions, leading to build drifts and supply chain vectors.",
            fix: "Install dependencies locally using your preferred package manager to generate a lockfile, and commit it (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, or `bun.lockb`)."
        });
    }
    
    // Check 4: Committed Env Files
    if (nonExampleEnvFiles.length > 0) {
        findings.push({
            id: "committed-env-files",
            title: "Non-example environment files committed to Git",
            risk: "High",
            category: "Secret Hygiene",
            evidence: nonExampleEnvFiles.map((file) => `\`${file}\` is committed in Git history.`),
            why: "Committed env files can expose database credentials, third-party API tokens, and local development configurations to anyone with repo read access.",
            fix: "Remove env files from Git tracking with `git rm --cached <file>`, rotate all secrets exposed inside them, and add the env files to `.gitignore`."
        });
    }
    
    // Helper to download content
    async function fetchFileContent(filePath) {
        try {
            const data = await apiFetch(`/repos/${owner}/${repo}/contents/${filePath}`);
            if (data.content && data.encoding === "base64") {
                return decodeBase64(data.content);
            }
            return "";
        } catch (e) {
            console.error(`Failed to fetch file content: ${filePath}`, e);
            return "";
        }
    }
    
    // Fetch and analyze package.json files
    if (packageFiles.length > 0) {
        onProgress("Checking dependencies and scripts in package.json...");
        for (const pkgPath of packageFiles) {
            const content = await fetchFileContent(pkgPath);
            if (!content) continue;
            
            try {
                const parsedPkg = JSON.parse(content);
                const dependencyGroups = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
                const looseDeps = [];
                
                for (const group of dependencyGroups) {
                    if (!parsedPkg[group]) continue;
                    for (const [name, version] of Object.entries(parsedPkg[group])) {
                        if (typeof version === "string" && /^(latest|\*|x)$/i.test(version.trim())) {
                            looseDeps.push(`\`${group}.${name}: ${version}\``);
                        }
                    }
                }
                
                // Loose deps check
                if (looseDeps.length > 0) {
                    findings.push({
                        id: `loose-dependencies-${pkgPath}`,
                        title: "Loose dependency ranges found in package.json",
                        risk: "Medium",
                        category: "Supply Chain Security",
                        evidence: [`${pkgPath} lists: ` + looseDeps.join(", ")],
                        why: "Specifying loose versions like `latest` or `*` allows package managers to resolve arbitrary major upgrades, which can introduce breaking changes or compromised code without warning.",
                        fix: "Replace loose dependency versions in package.json with stable semantic ranges (e.g. `^1.2.3` or `~1.2.3`), and regenerate the lockfile."
                    });
                }
                
                // Remote downloads in scripts check
                const scripts = parsedPkg.scripts || {};
                const scriptDownloads = [];
                for (const [scriptName, cmd] of Object.entries(scripts)) {
                    if (typeof cmd === "string" && /curl\s+[^|]+\||wget\s+[^|]+\||Invoke-WebRequest/i.test(cmd)) {
                        scriptDownloads.push(`\`scripts.${scriptName}: ${cmd}\``);
                    }
                }
                
                if (scriptDownloads.length > 0) {
                    findings.push({
                        id: `remote-downloads-${pkgPath}`,
                        title: "NPM script executes unverified remote content",
                        risk: "Medium",
                        category: "Supply Chain Risk",
                        evidence: scriptDownloads,
                        why: "Downloading and running scripts directly from remote servers during package install/build cycles creates a supply chain back-door if the hosting domain or pipeline gets compromised.",
                        fix: "Avoid curl/wget in build scripts. Download binaries during deployment steps, check hashes, or commit a verified local version of the script."
                    });
                }
                
            } catch (e) {
                findings.push({
                    id: `malformed-json-${pkgPath}`,
                    title: `Malformed package manifest: ${pkgPath}`,
                    risk: "Low",
                    category: "Repository Integrity",
                    evidence: [`Failed to parse JSON file content.`],
                    why: "A malformed package.json file blocks install tasks, checks, and automated dependency tools.",
                    fix: "Fix the syntax errors in your package.json, and validate it using JSON lint checkers."
                });
            }
        }
    }
    
    // Check 7: Gitignore cover check
    if (hasGitignore) {
        onProgress("Checking .gitignore rules...");
        const gitignoreContent = await fetchFileContent(".gitignore");
        if (gitignoreContent) {
            const hasEnvIgnore = /(^|\n)\.env(\.|\*|$)|(^|\n)\.env\.local($|\n)/.test(gitignoreContent);
            if (!hasEnvIgnore) {
                findings.push({
                    id: "gitignore-missing-env",
                    title: ".gitignore does not exclude environment files",
                    risk: "Low",
                    category: "Secret Prevention",
                    evidence: [".gitignore exists, but lacks specific patterns matching `.env` or `.env.local`."],
                    why: "Without environment files listed in your `.gitignore`, developers run a high risk of accidentally committing their local settings and secret tokens to the remote repository.",
                    fix: "Add `.env`, `.env.local`, and custom secret extensions to your `.gitignore` file."
                });
            }
        }
    } else {
        findings.push({
            id: "missing-gitignore",
            title: "No visible .gitignore file",
            risk: "Low",
            category: "Secret Prevention",
            evidence: ["No `.gitignore` file found in the root directory."],
            why: "A missing `.gitignore` file makes it extremely easy to commit editor cache files, logs, local node modules, and active API tokens.",
            fix: "Create a `.gitignore` file in your repository root, adding standard rules for your framework (such as Node.js, Next.js, Python, etc.)."
        });
    }
    
    // Fetch and analyze GitHub Action Workflow files
    if (workflowFiles.length > 0) {
        onProgress("Checking GitHub Actions security posture...");
        for (const wfPath of workflowFiles) {
            const content = await fetchFileContent(wfPath);
            if (!content) continue;
            
            const lines = content.split(/\r?\n/);
            const unpinnedActions = [];
            
            lines.forEach((line, index) => {
                const trimmed = line.trim();
                if (trimmed.startsWith("uses:") || trimmed.includes(" uses:")) {
                    const match = trimmed.match(/uses:\s*["']?([^"'\s]+)["']?/);
                    if (match) {
                        const actionVal = match[1];
                        const ref = actionVal.includes("@") ? actionVal.split("@").pop() || "" : "";
                        const isDocker = actionVal.startsWith("docker://");
                        const isLocal = actionVal.startsWith("./") || actionVal.startsWith("../");
                        const isSha = /^[a-f0-9]{40}$/i.test(ref);
                        
                        if (!isDocker && !isLocal && (!ref || !isSha)) {
                            unpinnedActions.push(`Line ${index + 1}: \`${actionVal}\``);
                        }
                    }
                }
            });
            
            // Unpinned actions check
            if (unpinnedActions.length > 0) {
                findings.push({
                    id: `unpinned-actions-${wfPath}`,
                    title: "GitHub Actions not pinned to immutable commit SHAs",
                    risk: "Medium",
                    category: "CI/CD Hardening",
                    evidence: unpinnedActions,
                    why: "Referencing third-party actions by tag (like `@v4`) exposes your CI pipelines to risk if the action tag is moved by the author or the maintainer's account is compromised.",
                    fix: "Pin third-party workflows and actions to their 40-character commit SHAs, adding a comment detailing the original version (e.g. `uses: actions/checkout@8ade135a41bc03ea155e62e844d188df1fd71740 # v4.1.0`)."
                });
            }
            
            // Permissions block check
            const hasPermissionsBlock = /(^|\n)permissions:\s*(\n|$)/.test(content) || /(^|\n)\s+permissions:\s*(\n|$)/.test(content);
            if (!hasPermissionsBlock) {
                findings.push({
                    id: `missing-permissions-${wfPath}`,
                    title: "Workflow lacks explicit least-privilege permissions block",
                    risk: "Low",
                    category: "CI/CD Hardening",
                    evidence: [`${wfPath} has no top-level or job-level 'permissions:' block.`],
                    why: "By default, GitHub Action tokens can have broad write access inside repositories. Declaring permissions limits the runner's access to what it strictly requires (e.g., read-only access to code).",
                    fix: "Add an explicit least-privilege `permissions:` block at either the root of the workflow or inside specific jobs (e.g. `permissions: contents: read`)."
                });
            }
            
            // Run regex secrets scan on workflow contents
            const secretHits = scanForSecrets(content, wfPath);
            if (secretHits.length > 0) {
                findings.push({
                    id: `hardcoded-secrets-${wfPath}`,
                    title: "Possible hardcoded credentials in workflow files",
                    risk: "High",
                    category: "Secret Hygiene",
                    evidence: secretHits.map(hit => `Line ${hit.line}: Possible hardcoded ${hit.type}`),
                    why: "Hardcoding API keys, passwords, or deployment secrets inside your workflows makes them visible in plaintext inside Git, logging history, and to anyone reading the repository.",
                    fix: "Remove all raw credential values. Inject credentials dynamically at runtime using GitHub Repository Secrets (e.g. `${{ secrets.API_KEY }}`)."
                });
            }
        }
    }
    
    // Compute Score
    // Starts at 100, deduct based on weighted categories
    let score = 100;
    findings.forEach((finding) => {
        let deduction = 0;
        if (finding.risk === "High") deduction = 25;
        else if (finding.risk === "Medium") deduction = 12;
        else if (finding.risk === "Low") deduction = 5;
        score -= deduction;
    });
    
    // Clamp score between 0 and 100
    score = Math.max(0, Math.min(100, Math.round(score)));
    
    // Sort findings: High first, then Medium, then Low
    const riskRanks = { High: 3, Medium: 2, Low: 1 };
    findings.sort((a, b) => (riskRanks[b.risk] || 0) - (riskRanks[a.risk] || 0));
    
    onProgress("Compiling priority checklist...");
    // Build a priority fix list of unique categories
    const priorityFixes = [];
    const categoriesAdded = new Set();
    
    findings.forEach((finding) => {
        if (!categoriesAdded.has(finding.category)) {
            categoriesAdded.add(finding.category);
            priorityFixes.push(finding.fix);
        }
    });
    
    // Default fixes if clean
    if (priorityFixes.length === 0) {
        priorityFixes.push("Ensure SECURITY.md exists with clear report contacts.");
        priorityFixes.push("Verify that Dependabot is checking lockfiles weekly.");
        priorityFixes.push("Keep `.env` and `.env.local` files out of your Git trees.");
    }
    
    onProgress("Scanning complete.");
    return {
        repo: `${owner}/${repo}`,
        score,
        scannedAt: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
        evidence: evidenceList,
        findings,
        priorityFixes
    };
}
