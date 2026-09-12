//! Working out which story a wiki page belongs to.
//!
//! A wiki is organised around its franchise, not around the part of it you want
//! to play. The Jujutsu Kaisen wiki holds the 2018 manga, its 2025 sequel
//! *Modulo*, a film and several novels, and the filing does not separate them:
//! `Category:Characters` mixes every cast, and Modulo's own leads carry exactly
//! the same categories as characters who never appear in it. So scope cannot be
//! read off the categories — it has to be derived.
//!
//! What *does* separate the stories is their own instalments. A spin-off's
//! chapters and episodes are unambiguously its own: they are named after it and
//! filed under it, and everything that matters to that story is linked from
//! them, usually many times over. So:
//!
//!   1. find the instalment pages belonging to the chosen work
//!   2. read what they link to, with navigation templates stripped first
//!   3. rank by how much of the story each thing actually appears in
//!
//! Step 2 is why this reads wikitext rather than asking the API for a page's
//! links. A navbox listing all 271 chapters of the parent series is transcluded
//! onto every one of the spin-off's chapter pages, and `prop=links` cannot tell
//! that apart from the cast. Stripping navigation first is the difference
//! between a clean sixty-entry lorebook and a four-hundred-entry franchise dump.
//!
//! Step 3 is what keeps a walk-on out while keeping the protagonist in, and it
//! is measured rather than guessed: something linked from one chapter out of
//! twenty-five is background, something linked from twenty is the story.

use std::collections::{HashMap, HashSet};

/// Templates whose contents are navigation, citation or layout rather than
/// story. Matched on the template name, lowercased.
const TEMPLATE_DROP_SUBSTR: [&str; 8] = [
    "navi", "navbox", "navbar", "sidebar", "footer", "toc", "reflist", "citation",
];

const TEMPLATE_DROP: [&str; 22] = [
    "ref", "refs", "references", "cite", "main", "main article", "see also",
    "seealso", "for", "about", "redirect", "disambig", "disambiguation",
    "hatnote", "stub", "spoiler", "spoilers", "clear", "clr", "br", "portal",
    "shortcut",
];

/// Namespaces that are never lorebook entries.
const DROP_PREFIXES: [&str; 10] = [
    "file:", "image:", "category:", "template:", "help:", "user:", "talk:",
    "special:", "module:", "mediawiki:",
];

/// Words that mark a page as an instalment — evidence, never output. Nobody
/// wants twenty-five chapter summaries in a lorebook.
const INSTALMENT_WORDS: [&str; 10] = [
    "chapter", "episode", "volume", "issue", "season", "arc list", "list of",
    "gallery", "image gallery", "soundtrack",
];

