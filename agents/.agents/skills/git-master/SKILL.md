---
name: git-master
description: "MUST USE for ANY git operations. Atomic commits, rebase/squash, history search (blame, bisect, log -S). Triggers: 'commit', 'rebase', 'squash', 'who wrote', 'when was X added', 'find the commit that'."
---

# Git Master

You are a Git expert with three roles:

1. **Commit architect**: atomic commits, dependency order, style detection.
2. **Rebase surgeon**: history rewrite, conflict resolution, branch cleanup.
3. **History archaeologist**: find where and when a change entered the code.

## 1. Pick the mode

| Request | Mode | Go to |
|---|---|---|
| Commit intent in any language ("commit", "커밋", "コミット") | `COMMIT` | Section 2 |
| Rebase or squash intent ("rebase", "리베이스", "リベース", "rebase onto", "smart rebase") | `REBASE` | Section 3 |
| History lookup ("find when", "언제 바뀌었", "いつ追加") | `HISTORY` | Section 4 |

Parse the request. Do not default to `COMMIT`.

## Shared setup

Run this line once per shell. Recompute it if the shell restarts.

```bash
MERGE_BASE=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD master)
```

## 2. Commit mode

### 2.1 Split into multiple commits

<critical_warning>
One commit for many files is a failure. Your default is several commits.

**Split by:**

| Criterion | Action |
|---|---|
| Different directory or module | SPLIT |
| Different component type (model, service, view) | SPLIT |
| Each part reverts independently | SPLIT |
| Different concern (UI, logic, config, test) | SPLIT |
| New file vs. modified file | SPLIT |

**Combine only when all of these are true:**

- The files form one atomic unit (for example, a function and its test).
- A split would break the build.
- You can justify the grouping in one sentence.

**Self-check before you commit:**

```
"I am making N commits from M files."
IF N == 1 AND M > 2:
  -> WRONG. Split again.
  -> If you cannot justify each group, split.
```
</critical_warning>

**Minimum commits by file count:**

| Files changed | Minimum commits |
|---|---|
| 1-2 | 1 |
| 3-4 | 2 |
| 5-9 | 3 |
| 10-19 | 5 |
| 20+ | 7 |

### 2.2 Phase 0: Gather context in parallel

Run all of these commands at the same time.

```bash
# Group 1: current state
git status
git diff --staged --stat
git diff --stat

# Group 2: history
git log -30 --oneline
git log -30 --pretty=format:"%s"

# Group 3: branch
git branch --show-current
git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "NO_UPSTREAM"
git log --oneline $MERGE_BASE..HEAD 2>/dev/null
```

Collect five data points:

1. Which files changed (staged and unstaged).
2. The last 30 commit messages, for style detection.
3. The branch position relative to main or master.
4. Whether the branch has an upstream.
5. Which local commits would go into a PR.

### 2.3 Phase 1: Detect the commit style (blocking)

Print the result before Phase 2.

**Language profile.** Count the last 30 commits.

- Preserve the dominant language and script of the repository.
- If several languages are common, follow the nearest recent example for the same module.
- Accept any language the repo uses (Japanese, Korean, English, and others).

**Style classification:**

| Style | Pattern | Example | Detection regex |
|---|---|---|---|
| `SEMANTIC` | `type: message` or `type(scope): message` | `feat: add login` | `/^(feat\|fix\|chore\|refactor\|docs\|test\|ci\|style\|perf\|build)(\(.+\))?:/` |
| `PLAIN` | Description only | `Add login feature` | No prefix, more than 3 words |
| `SENTENCE` | Full sentence | `Implemented the new login flow` | Complete grammatical sentence |
| `SHORT` | Keywords only | `format`, `lint` | 1 to 3 words |

**Detection order:**

```
semantic_count = commits that match the semantic regex
plain_count    = commits with no prefix and more than 3 words
short_count    = commits with 3 words or fewer

IF semantic_count >= 15 (50%) -> STYLE = SEMANTIC
ELSE IF plain_count >= 15     -> STYLE = PLAIN
ELSE IF short_count >= 10     -> STYLE = SHORT
ELSE                          -> STYLE = PLAIN
```

**Required output:**

```
STYLE DETECTION RESULT
======================
Analyzed: 30 commits from git log

Language profile: [DOMINANT_LANGUAGE_OR_SCRIPT]
  - Dominant pattern: N (X%)
  - Secondary pattern: M (Y%)

Style: [SEMANTIC | PLAIN | SENTENCE | SHORT]
  - Semantic: N (X%)
  - Plain: M (Y%)
  - Short: K (Z%)

Reference examples from the repo:
  1. "actual commit message"
  2. "actual commit message"
  3. "actual commit message"

All commits will follow: [DOMINANT_LANGUAGE_OR_SCRIPT] + [STYLE]
```

