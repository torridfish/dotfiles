# Global Rules

## Python virtual environment
- If no other venv manager (e.g. conda) specified, always default to use [uv](https://docs.astral.sh/uv/getting-started/first-steps/).
- Never directly install package or run scripts with base python environment.

## git / gh convention
- Use conventional commit format to write up commit message.
- When sharing a report with people outside this session, publish it as a secret gist (`gh gist create --secret`).

## Papers
- If user ask you to read paper, go fetch the latex source code to tmp folder first. 
    - For arxiv, this is under `https://arxiv.org/src/xxxx`.
    - If no source code exist, then go fetch html file.
    - PDF is your last choice, do not read pdf first (e.g. `https://arxiv.org/pdf/xxxx`).

## Writing style
Applies to chat replies and to every file, commit, PR and slide I write.
When writing documents (README, PR description, docs), also apply asd-ste100 in its STE-flavored mode.

### Punctuation
- Never use an em dash (—, or the Chinese ——) as a parenthetical aside or a sentence break,
  and never use a double hyphen (--) for the same purpose. Use a colon, comma, period or parentheses.
- An en dash (–) is fine for number ranges (#116–#129).
- Always use half-width parentheses () and brackets [], including inside Chinese text.
  Never use full-width （）or 【】.

### Wording
- Say things literally. No metaphor or personification: write "causes slow requests", not
  "this bites"; "needs", not "wants". Name who or what acts.
- Keep "that" in relative clauses ("the fix that we shipped").
- Keep the verb close to its subject; put long asides after the verb.
- Use a noun plus a plain verb, not a noun used as a verb ("add a footnote", not "footnote it").
  At most two nouns in a row; more get "for" or "of".
- On first use, write a proper term in full, then the acronym in parentheses:
  "Attack Success Rate (ASR)". Use the acronym alone after that.
- Do not invent a missing fact, number or actor. Ask, or leave a bracketed placeholder.

### Phrases and structures to avoid
- "It's not X, it's Y", and the Chinese 「不是……而是……」 pattern. State Y directly.
- "It is worth noting that" and 「值得注意的是」. Say the thing.
- A closing sentence that summarizes what the text just said.

### Format
- Dates read "Nov. 8, 2026".
- No emoji.

## Language
- Default to English.
- If the user's latest message is primarily in Chinese, reply in Traditional Chinese as used in Taiwan (zh-TW).
    This applies to the entire reply, even when tool output, search results, or quoted material is in English.
    - Never use Simplified Chinese characters or switch to Japanese or Korean.
    - Use Taiwanese vocabulary rather than mainland terms (e.g., 軟體 not 軟件, 預設 not 默認, 資料 not 數據, 程式 not 程序).
    - Keep technical terms, identifiers, and proper nouns in English where that is natural usage (e.g., branch, commit, PR, API and library names).
    - Chinese is for conversational replies only. Everything else is written in English unless the user says otherwise:
    code, code comments, documentation, commit messages, PR titles and descriptions, and any files or reports you create.

## User confirmation
These rules apply in auto mode too.
- **OK to do right away:**
    - Read-only investigation (reading files, grep, logs, checking config) and answering questions.
    - Edits and commits the user explicitly asked for, when the scope is clear (e.g. "change X to Y", "commit this").
- **Needs a checklist and my confirmation first:**
    - Hard-to-reverse or outward-facing actions: deleting or moving files, git push, installing packages,
      publishing to external services (e.g. `gh gist create`, Google Sheet writes).
    - Ambiguous requests, or work that goes beyond what was asked (extra files, refactors, cleanup, new features).
- The checklist should include:
    1. Your understanding of the request (one or two sentences)
    2. Your assumptions, plus anything uncertain that the user needs to decide
    3. Files to change, and what changes in each
    4. What you **won't** do
- What counts as confirmation:
    - Any clear approval in any language (e.g. "OK", "go", "好", "可以"), or the user directly asking for the next step.
    - If the user only replies with questions or edits, update the checklist and ask again.
- Approval covers only what was asked or what is on the checklist.
  If you need something outside it, or results differ from what you expected, ALWAYS stop and report.
  Don't change direction or fix things on the side.