/// Remove templates that carry navigation rather than story, leaving `[[links]]`
/// in the surviving text intact.
///
/// Surviving templates keep their parameters, because Fandom roster grids and
/// infobox rows hold real links — `new character = [[Yuka Okkotsu]]` is the wiki
/// stating outright who debuts in a chapter, which is the single most reliable
/// signal a spin-off's own cast gives off.
pub fn strip_noise_templates(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;

    while i < chars.len() {
        if i + 1 < chars.len() && chars[i] == '{' && chars[i + 1] == '{' {
            match scan_balanced(&chars, i) {
                Some((body, end)) => {
                    let name = body
                        .trim_start_matches('{')
                        .split(['|', '\n'])
                        .next()
                        .unwrap_or("")
                        .trim()
                        .replace('_', " ")
                        .to_lowercase();

                    let drop = TEMPLATE_DROP.contains(&name.as_str())
                        || TEMPLATE_DROP_SUBSTR.iter().any(|s| name.contains(s));
                    if !drop {
                        out.push_str(&body);
                    }
                    i = end;
                    continue;
                }
                None => {
                    out.extend(&chars[i..]);
                    break;
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }

    out
}

/// Read a balanced `{{ … }}` run, returning its text and the index just past it.
fn scan_balanced(chars: &[char], start: usize) -> Option<(String, usize)> {
    let mut depth = 0usize;
    let mut i = start;
    while i + 1 < chars.len() {
        if chars[i] == '{' && chars[i + 1] == '{' {
            depth += 1;
            i += 2;
            continue;
        }
        if chars[i] == '}' && chars[i + 1] == '}' {
            depth -= 1;
            i += 2;
            if depth == 0 {
                return Some((chars[start..i].iter().collect(), i));
            }
            continue;
        }
        i += 1;
    }
    None
}

/// Every `[[target]]` in the text, normalised.
///
/// Section anchors are dropped so `[[Sorcerer Clan#Zenin]]` resolves to the
/// article, and a leading colon is stripped: `[[:Category:Cursed Tools]]` links
/// to the category rather than filing under it, but it is the same unwanted page.
pub fn link_targets(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    let bytes: Vec<char> = text.chars().collect();
    let mut i = 0usize;

    while i + 1 < bytes.len() {
        if bytes[i] != '[' || bytes[i + 1] != '[' {
            i += 1;
            continue;
        }
        let mut j = i + 2;
        let mut raw = String::new();
        while j + 1 < bytes.len() && !(bytes[j] == ']' && bytes[j + 1] == ']') {
            raw.push(bytes[j]);
            j += 1;
        }
        i = j + 2;

        let target = raw
            .split('|')
            .next()
            .unwrap_or("")
            .split('#')
            .next()
            .unwrap_or("")
            .trim()
            .trim_start_matches(':')
            .trim()
            .to_string();

        if target.is_empty() {
            continue;
        }
        let lower = target.to_lowercase();
        if DROP_PREFIXES.iter().any(|p| lower.starts_with(p)) {
            continue;
        }
        // Interwiki prefixes like `w:` or `de:`.
        if let Some((prefix, _)) = target.split_once(':') {
            if prefix.len() <= 3 && prefix.chars().all(|c| c.is_ascii_lowercase()) {
                continue;
            }
        }
        found.push(normalise_title(&target));
    }

    found
}

fn normalise_title(title: &str) -> String {
    let trimmed = title.trim().replace('_', " ");
    let mut chars = trimmed.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => trimmed,
    }
}

/// Could this link target be a lorebook entry at all?
pub fn is_plausible_entry(title: &str) -> bool {
    let lower = title.to_lowercase();
    if title.contains(':') {
        return false;
    }
    if INSTALMENT_WORDS.iter().any(|w| lower.starts_with(w) || lower.contains(&format!(" {w} "))) {
        return false;
    }
    // "Chapter 12", "Episode 3", "Volume 1" — trailing-number instalments.
    if lower
        .rsplit_once(' ')
        .map(|(head, tail)| {
            tail.chars().all(|c| c.is_ascii_digit()) && INSTALMENT_WORDS.contains(&head)
        })
        .unwrap_or(false)
    {
        return false;
    }
    title.len() > 1
}

#[derive(Debug, Clone, Default)]
pub struct Tally {
    /// How many instalments link to this at all — the number that measures
    /// presence in the story.
    pub seeds: usize,
    /// Total links. Breaks ties only: one chapter naming someone twelve times
    /// says less about a story than twelve chapters naming them once.
    pub mentions: usize,
    /// The wiki stating outright that this debuts here.
    pub debut: bool,
}

/// Count what a work's instalments point at.
pub fn harvest(pages: &[(String, String)]) -> HashMap<String, Tally> {
    let mut tally: HashMap<String, Tally> = HashMap::new();

    for (_, raw) in pages {
        let stripped = strip_noise_templates(raw);
        let mut seen: HashSet<String> = HashSet::new();

        for target in link_targets(&stripped) {
            if !is_plausible_entry(&target) {
                continue;
            }
            let row = tally.entry(target.clone()).or_default();
            row.mentions += 1;
            seen.insert(target);
        }
        for target in seen {
            tally.entry(target).or_default().seeds += 1;
        }

        // A chapter's "new character" row names its own debuts explicitly.
        for target in infobox_debut_links(raw) {
            if is_plausible_entry(&target) {
                tally.entry(target).or_default().debut = true;
            }
        }
    }

    tally
}

/// Link targets from the infobox rows that name debuts.
///
/// Matched on the *field name* rather than anywhere in the line. Searching a
/// whole line for "debut" or "introduc" catches prose and neighbouring rows — a
/// cast list one word away from "introduced" would hand back the entire cast.
///
/// Fields are found wherever they appear rather than only at the start of a
/// line, because both layouts are in use: the chapter pages checked here put
/// each field on its own line, while plenty of wikis write the whole infobox
/// inline. A field's value ends at the next `|` that is not inside a link or a
/// nested template, so `[[Target|label]]` does not cut it short.
fn infobox_debut_links(raw: &str) -> Vec<String> {
    let chars: Vec<char> = raw.chars().collect();
    let mut found = Vec::new();
    let mut i = 0usize;

    while i < chars.len() {
        if chars[i] != '|' {
            i += 1;
            continue;
        }

        // Read the field name up to '='.
        let mut j = i + 1;
        let mut name = String::new();
        while j < chars.len() && chars[j] != '=' && chars[j] != '\n' && chars[j] != '|' {
            name.push(chars[j]);
            j += 1;
        }
        if j >= chars.len() || chars[j] != '=' {
            i += 1;
            continue;
        }

        let field = name.trim().to_lowercase().replace(['_', '-'], " ");
        let names_a_debut = field.contains("new character")
            || field.contains("debut")
            || field.starts_with("introduc");

        // Read the value up to the next separator at bracket depth zero.
        let mut k = j + 1;
        let mut value = String::new();
        let mut link_depth = 0i32;
        let mut brace_depth = 0i32;
        while k < chars.len() {
            let c = chars[k];
            if c == '[' && chars.get(k + 1) == Some(&'[') {
                link_depth += 1;
            } else if c == ']' && chars.get(k + 1) == Some(&']') {
                link_depth -= 1;
            } else if c == '{' && chars.get(k + 1) == Some(&'{') {
                brace_depth += 1;
            } else if c == '}' && chars.get(k + 1) == Some(&'}') {
                brace_depth -= 1;
                if brace_depth < 0 {
                    break;
                }
            } else if (c == '|' || c == '\n') && link_depth <= 0 && brace_depth <= 0 {
                break;
            }
            value.push(c);
            k += 1;
        }

        if names_a_debut {
            found.extend(link_targets(&value));
        }
        i = k.max(i + 1);
    }

    found
}

/// One candidate entry, with the evidence for including it.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopedPage {
    pub title: String,
    /// Instalments this appears in.
    pub seeds: usize,
    /// Instalments sampled, so a share can be shown honestly.
    pub of: usize,
    pub debut: bool,
}

/// Rank what the instalments turned up, keeping what is actually in the story.
///
/// `min_share` is the fraction of a work's instalments something must appear in.
/// It is exposed rather than fixed because the right threshold depends on the
/// wiki: a tightly-linked wiki puts the whole cast in every chapter, a sparse
/// one names only who speaks.
pub fn rank(tally: HashMap<String, Tally>, sampled: usize, min_share: f32) -> Vec<ScopedPage> {
    if sampled == 0 {
        return Vec::new();
    }
    let floor = ((sampled as f32) * min_share).ceil().max(1.0) as usize;

    let mut rows: Vec<ScopedPage> = tally
        .into_iter()
        // A debut is the wiki naming this as the story's own, which outranks a
        // low link count: a character introduced in the final chapter belongs
        // even though almost nothing links to them yet.
        .filter(|(_, t)| t.debut || t.seeds >= floor)
        .map(|(title, t)| ScopedPage {
            title,
            seeds: t.seeds,
            of: sampled,
            debut: t.debut,
        })
        .collect();

    rows.sort_by(|a, b| {
        b.debut
            .cmp(&a.debut)
            .then(b.seeds.cmp(&a.seeds))
            .then(a.title.cmp(&b.title))
    });
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navboxes_are_stripped_but_roster_rows_survive() {
        let raw = "{{Navbox|[[Chapter 1]]|[[Chapter 2]]}}\
                   {{Infobox|new character = [[Yuka Okkotsu]]}}\
                   Body mentions [[Satoru Gojo]].";
        let stripped = strip_noise_templates(raw);
        let links = link_targets(&stripped);
        assert!(links.contains(&"Satoru Gojo".to_string()));
        // The infobox is kept, because its parameters hold the debut roster.
        assert!(links.contains(&"Yuka Okkotsu".to_string()));
        // The navbox listing every chapter is gone.
        assert!(!links.contains(&"Chapter 1".to_string()));
    }

    #[test]
    fn files_categories_and_anchors_are_not_entries() {
        let links = link_targets("[[File:X.png]] [[Category:Y]] [[Sorcerer Clan#Zenin]] [[:Category:Z]]");
        assert_eq!(links, vec!["Sorcerer Clan".to_string()]);
    }

    #[test]
    fn instalment_pages_are_evidence_not_output() {
        assert!(!is_plausible_entry("Chapter 12"));
        assert!(!is_plausible_entry("List of Episodes"));
        assert!(is_plausible_entry("Yuji Itadori"));
    }

    #[test]
    fn presence_across_instalments_beats_repetition_within_one() {
        // Twelve mentions in one chapter versus one mention in each of three.
        let pages = vec![
            ("c1".into(), "[[Walk On]] ".repeat(12)),
            ("c2".into(), "[[Lead]]".into()),
            ("c3".into(), "[[Lead]]".into()),
            ("c4".into(), "[[Lead]]".into()),
        ];
        let tally = harvest(&pages);
        assert_eq!(tally["Lead"].seeds, 3);
        assert_eq!(tally["Walk On"].seeds, 1);
        assert_eq!(tally["Walk On"].mentions, 12);

        let ranked = rank(tally, 4, 0.5);
        let titles: Vec<&str> = ranked.iter().map(|r| r.title.as_str()).collect();
        assert_eq!(titles, vec!["Lead"]);
    }

    #[test]
    fn only_the_debut_field_counts_not_the_whole_line() {
        // A cast row that merely contains the word must not mark everyone as
        // debuting, and the real debut row still must.
        let raw = "|characters = [[Regular]] introduced earlier\n|new character = [[Newcomer]]";
        let links = infobox_debut_links(raw);
        assert_eq!(links, vec!["Newcomer".to_string()]);
    }

    #[test]
    fn debut_fields_are_read_from_real_line_based_wikitext() {
        // The layout the Jujutsu Kaisen chapter pages actually use.
        let raw = "|chapter = 1\n|new character = [[Megumi Fushiguro]]<br>[[Satoru Gojo]] {{Sub|(Cover Only)}}<br>[[Yuji Itadori]]\n|arc = Cursed Womb";
        let links = infobox_debut_links(raw);
        assert!(links.contains(&"Megumi Fushiguro".to_string()));
        assert!(links.contains(&"Satoru Gojo".to_string()));
        assert!(links.contains(&"Yuji Itadori".to_string()));
        // The nested {{Sub|…}} must not terminate the value early.
        assert_eq!(links.len(), 3);
    }

    #[test]
    fn a_debut_is_kept_even_when_barely_linked() {
        let pages = vec![(
            "final".to_string(),
            "{{Infobox|new character = [[Late Arrival]]}} [[Lead]] [[Lead]]".to_string(),
        )];
        let tally = harvest(&pages);
        let ranked = rank(tally, 20, 0.5);
        assert!(ranked.iter().any(|r| r.title == "Late Arrival" && r.debut));
    }

    #[test]
    fn unbalanced_braces_do_not_swallow_the_page() {
        let stripped = strip_noise_templates("{{Broken [[Kept Link]]");
        assert!(link_targets(&stripped).contains(&"Kept Link".to_string()));
    }
}