A commit that ignores this result is wrong. Print the block, then continue.

### 2.4 Phase 2: Check the branch state

**Branch state:**

```
current_branch: <name>
has_upstream: true | false
commits_ahead: N
merge_base: <hash>
```

**Rewrite safety:**

- Branch has an upstream, has local commits, and was already pushed: warn before the force push.
- No upstream, or every commit is local: aggressive rewrite is safe (fixup, reset, rebase).
- Branch is main or master: never rewrite. Add new commits only.

**Rewrite strategy:**

```
IF current_branch == main OR current_branch == master:
  -> NEW_COMMITS_ONLY        # never fixup, never rebase
ELSE IF commits_ahead == 0:
  -> NEW_COMMITS_ONLY        # no history to rewrite
ELSE IF all commits are local:
  -> AGGRESSIVE_REWRITE      # fixup, reset, and rebase freely
ELSE IF pushed but not merged:
  -> CAREFUL_REWRITE         # fixup is OK, warn before force push
```

### 2.5 Phase 3: Plan the atomic units (blocking)

Print the commit plan before Phase 4.

**Split by directory first.** Different directories go into different commits.

```
Example: 8 changed files
  app/[locale]/page.tsx, layout.tsx
  components/demo/browser-frame.tsx, shopify-full-site.tsx
  components/pricing/pricing-table.tsx
  e2e/navbar.spec.ts
  messages/en.json, ko.json

WRONG: 1 commit "Update landing page"
WRONG: 2 commits

CORRECT: 5 commits
  1. app/[locale]/*        (app layer)
  2. components/demo/*     (demo components)
  3. components/pricing/*  (pricing components)
  4. e2e/*                 (tests)
  5. messages/*            (i18n)
```

**Split by concern second.** Inside one directory, group by logical concern.

```
Example: 4 files in components/demo/
  browser-frame.tsx and shopify-full-site.tsx: existing demos
  review-dashboard.tsx and tone-settings.tsx: new demos

Acceptable: 1 commit if all four are tightly coupled
Preferred: 2 commits
  - "Update existing demo components"
  - "Add new demo components"
```

**Never do this:**

- `"Refactor entire landing page"` with 15 files.
- `"Update components and tests"` with mixed concerns.
- `"Big update"` with 5 or more unrelated files.

Aim for 1 to 4 files per commit. A reviewer must understand each commit in 30 seconds.

**Pair each test with its implementation.** These are the same commit.

```
test_*.py    <-> *.py
*_test.py    <-> *.py
*.test.ts    <-> *.ts
*.spec.ts    <-> *.ts
__tests__/*.ts <-> *.ts
tests/*.py   <-> src/*.py
```

**Justify every commit with 3 or more files.** Do this before you finalize the plan.

```
FOR EACH commit with 3+ files:
  1. List the files.
  2. Write one sentence that says why they must stay together.
  3. If you cannot write that sentence, split the commit.
```

| Valid reason | Invalid reason |
|---|---|
| "implementation file plus its direct test" | "all related to feature X" |
| "type definition plus its only consumer" | "part of the same PR" |
| "migration plus the model change it needs" | "you changed them together" |
| | "makes sense to group" |

**Order by dependency:**

```
Level 0: utilities, constants, type definitions
Level 1: models, schemas, interfaces
Level 2: services, business logic
Level 3: API endpoints, controllers
Level 4: configuration, infrastructure
```

Commit in this order: Level 0 -> Level 1 -> Level 2 -> Level 3 -> Level 4.

**Define the commit groups:**

```yaml
- group_id: 1
  feature: "Add Shopify discount deletion"
  files:
    - errors/shopify_error.py
    - types/delete_input.py
    - mutations/update_contract.py
    - tests/test_update_contract.py
  dependency_level: 2
  target_commit: null | <existing-hash>   # null = new commit, hash = fixup
```

**Required output:**

```
COMMIT PLAN
===========
Files changed: N
Minimum commits: M
Planned commits: K
Status: K >= M (PASS) | K < M (FAIL - split more)

COMMIT 1: [message in detected style]
  - path/to/file1.py
  - path/to/file1_test.py
  Justification: implementation plus its test

COMMIT 2: [message in detected style]
  - path/to/file2.py
  Justification: independent utility function

COMMIT 3: [message in detected style]
  - config/settings.py
  - config/constants.py
  Justification: tightly coupled config change

Execution order: Commit 1 -> Commit 2 -> Commit 3
```

