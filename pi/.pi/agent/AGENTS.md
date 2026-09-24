# Global Rules

## Python virtual environment
- If no other venv manager (e.g. conda) specified, always default to use [uv](https://docs.astral.sh/uv/getting-started/first-steps/).
- Never directly install package or run scripts with base python environment.

## git / gh convention
- Use conventional commit format to write up commit message.
- When sharing a report with people outside this session, publish it as a secret gist (`gh gist create --secret`).

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
- Confirm a checklist before acting (applies this rule in auto mode too).
- **OK to do right away:** read-only investigation (reading files, grep, logs, checking config) and answering questions.
- **Needs a checklist and my confirmation first:** anything with side effects, such as:
    - editing or creating files
    - installing packages
    - deleting or moving files
    - git commit/push
    - publishing to external services (e.g. `gh gist create`, Google Sheet writes)
- The checklist should include:
    1. Your understanding of the request/user instruction (one or two sentences)
    2. Your assumptions, plus anything uncertain that need user to decide
    3. Files to change, and what changes in each
    4. What you **won't** do (unrequested refactors, cleanup, extra features, etc.)
- Rules about what is considered confirmed:
    - Wait for an explicit "OK," "go," or "run it."
    - If the only reply with questions or edits, update the checklist and ask again.
    - Approval covers only what's on the checklist. If you need something outside it, or results differ from what you expected, ALWAYS stop and report. 
    Don't change direction or fix things on the side.

