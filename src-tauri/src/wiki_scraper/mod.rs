//! Building lorebook entries from public wikis, without an LLM.
//!
//! Ported from the standalone Lorebook Studio, which did this in Python over
//! Flask. The scraping itself is the easy half — every wiki here speaks the
//! MediaWiki API, so a handful of typed requests replaces most of it. What was
//! worth carrying over carefully is the shape of the result: a page becomes an
//! entry whose keys are the names a conversation would actually use for it, and
//! whose content is prose rather than markup.
//!
//! Deliberately narrow compared to the original. The Python version parsed raw
//! wikitext to reconstruct infoboxes, story arcs and relation tables; that is
//! three and a half thousand lines of template handling and the part most
//! likely to break silently on a wiki that formats things slightly differently.
//! Here the wiki is asked for plain text instead, via TextExtracts where it is
//! installed and a stripped render where it is not, which covers the ordinary
//! case and fails visibly rather than subtly when it does not.

pub mod scope;

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::time::Duration;

const USER_AGENT: &str = concat!("LettuceAI/", env!("CARGO_PKG_VERSION"), " (lorebook maker)");
const TIMEOUT: Duration = Duration::from_secs(20);
/// MediaWiki caps a multi-title query at 50 for anonymous callers.
const MAX_TITLES_PER_CALL: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiSite {
    /// Absolute `api.php` endpoint every later call is made against.
    pub api: String,
    pub name: String,
    pub base: Option<String>,
    pub lang: String,
    /// Set when the URL named one article rather than a whole wiki.
    pub article: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiHit {
    pub title: String,
    pub snippet: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiPage {
    pub title: String,
    pub text: String,
    pub categories: Vec<String>,
    pub thumbnail: Option<String>,
    pub url: Option<String>,
    pub missing: bool,
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| format!("Could not start an HTTP client: {e}"))
}

async fn call(api: &str, params: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let mut query: Vec<(&str, &str)> = params.to_vec();
    query.push(("format", "json"));
    query.push(("formatversion", "2"));

    let response = client()?
        .get(api)
        .query(&query)
        .send()
        .await
        .map_err(|e| format!("Could not reach the wiki: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("The wiki answered with {}.", response.status()));
    }
    response
        .json::<serde_json::Value>()
        .await
        .map_err(|_| "The wiki returned a response we could not read.".to_string())
}

/// Turn whatever the user pasted into an API endpoint.
///
/// Accepts a bare wiki name, a Fandom article link, a `*.fandom.com` host, or
/// any Wikipedia URL, because in practice people paste the page they are
/// looking at rather than an API root.
fn endpoint_for(raw: &str) -> Result<(String, Option<String>), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Give a wiki address or a page link.".to_string());
    }

    // Already an API endpoint.
    if trimmed.contains("/api.php") {
        return Ok((trimmed.to_string(), None));
    }

    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else if trimmed.contains('.') {
        format!("https://{trimmed}")
    } else {
        // A bare word is treated as a Fandom wiki name, which is how the
        // original tool behaved and how people refer to these wikis.
        format!("https://{}.fandom.com", trimmed.to_ascii_lowercase())
    };

    let parsed = url::Url::parse(&with_scheme)
        .map_err(|_| format!("That does not look like a link: {trimmed}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| "That link has no site in it.".to_string())?
        .to_string();

    // The article, when the link pointed at one.
    let path = parsed.path();
    let article = path
        .strip_prefix("/wiki/")
        .filter(|rest| !rest.is_empty())
        .map(|rest| {
            percent_decode(rest).replace('_', " ")
        });

    // Fandom keeps its API under the language path; Wikipedia and most others
    // put it at the root.
    let api = if host.ends_with("fandom.com") {
        let lang_prefix = path
            .split('/')
            .nth(1)
            .filter(|seg| seg.len() == 2 && seg.chars().all(|c| c.is_ascii_lowercase()));
        match lang_prefix {
            Some(lang) => format!("https://{host}/{lang}/api.php"),
            None => format!("https://{host}/api.php"),
        }
    } else {
        format!("https://{host}/w/api.php")
    };

    Ok((api, article))
}

fn percent_decode(input: &str) -> String {
    urlencoding::decode(input)
        .map(|decoded| decoded.into_owned())
        .unwrap_or_else(|_| input.to_string())
}

/// Resolve a wiki address into the endpoint and site name used from here on.
#[tauri::command]
pub async fn wiki_resolve(target: String) -> Result<WikiSite, String> {
    let (api, article) = endpoint_for(&target)?;
    let data = call(&api, &[("action", "query"), ("meta", "siteinfo"), ("siprop", "general")]).await?;
    let general = data
        .pointer("/query/general")
        .ok_or_else(|| "That site does not look like a wiki we can read.".to_string())?;

    Ok(WikiSite {
        api,
        name: general
            .get("sitename")
            .and_then(|v| v.as_str())
            .unwrap_or("Wiki")
            .to_string(),
        base: general.get("base").and_then(|v| v.as_str()).map(str::to_string),
        lang: general
            .get("lang")
            .and_then(|v| v.as_str())
            .unwrap_or("en")
            .to_string(),
        article,
    })
}

/// Search a wiki for pages matching a phrase.
#[tauri::command]
pub async fn wiki_search(api: String, query: String, limit: Option<u32>) -> Result<Vec<WikiHit>, String> {
    let limit = limit.unwrap_or(24).clamp(1, 50).to_string();
    let data = call(
        &api,
        &[
            ("action", "query"),
            ("list", "search"),
            ("srsearch", query.trim()),
            ("srlimit", &limit),
            ("srnamespace", "0"),
        ],
    )
    .await?;

    let hits = data
        .pointer("/query/search")
        .and_then(|v| v.as_array())
        .map(|rows| {
            rows.iter()
                .filter_map(|row| {
                    let title = row.get("title")?.as_str()?.to_string();
                    Some(WikiHit {
                        title,
                        snippet: row
                            .get("snippet")
                            .and_then(|v| v.as_str())
                            .map(strip_html),
                        thumbnail: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(hits)
}

/// List the pages in a category, which is how a whole cast gets picked at once.
#[tauri::command]
pub async fn wiki_category(api: String, category: String, limit: Option<u32>) -> Result<Vec<WikiHit>, String> {
    let name = category.trim();
    let full = if name.to_ascii_lowercase().starts_with("category:") {
        name.to_string()
    } else {
        format!("Category:{name}")
    };
    let limit = limit.unwrap_or(200).clamp(1, 500).to_string();

    let data = call(
        &api,
        &[
            ("action", "query"),
            ("list", "categorymembers"),
            ("cmtitle", &full),
            ("cmlimit", &limit),
            ("cmnamespace", "0"),
            ("cmtype", "page"),
        ],
    )
    .await?;

    Ok(data
        .pointer("/query/categorymembers")
        .and_then(|v| v.as_array())
        .map(|rows| {
            rows.iter()
                .filter_map(|row| {
                    Some(WikiHit {
                        title: row.get("title")?.as_str()?.to_string(),
                        snippet: None,
                        thumbnail: None,
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// Fetch readable text for a batch of pages.
///
/// TextExtracts is asked for first because it returns prose already stripped of
/// markup. Fandom wikis frequently do not have it installed, and there the
/// request simply comes back without `extract` — so anything still empty is
/// retried through the renderer and stripped here.
#[tauri::command]
pub async fn wiki_fetch_pages(api: String, titles: Vec<String>) -> Result<Vec<WikiPage>, String> {
    let titles: Vec<String> = titles
        .into_iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .collect();
    if titles.is_empty() {
        return Ok(Vec::new());
    }

    let mut out: Vec<WikiPage> = Vec::with_capacity(titles.len());

    for chunk in titles.chunks(MAX_TITLES_PER_CALL) {
        let joined = chunk.join("|");
        let data = call(
            &api,
            &[
                ("action", "query"),
                ("prop", "extracts|categories|pageimages|info"),
                ("explaintext", "1"),
                ("exsectionformat", "plain"),
                ("exlimit", "max"),
                ("cllimit", "max"),
                ("clshow", "!hidden"),
                ("piprop", "thumbnail"),
                ("pithumbsize", "400"),
                ("inprop", "url"),
                ("redirects", "1"),
                ("titles", &joined),
            ],
        )
        .await?;

        let pages = data
            .pointer("/query/pages")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        for page in pages {
            let title = page
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            if page.get("missing").and_then(|v| v.as_bool()).unwrap_or(false) {
                out.push(WikiPage {
                    title,
                    text: String::new(),
                    categories: Vec::new(),
                    thumbnail: None,
                    url: None,
                    missing: true,
                });
                continue;
            }

            let categories = page
                .get("categories")
                .and_then(|v| v.as_array())
                .map(|rows| {
                    rows.iter()
                        .filter_map(|c| c.get("title")?.as_str())
                        .map(|t| t.trim_start_matches("Category:").to_string())
                        .collect()
                })
                .unwrap_or_default();

            out.push(WikiPage {
                text: page
                    .get("extract")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                categories,
                thumbnail: page
                    .pointer("/thumbnail/source")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                url: page.get("fullurl").and_then(|v| v.as_str()).map(str::to_string),
                missing: false,
                title,
            });
        }
    }

    // Wikis without TextExtracts leave `extract` empty. Fall back to the
    // rendered page and strip it, one request each — slower, but only for the
    // pages that actually need it.
    for page in out.iter_mut() {
        if page.missing || !page.text.trim().is_empty() {
            continue;
        }
        if let Ok(html) = call(
            &api,
            &[
                ("action", "parse"),
                ("page", page.title.as_str()),
                ("prop", "text"),
                ("redirects", "1"),
            ],
        )
        .await
        {
            if let Some(body) = html.pointer("/parse/text").and_then(|v| v.as_str()) {
                page.text = strip_html(body);
            }
        }
    }

    Ok(out)
}

/// Reduce rendered wiki HTML to readable prose.
///
/// Not a general HTML parser and does not need to be: the goal is prose a model
/// can read, so structural markup is dropped, tags are removed and the entities
/// MediaWiki actually emits are decoded. Anything exotic degrades to slightly
/// untidy text rather than to markup leaking into a lorebook entry.
fn strip_html(input: &str) -> String {
    let mut text = String::with_capacity(input.len());
    let mut depth_skip = 0usize;
    // Walked by character, not by byte. Indexing bytes and casting each to
    // `char` silently mangles every multi-byte sequence, which on these wikis
    // means every Japanese name and every accent — the exact content this is
    // most often pointed at.
    let mut chars = input.char_indices().peekable();

    while let Some((idx, ch)) = chars.next() {
        if ch != '<' {
            if depth_skip == 0 {
                text.push(ch);
            }
            continue;
        }

        let end = match input[idx..].find('>') {
            Some(offset) => idx + offset,
            None => break,
        };
        let tag = &input[idx + 1..end];
        let name: String = tag
            .trim_start_matches('/')
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase();

        // `aside` is how Fandom renders its infoboxes; without it the whole
        // box flattens into a column of one-word fragments ("Kanji", the
        // kanji, "Rōmaji", …) that reads as noise in an entry. `rt`/`rp`
        // carry furigana, which flatten into the name interleaved with its
        // own pronunciation — common on the anime and manga wikis this is
        // most used for.
        if matches!(
            name.as_str(),
            "script" | "style" | "table" | "sup" | "figure" | "aside" | "nav" | "header"
                | "footer" | "rt" | "rp"
        ) {
            if tag.starts_with('/') {
                depth_skip = depth_skip.saturating_sub(1);
            } else if !tag.ends_with('/') {
                depth_skip += 1;
            }
        } else if depth_skip == 0
            && matches!(name.as_str(), "p" | "br" | "li" | "h1" | "h2" | "h3" | "h4" | "div")
        {
            text.push('\n');
        }

        // Skip past the tag we just consumed.
        while let Some(&(next_idx, _)) = chars.peek() {
            if next_idx > end {
                break;
            }
            chars.next();
        }
    }

    let decoded = text
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#160;", " ");

    // Collapse the blank lines all that tag removal leaves behind.
    let mut lines: Vec<String> = Vec::new();
    for line in decoded.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if matches!(lines.last().map(String::as_str), Some("")) {
                continue;
            }
            lines.push(String::new());
        } else {
            lines.push(trimmed.to_string());
        }
    }
    lines.join("\n").trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_name_is_treated_as_a_fandom_wiki() {
        let (api, article) = endpoint_for("jujutsu-kaisen").unwrap();
        assert_eq!(api, "https://jujutsu-kaisen.fandom.com/api.php");
        assert!(article.is_none());
    }

    #[test]
    fn an_article_link_keeps_the_article() {
        let (api, article) = endpoint_for("https://jujutsu-kaisen.fandom.com/wiki/Yuji_Itadori").unwrap();
        assert_eq!(api, "https://jujutsu-kaisen.fandom.com/api.php");
        assert_eq!(article.as_deref(), Some("Yuji Itadori"));
    }

    #[test]
    fn wikipedia_uses_the_w_path() {
        let (api, article) = endpoint_for("https://en.wikipedia.org/wiki/Ada_Lovelace").unwrap();
        assert_eq!(api, "https://en.wikipedia.org/w/api.php");
        assert_eq!(article.as_deref(), Some("Ada Lovelace"));
    }

    #[test]
    fn percent_escapes_in_a_title_are_decoded() {
        let (_, article) = endpoint_for("https://en.wikipedia.org/wiki/Caf%C3%A9_Wha%3F").unwrap();
        assert_eq!(article.as_deref(), Some("Café Wha?"));
    }

    #[test]
    fn furigana_readings_do_not_interleave_with_the_name() {
        let html = "<p><ruby>虎<rt>いた</rt>杖<rt>どり</rt></ruby> is the protagonist.</p>";
        let text = strip_html(html);
        assert!(text.contains("虎杖"));
        assert!(!text.contains("いた"));
    }

    #[test]
    fn fandom_infoboxes_are_dropped_rather_than_flattened() {
        let html = "<aside><h2>Kanji</h2><div>虎杖悠仁</div></aside><p>Real prose here.</p>";
        let text = strip_html(html);
        assert!(text.contains("Real prose here."));
        assert!(!text.contains("Kanji"));
        assert!(!text.contains("虎杖悠仁"));
    }

    #[test]
    fn markup_and_tables_are_stripped_from_rendered_html() {
        let html = "<p>Hello <b>there</b></p><table><tr><td>junk</td></tr></table><p>Second&nbsp;line</p>";
        let text = strip_html(html);
        assert!(text.contains("Hello there"));
        assert!(text.contains("Second line"));
        assert!(!text.contains("junk"));
    }

    #[test]
    fn an_empty_target_is_rejected_rather_than_guessed_at() {
        assert!(endpoint_for("   ").is_err());
    }
}

/* ── Wiki structure: what stories a wiki covers, and what it files ────────
 * A franchise wiki is several stories in one place. These two calls are what
 * let the picker offer them separately instead of dumping the whole franchise.
 * ---------------------------------------------------------------------- */

/// Category suffixes that mark a work's own instalments.
///
/// A work is discovered *through* these: "Jujutsu Kaisen Modulo Chapters" names
/// both the instalment kind and the story it belongs to, which on a franchise
/// wiki is the only place that association is stated outright.
const INSTALMENT_SUFFIXES: [&str; 5] =
    ["chapters", "episodes", "volumes", "issues", "light novels"];

/// Suffixes that mark a *subdivision* of a story rather than a story.
///
/// Checked against the real Jujutsu Kaisen wiki, where nine of the ten
/// instalment categories are arcs — "Culling Game Arc Chapters", "Shibuya
/// Incident Arc Chapters". Treating those as separate works would offer the
/// user ten Jujutsu Kaisens and hide the one real spin-off among them.
const SUBDIVISION_SUFFIXES: [&str; 4] = [" arc", " saga", " season", " part"];

/// Companion material that is *about* a story rather than being one.
///
/// The DC Universe wiki files "Lanterns: The Official Podcast" with its own
/// episode category, which is indistinguishable from a story by structure alone
/// — and produced a picker offering to build a lorebook out of a podcast.
const NOT_A_STORY: [&str; 7] = [
    "podcast",
    "behind the scenes",
    "making of",
    "official trailer",
    "soundtrack",
    "interview",
    "commentary",
];

/// Fewest instalments a work needs before scanning it means anything.
///
/// Scope is derived by measuring how much of a story something appears in, so
/// one instalment gives every link the same perfect score and ranks nothing.
/// The DC Universe wiki has six such one-item works; they belong in browsing,
/// not in a picker that promises a scoped scan.
const MIN_SCANNABLE_INSTALMENTS: u32 = 3;

/// Category names that hold entries worth putting in a lorebook, and the label
/// to show for each. Ordered as the picker shows them: who, then where, then what.
const SECTION_KINDS: [(&str, &str); 12] = [
    ("characters", "Characters"),
    ("protagonists", "Characters"),
    ("antagonists", "Characters"),
    ("species", "Species"),
    ("organizations", "Organizations"),
    ("organisations", "Organizations"),
    ("clans", "Clans"),
    ("locations", "Locations"),
    ("events", "Events"),
    ("terminology", "Terminology"),
    ("techniques", "Techniques"),
    ("items", "Items"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiArc {
    pub name: String,
    pub category: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiWork {
    pub name: String,
    /// "series" for the wiki's main story, "spinoff" for one with its own
    /// instalments, "other" for a film, novel or game read off `Category:Media`.
    pub kind: String,
    /// Every category holding this work's instalments. Plural because a main
    /// series usually files its chapters under arcs rather than under itself.
    pub instalment_categories: Vec<String>,
    pub instalment_kind: String,
    pub instalment_count: u32,
    pub thumbnail: Option<String>,
    /// Subdivisions, offered as a narrower scope than the whole work.
    pub arcs: Vec<WikiArc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiSection {
    pub label: String,
    pub category: String,
    pub count: u32,
}

/// Every category on the wiki, with sizes. Paged, and capped so a huge wiki
/// cannot stall the picker.
async fn all_categories(api: &str, cap: usize) -> Result<Vec<(String, u32)>, String> {
    let mut out: Vec<(String, u32)> = Vec::new();
    let mut continue_from: Option<String> = None;

    while out.len() < cap {
        let mut params: Vec<(&str, &str)> = vec![
            ("action", "query"),
            ("list", "allcategories"),
            ("aclimit", "500"),
            ("acprop", "size"),
        ];
        if let Some(from) = continue_from.as_deref() {
            params.push(("acfrom", from));
        }
        let data = call(api, &params).await?;

        let rows = data
            .pointer("/query/allcategories")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        if rows.is_empty() {
            break;
        }
        for row in rows {
            let name = row
                .get("category")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let pages = row.get("pages").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            if !name.is_empty() {
                out.push((name, pages));
            }
        }

        match data
            .pointer("/continue/accontinue")
            .and_then(|v| v.as_str())
            .map(str::to_string)
        {
            Some(next) => continue_from = Some(next),
            None => break,
        }
    }

    Ok(out)
}

/// Strip the trailing "Wiki" a Fandom site name carries, so "Jujutsu Kaisen
/// Wiki" gives the series its main story is actually called.
fn series_name_from(site: &str) -> String {
    let trimmed = site.trim();
    trimmed
        .strip_suffix(" Wiki")
        .or_else(|| trimmed.strip_suffix(" wiki"))
        .unwrap_or(trimmed)
        .trim()
        .to_string()
}

fn is_subdivision(name: &str) -> bool {
    let lower = name.to_lowercase();
    SUBDIVISION_SUFFIXES.iter().any(|s| lower.ends_with(s))
}

/// The separate stories a wiki covers.
///
/// Derived from instalment categories rather than a hand-written media page,
/// because the categories are what the wiki maintains as new chapters are
/// filed — a media list goes stale and plenty of wikis have none.
///
/// The shape of the result comes from what franchise wikis actually look like,
/// checked against Jujutsu Kaisen's. Its main series has *no* instalment
/// category of its own: all 271 chapters sit under arc categories, while the
/// 2025 spin-off keeps its own 25 under "Jujutsu Kaisen Modulo Chapters". So
/// the main series is reconstructed from its arcs, and that reconstruction is
/// exactly what keeps the spin-off's cast out of it — the arcs cannot reach
/// chapters filed somewhere else.
#[tauri::command]
pub async fn wiki_works(api: String) -> Result<Vec<WikiWork>, String> {
    let site = wiki_resolve(api.clone()).await?;
    let categories = all_categories(&api, 4000).await?;

    let mut named: HashMap<String, (String, String, u32)> = HashMap::new();
    let mut arcs: Vec<WikiArc> = Vec::new();

    for (name, count) in &categories {
        if *count == 0 {
            continue;
        }
        let lower = name.to_lowercase();
        let Some(suffix) = INSTALMENT_SUFFIXES
            .iter()
            .find(|s| lower.ends_with(*s) && lower.len() > s.len() + 1)
        else {
            continue;
        };

        let stem = name[..name.len() - suffix.len()].trim().to_string();
        if stem.is_empty() {
            continue;
        }
        let stem_lower = stem.to_lowercase();
        if NOT_A_STORY.iter().any(|marker| stem_lower.contains(marker)) {
            continue;
        }

        if is_subdivision(&stem) {
            // Arcs of one series get counted once, by their largest instalment
            // category, so chapters and episodes do not list the arc twice.
            match arcs.iter_mut().find(|a| a.name == stem) {
                Some(existing) if *count > existing.count => {
                    existing.category = name.clone();
                    existing.count = *count;
                }
                Some(_) => {}
                None => arcs.push(WikiArc {
                    name: stem,
                    category: name.clone(),
                    count: *count,
                }),
            }
            continue;
        }

        let entry = named
            .entry(stem.to_lowercase())
            .or_insert_with(|| (stem.clone(), name.clone(), 0));
        if *count > entry.2 {
            entry.1 = name.clone();
            entry.2 = *count;
        }
    }

    let mut works: Vec<WikiWork> = Vec::new();

    // The main series, rebuilt from its arcs. Without this the wiki's principal
    // story is the one thing missing from its own picker.
    if !arcs.is_empty() {
        arcs.sort_by(|a, b| b.count.cmp(&a.count));
        works.push(WikiWork {
            name: series_name_from(&site.name),
            kind: "series".to_string(),
            instalment_categories: arcs.iter().map(|a| a.category.clone()).collect(),
            instalment_kind: "Arcs".to_string(),
            instalment_count: arcs.iter().map(|a| a.count).sum(),
            thumbnail: None,
            arcs: arcs.clone(),
        });
    }

    for (_, (name, category, count)) in named {
        // Below the scanning floor a work is still real — it just cannot be
        // measured, so it is offered as something to browse rather than
        // promising a scoped scan that would return noise.
        let scannable = count >= MIN_SCANNABLE_INSTALMENTS;
        works.push(WikiWork {
            name,
            kind: if scannable { "spinoff" } else { "other" }.to_string(),
            instalment_categories: if scannable { vec![category] } else { Vec::new() },
            instalment_kind: "Chapters".to_string(),
            instalment_count: if scannable { count } else { 0 },
            thumbnail: None,
            arcs: Vec::new(),
        });
    }

    // Films, novels and games have no instalments to derive from, so they come
    // off `Category:Media` where a wiki keeps one. They cannot be scope-scanned,
    // but they are still the thing a user means when they say "the movie".
    if let Ok(media) = wiki_category(api.clone(), "Media".to_string(), Some(60)).await {
        let known: HashSet<String> = works.iter().map(|w| w.name.to_lowercase()).collect();
        for hit in media {
            if known.contains(&hit.title.to_lowercase()) || is_subdivision(&hit.title) {
                continue;
            }
            works.push(WikiWork {
                name: hit.title,
                kind: "other".to_string(),
                instalment_categories: Vec::new(),
                instalment_kind: String::new(),
                instalment_count: 0,
                thumbnail: None,
                arcs: Vec::new(),
            });
        }
    }

    // Main series first, then by how much story there is to draw on.
    works.sort_by(|a, b| {
        let rank = |k: &str| match k {
            "series" => 0,
            "spinoff" => 1,
            _ => 2,
        };
        rank(&a.kind)
            .cmp(&rank(&b.kind))
            .then(b.instalment_count.cmp(&a.instalment_count))
    });
    works.truncate(24);

    let titles: Vec<String> = works.iter().map(|w| w.name.clone()).collect();
    if let Ok(thumbs) = wiki_fetch_thumbnails(api.clone(), titles).await {
        for work in works.iter_mut() {
            work.thumbnail = thumbs.get(&work.name).cloned();
        }
    }

    Ok(works)
}

/// The content categories worth browsing, with how many pages each holds.
#[tauri::command]
pub async fn wiki_sections(api: String) -> Result<Vec<WikiSection>, String> {
    let categories = all_categories(&api, 4000).await?;

    let mut best: HashMap<&str, (String, u32)> = HashMap::new();
    for (name, count) in categories {
        let lower = name.to_lowercase();
        for (needle, label) in SECTION_KINDS {
            // Matched as a whole trailing word so "Characters" wins but
            // "Characters by Debut" — an index, not a roster — does not.
            if lower == needle || lower.ends_with(&format!(" {needle}")) {
                let slot = best.entry(label).or_insert((name.clone(), 0));
                if count > slot.1 {
                    *slot = (name.clone(), count);
                }
            }
        }
    }

    let mut sections: Vec<WikiSection> = SECTION_KINDS
        .iter()
        .map(|(_, label)| *label)
        .collect::<Vec<_>>()
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .filter_map(|label| {
            best.get(label).map(|(category, count)| WikiSection {
                label: label.to_string(),
                category: category.clone(),
                count: *count,
            })
        })
        .collect();

    sections.sort_by(|a, b| b.count.cmp(&a.count));
    Ok(sections)
}

/// Thumbnails for a batch of titles, so grids can show art.
#[tauri::command]
pub async fn wiki_fetch_thumbnails(
    api: String,
    titles: Vec<String>,
) -> Result<HashMap<String, String>, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    let titles: Vec<String> = titles.into_iter().filter(|t| !t.trim().is_empty()).collect();

    for chunk in titles.chunks(MAX_TITLES_PER_CALL) {
        let joined = chunk.join("|");
        let data = call(
            &api,
            &[
                ("action", "query"),
                ("prop", "pageimages"),
                ("piprop", "thumbnail"),
                ("pithumbsize", "320"),
                ("pilimit", "max"),
                ("redirects", "1"),
                ("titles", &joined),
            ],
        )
        .await?;

        // Redirects mean the answer can come back under a different title than
        // was asked for, so both are mapped to the same thumbnail.
        let mut from_redirect: HashMap<String, String> = HashMap::new();
        if let Some(rows) = data.pointer("/query/redirects").and_then(|v| v.as_array()) {
            for row in rows {
                if let (Some(from), Some(to)) = (
                    row.get("from").and_then(|v| v.as_str()),
                    row.get("to").and_then(|v| v.as_str()),
                ) {
                    from_redirect.insert(to.to_string(), from.to_string());
                }
            }
        }

        if let Some(pages) = data.pointer("/query/pages").and_then(|v| v.as_array()) {
            for page in pages {
                let (Some(title), Some(thumb)) = (
                    page.get("title").and_then(|v| v.as_str()),
                    page.pointer("/thumbnail/source").and_then(|v| v.as_str()),
                ) else {
                    continue;
                };
                out.insert(title.to_string(), thumb.to_string());
                if let Some(original) = from_redirect.get(title) {
                    out.insert(original.clone(), thumb.to_string());
                }
            }
        }
    }

    Ok(out)
}

/// Everything that belongs to one story, derived from its own instalments.
///
/// This is the answer to a franchise wiki mixing casts: rather than trusting
/// `Category:Characters`, it reads the chosen work's chapters and keeps what
/// they actually point at. `sample` caps how many instalments are read, since a
/// 271-chapter series does not need all of them to establish who matters.
#[tauri::command]
pub async fn wiki_scope(
    api: String,
    instalment_categories: Vec<String>,
    sample: Option<u32>,
    min_share: Option<f32>,
) -> Result<Vec<scope::ScopedPage>, String> {
    let sample = sample.unwrap_or(40).clamp(4, 120) as usize;
    let min_share = min_share.unwrap_or(0.12).clamp(0.0, 1.0);

    if instalment_categories.is_empty() {
        return Err("That work has no instalments to read — pick another, or browse the wiki's categories instead.".to_string());
    }

    // Every instalment belonging to the work, across all its categories. A main
    // series files its chapters under arcs, so this is usually several lists
    // joined — and joining only *its* lists is what keeps a spin-off's chapters,
    // filed under their own category, from ever entering the sample.
    let mut members: Vec<String> = Vec::new();
    for category in &instalment_categories {
        let rows = wiki_category(api.clone(), category.clone(), Some(500)).await?;
        members.extend(rows.into_iter().map(|hit| hit.title));
    }
    members.sort();
    members.dedup();

    if members.is_empty() {
        return Err("That work has no instalments filed under it.".to_string());
    }

    // Spread the sample across the whole run rather than taking the first N, so
    // a long series is judged by its full span. Reading only the opening arc
    // would drop everyone introduced later.
    let step = (members.len() as f32 / sample as f32).max(1.0);
    let seeds: Vec<String> = (0..sample)
        .map(|i| (i as f32 * step).floor() as usize)
        .take_while(|idx| *idx < members.len())
        .map(|idx| members[idx].clone())
        .collect();

    let mut pages: Vec<(String, String)> = Vec::with_capacity(seeds.len());
    for chunk in seeds.chunks(MAX_TITLES_PER_CALL) {
        let joined = chunk.join("|");
        let data = call(
            &api,
            &[
                ("action", "query"),
                ("prop", "revisions"),
                ("rvprop", "content"),
                ("rvslots", "main"),
                ("redirects", "1"),
                ("titles", &joined),
            ],
        )
        .await?;

        if let Some(rows) = data.pointer("/query/pages").and_then(|v| v.as_array()) {
            for page in rows {
                let title = page
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let content = page
                    .pointer("/revisions/0/slots/main/content")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                if !content.is_empty() {
                    pages.push((title, content));
                }
            }
        }
    }

    if pages.is_empty() {
        return Err("Could not read that work's instalments.".to_string());
    }

    let sampled = pages.len();
    Ok(scope::rank(scope::harvest(&pages), sampled, min_share))
}