**Check the plan before you execute:**

- Each commit has 4 files or fewer, or a justification.
- Each message matches the detected style and language.
- Each test sits with its implementation.
- Different directories are in different commits, or justified.
- The commit count is at least M.

If a check fails, replan. Do not proceed.

### 2.6 Phase 4: Choose fixup or new commit

For each commit group:

```
FIXUP if:
  - The change completes the intent of an existing commit.
  - It fixes a bug or adds a missing part of the same feature.
  - It answers review feedback.
  - The target commit is in local history.

NEW COMMIT if:
  - It adds a new feature or capability.
  - It is an independent logical unit.
  - It belongs to a different issue or ticket.
  - No suitable target commit exists.
```

**Reset and rebuild (aggressive option).** Use it when history is messy, commits are not atomic, or the dependency order is wrong.

```bash
git reset --soft $MERGE_BASE    # all changes become staged
# then commit again in proper atomic units
```

Use this only if every commit is local, and the user allows it or the branch is clearly WIP.

**Final plan:**

```yaml
EXECUTION_PLAN:
  strategy: FIXUP_THEN_NEW | NEW_ONLY | RESET_REBUILD
  fixup_commits:
    - files: [...]
      target: <hash>
  new_commits:
    - files: [...]
      message: "..."
      level: N
  requires_force_push: true | false
```

### 2.7 Phase 5: Execute the commits

**Register TODO items.** Use TodoWrite, a Claude Code tool. In other harnesses, track the same items in that harness's task list.

```
- [ ] Fixup: <description> -> <target-hash>
- [ ] New: <description>
- [ ] Rebase --autosquash
- [ ] Final verification
```

**Create the fixup commits first, then one autosquash rebase:**

```bash
git add <files>
git commit --fixup=<target-hash>
# repeat for each fixup

GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash $MERGE_BASE
```

**Then create the new commits in dependency order:**

```bash
git add <file1> <file2>
git diff --staged --stat      # verify the staging area
git commit -m "<message>"
git log -1 --oneline          # verify the commit
```

**Generate each message from the detected style:**

```
IF style == SEMANTIC:
  -> prefix plus message in the repository language
     "feat: add login feature"
     "feat: ログイン機能を追加"
     "feat: 로그인 기능 추가"

IF style == PLAIN:
  -> message in the repository language, no prefix
     "Add login feature"
     "ログイン機能を追加"
     "로그인 기능 추가"

IF style == SHORT:
  -> "format" / "type fix" / "lint"
```

Check each message before the commit. It must match the detected style, use the dominant language, and resemble the examples from `git log`. Rewrite it if a check fails.

### 2.8 Phase 6: Check and report

```bash
git status                                        # working directory clean
git log --oneline $MERGE_BASE..HEAD               # new history
```

Check that each commit reverts independently.

**Force push:**

```
IF you used fixup AND the branch has an upstream:
  -> git push --force-with-lease
  -> Warn the user first.

IF you added new commits only:
  -> git push
```

**Report:**

```
COMMIT SUMMARY:
  Strategy: <what you did>
  Commits created: N
  Fixups merged: M

HISTORY:
  <hash1> <message1>
  <hash2> <message2>

NEXT STEPS:
  - git push [--force-with-lease]
  - Create a PR if the branch is ready
```

## 3. Rebase mode

### 3.1 Phase R1: Analyze the rebase context

Gather this information in parallel:

```bash
git branch --show-current
git log --oneline -20
git status --porcelain
git stash list
git rev-parse --abbrev-ref @{upstream} 2>/dev/null || echo "NO_UPSTREAM"
```

**Safety assessment:**

| Condition | Risk | Action |
|---|---|---|
| On main or master | CRITICAL | Abort. Never rebase main. |
| Dirty working directory | WARNING | Stash first: `git stash push -m "pre-rebase"` |
| Pushed commits exist | WARNING | Ask the user before a force push. |
| All commits are local | SAFE | Proceed. |
| Upstream diverged | WARNING | You may need `--onto`. |

**Pick the strategy from the request:**

```
"squash commits" / "cleanup" / "정리"
  -> INTERACTIVE_SQUASH

"rebase on main" ("update branch", "메인에 리베이스", "mainにリベース")
  -> REBASE_ONTO_BASE

"autosquash" / "apply fixups"
  -> AUTOSQUASH

"reorder commits" ("커밋 순서", "コミット順を並べ替え")
  -> INTERACTIVE_REORDER

"split commit" ("커밋 분리", "コミット分割")
  -> INTERACTIVE_EDIT
```

### 3.2 Phase R2: Execute the rebase

You cannot use `-i` interactively. Use `GIT_SEQUENCE_EDITOR` for automation.

**Squash everything into one commit:**

```bash
git reset --soft $MERGE_BASE
git commit -m "Combined: <summary of all changes>"
```

For a selective squash, create fixup commits for the ones to combine, then autosquash (below).

**Autosquash:**

```bash
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash $MERGE_BASE
```

`GIT_SEQUENCE_EDITOR=:` accepts the rebase todo list as it stands, and each fixup merges into its target.

**Update the branch onto main:**

```bash
git fetch origin
git rebase origin/main

# Move commits to a different base
git rebase --onto origin/main $(git merge-base HEAD origin/main) HEAD
```

**Resolve a conflict:**

1. List the conflicting files: `git status | grep "both modified"`.
2. Read each file. Compare HEAD with the incoming version.
3. Edit the file. Remove the markers `<<<<`, `====`, `>>>>`.
4. Stage the file: `git add <resolved-file>`.
5. Continue: `git rebase --continue`.
6. Abort if you are unsure: `git rebase --abort`.

**Recovery:**

| Situation | Command | Notes |
|---|---|---|
| Rebase is going wrong | `git rebase --abort` | Returns to the pre-rebase state |
| Need the original commits | `git reflog` then `git reset --hard <hash>` | The reflog keeps 90 days |
| Force-pushed by mistake | `git reflog`, then coordinate with the team | You may need to notify others |
| Lost commits | `git fsck --lost-found` | Last resort |

### 3.3 Phase R3: Check after the rebase

```bash
git status
git log --oneline $MERGE_BASE..HEAD
git diff ORIG_HEAD..HEAD --stat    # compare with the pre-rebase state
```

Run the project test command if tests exist.

**Push:**

```
IF the branch was never pushed:
  -> git push -u origin <branch>

IF the branch was already pushed:
  -> git push --force-with-lease origin <branch>
  -> Always --force-with-lease, never --force
```

### 3.4 Phase R4: Report

```
REBASE SUMMARY:
  Strategy: <SQUASH | AUTOSQUASH | ONTO | REORDER>
  Commits before: N
  Commits after: M
  Conflicts resolved: K

HISTORY:
  <hash1> <message1>
  <hash2> <message2>

NEXT STEPS:
  - git push --force-with-lease origin <branch>
  - Review the changes before the merge
```

## 4. History search mode

### 4.1 Phase H1: Classify the request

| Request | Search type | Tool |
|---|---|---|
| "when was X added" ("X가 언제 추가됐어", "Xはいつ追加された") | PICKAXE | `git log -S` |
| "which commits changed X" | REGEX | `git log -G` |
| "who wrote this line" ("이 줄 누가 썼어", "この行を書いたのは誰") | BLAME | `git blame` |
| "when did the bug start" ("버그 언제 생겼어", "バグはいつ入った") | BISECT | `git bisect` |
| "history of this file" ("파일 히스토리", "ファイル履歴") | FILE_LOG | `git log -- <path>` |
| "find removed code" ("삭제된 코드 찾기", "削除されたコードを探す") | PICKAXE_ALL | `git log -S --all` |

Extract four parameters from the request:

- `SEARCH_TERM`: the string or pattern.
- `FILE_SCOPE`: one file, several files, or the whole repo.
- `TIME_RANGE`: all time, or a period.
- `BRANCH_SCOPE`: the current branch, or `--all`.

### 4.2 Phase H2: Run the search

**Pickaxe (`git log -S`) finds commits that add or remove a string.**

```bash
git log -S "searchString" --oneline
git log -S "searchString" -p                      # with the diff
git log -S "searchString" -- path/to/file.py      # in one file
git log -S "searchString" --all --oneline         # all branches
git log -S "searchString" --since="2024-01-01" --oneline
git log -S "searchstring" -i --oneline            # case insensitive
```

Examples:

```bash
git log -S "def calculate_discount" --oneline      # when was it added
git log -S "MAX_RETRY_COUNT" --all --oneline       # when was it removed
git log -S "== None" -- "*.py" --oneline           # who wrote this pattern
```

**Regex (`git log -G`) finds commits whose diff matches a pattern.**

```bash
git log -G "pattern.*regex" --oneline
git log -G "def\s+my_function" -p --oneline
git log -G "^import\s+requests" -- "*.py" --oneline
git log -G "TODO|FIXME|HACK" --oneline
```

`-S` compares the count of matches. `-G` compares the diff text. Use `-S` to find when a string appeared or disappeared. Use `-G` to find which commits touched lines that match.

**Blame attributes each line to a commit.**

```bash
git blame path/to/file.py
git blame -L 10,20 path/to/file.py    # line range
git blame -C path/to/file.py          # follow moved or copied code
git blame -w path/to/file.py          # ignore whitespace
git blame -e path/to/file.py          # show the email address
git blame --porcelain path/to/file.py # machine-readable output
```

Read the output as follows:

```
^abc1234 (Author Name 2024-01-15 10:30:00 +0900 42) code_line
|         |            |                       |    +-- line content
|         |            |                       +-- line number
|         |            +-- timestamp
|         +-- author
+-- commit hash (^ marks the initial commit)
```

**Bisect finds the commit that introduced a bug.**

```bash
git bisect start
git bisect bad                 # current state is bad
git bisect good v1.0.0         # this tag was good
# Git checks out a middle commit. Test it, then:
git bisect good                # or: git bisect bad
# repeat until Git prints "abc1234 is the first bad commit"
git bisect reset               # return to the original state
```

Automate the test:

```bash
git bisect start
git bisect bad HEAD
git bisect good v1.0.0
git bisect run pytest tests/test_specific.py
```

Exit code 0 means good, 1 to 127 means bad, 125 means skip.

**Trace one file:**

```bash
git log --oneline -- path/to/file.py
git log --follow --oneline -- path/to/file.py      # across renames
git log -p -- path/to/file.py
git log --all --full-history -- "**/deleted_file.py"
git shortlog -sn -- path/to/file.py                # authors by count
```

### 4.3 Phase H3: Present the results

```
SEARCH QUERY: "<what the user asked>"
SEARCH TYPE: <PICKAXE | REGEX | BLAME | BISECT | FILE_LOG>
COMMAND USED: git log -S "..." ...

RESULTS:
  Commit       Date           Message
  ---------    ----------     --------------------------------
  abc1234      2024-06-15     feat: add discount calculation
  def5678      2024-05-20     refactor: extract pricing logic

MOST RELEVANT COMMIT: abc1234
DETAILS:
  Author: John Doe <john@example.com>
  Date: 2024-06-15
  Files changed: 3

DIFF EXCERPT:
  + def calculate_discount(price, rate):
  +     return price * (1 - rate)
```

Then offer the next actions:

```
FOUND: commit abc1234 introduced the change.

POTENTIAL ACTIONS:
- git show abc1234
- git revert abc1234
- git log --ancestry-path abc1234..HEAD
- git cherry-pick abc1234
```

### 4.4 History search reference

| Goal | Command |
|---|---|
| When was "X" added? | `git log -S "X" --oneline` |
| When was "X" removed? | `git log -S "X" --all --oneline` |
| Which commits touched "X"? | `git log -G "X" --oneline` |
| Who wrote line N? | `git blame -L N,N file.py` |
| When did the bug start? | `git bisect start && git bisect bad && git bisect good <tag>` |
| File history | `git log --follow -- path/file.py` |
| Find a removed file | `git log --all --full-history -- "**/filename"` |
| Author stats for a file | `git shortlog -sn -- path/file.py` |

## 5. Anti-patterns

**Commit mode:**

1. One commit for 3 or more files. Split it.
2. A semantic prefix with no evidence from `git log`. Detect the style first.
3. A test file in a different commit from its implementation. Keep them together.
4. Grouping by file type instead of by feature or module.
5. A grouping you cannot justify in one sentence.
6. A vague reason such as "related to X" or "part of the same PR".
7. Rewriting pushed history without explicit permission.
8. A dirty working directory at the end. Finish every change.

**Rebase mode:**

1. Rebasing main or master. Never do it.
2. `--force` instead of `--force-with-lease`.
3. A rebase with dirty files and no stash. It will fail.

**History search mode:**

1. `-S` where `-G` fits. You will get the wrong commits.
2. Blame without `-C` on moved code. You will get the wrong author.
3. A bisect without proper good and bad boundaries. You will waste time.

## 6. Final check before you execute

Stop and check every box:

```
[] Commit count: N files -> at least the minimum from section 2.1?
[] Justification: for each commit with 3+ files, did I write WHY?
[] Directory split: different directories in different commits?
[] Test pairing: each test with its implementation?
[] Dependency order: foundations before dependents?
[] Style: every message matches the detected style and language?
```
