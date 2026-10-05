# LAN Trivia — Project Plan

## 1. Concept

A Kahoot/Jackbox-style trivia game played entirely on a local network. One machine
runs the **host**: it runs the game server, configures the match, and displays live
game state (connected players, round/question progress, timer, leaderboard). Other
people join as **players** from their own devices (phone/laptop) by browsing to the
host's LAN address — no accounts, no internet play, no persistence beyond a single
match.

Question content comes entirely from the [Open Trivia DB API](https://opentdb.com/api_config.php)
(`opentdb.com`) — the app supports everything that API supports (see §4).

## 2. MVP Scope

**In scope**

- Host creates a game session on the LAN; players join with a nickname from a browser.
- Host configures: number of rounds, questions per round, difficulty, per-question
  answer type(s), and per-question time limit.
- Each round: players vote on a category out of 6 random OpenTDB categories; highest
  vote wins, ties broken randomly.
- Each question: players answer within the time limit; round ends early once everyone
  has answered; correct answer + points are revealed; live leaderboard updates.
- Speed-based scoring (faster correct answers score more).
- Host can pause/resume the game at any time.
- Game ends after the configured number of rounds; final ranking is shown.

**Explicitly out of scope for MVP** (see §10 for the backlog)

- Rewards/prizes for top 3 at end of round (structure will accommodate it, logic comes later).
- Internet play, accounts, auth, persistence/DB, match history.
- Robust reconnect (see §8 for the minimal MVP behavior).
- A dedicated "big screen" / TV-only display mode (see Design Decision D1 below).
- Multiple concurrent game sessions on the same host.

## 3. Design Decisions

These are choices made to keep the MVP simple; flagged so they're easy to revisit.

- **D1 — Host screen doubles as the shared/TV display.** The host screen mirrors
  everything the players see — category vote options + live vote tally, the current
  question and answer options, the countdown, and on reveal, the correct answer plus
  *who answered correctly* (per-player, not just aggregate) — in addition to its
  control-panel duties (config, start, pause/resume). Each player's own device is
  still self-contained (shows the full question and submits answers independently,
  doesn't require looking at the host screen to play), so the app works whether or not
  anyone's actually watching a shared screen, but the host view is designed to be
  projected/cast as the "group" view of the game. The player's own reveal screen also
  highlights the correct option among the answer choices (not just a correct/wrong
  banner), so players don't need the host screen to see what the right answer was.
- **D2 — Single active game session.** The host machine runs exactly one game at a
  time; no room codes/PINs needed for MVP since anyone joining is on the same LAN and
  there's only one game to join. A PIN can be added later if this becomes a problem
  (see §10).
- **D3 — All state in memory.** No database. The whole game (players, scores, current
  question) lives in the Node process. Restarting the server ends the game.
- **D4 — Server owns all OpenTDB calls.** Players/host never call OpenTDB directly;
  only the backend does, so the 1-request-per-5-seconds rate limit and session tokens
  are easy to manage centrally (see §4).
- **D5 — Host-only sound cues.** Background/ambience/countdown sounds play on the host
  screen only (never on player devices) — see §7a. Placeholder silent `.mp3` files ship
  in the repo; real audio is dropped in later without code changes.
- **D6 — "Soft Rainbow" pastel palette, enforced via CSS tokens.** All ten palette
  colors (Lemon Chiffon, Powder Petal, Cotton Rose, Pink Orchid, Periwinkle, Baby Blue
  Ice, Sky Blue, Electric Aqua, Soft Cyan, Celadon) are defined as CSS custom
  properties in `frontend/src/styles.css` and used as-is for every background, border,
  gradient, and button/accent fill across the app. Because the palette is entirely
  light pastels, plain body text and small semantic marks (correct/wrong, error,
  low-timer digits, accent labels) would be unreadable directly on white/pastel using
  those same light hues, so a handful of same-hue *derived, darker* tokens exist
  purely for that text/icon legibility: `--text` (a dark plum-indigo, not part of the
  10 named colors — none of them are dark enough to serve as body text), plus
  `--good-strong`/`--bad-strong`/`--warn-strong`/`--accent-strong`/`--accent-2-strong`
  (deeper shades of Celadon/Cotton Rose/Lemon Chiffon/Periwinkle/Electric Aqua,
  respectively). Every surface color a user sees as a *fill* (page background gradient,
  cards, buttons, pills, option highlights, podium ranks) is one of the 10 literal
  palette hexes; the derived tones are only ever used as `color` on top of them.

## 4. Open Trivia DB Integration

Full API surface the app needs to support:

| Endpoint | Purpose |
|---|---|
| `GET /api_category.php` | Fetch the full category list at server startup (id + name), used to build the "6 random categories" vote. |
| `GET /api.php` | Fetch questions for a round. |
| `GET /api_token.php?command=request` | Get a session token at game start. |
| `GET /api_token.php?command=reset&token=...` | Reset token (see-all-questions-exhausted case). |
| `GET /api_count.php?category=ID` | (Optional) sanity-check available question counts before offering a category, so an empty category never wins a vote. |

**`/api.php` parameters supported:**

| Param | Values | Notes |
|---|---|---|
| `amount` | 1–50 | One round = one call, `amount = questions per round`. |
| `category` | any of the 24 category IDs 9–32 (full list below) | Exactly one per request — matches "one category per round" naturally. |
| `difficulty` | `easy` \| `medium` \| `hard` | Set by host at game config; applies to the whole game (MVP) — not per round. |
| `type` | `multiple` \| `boolean` | Host chooses whether to allow multiple choice, true/false, or both (both = omit the param and handle either shape per-question). |
| `encoding` | *(omitted — see note)* | `encoding=base64` and `encoding=url3986` are both currently ignored by the live OpenTDB API (confirmed by hitting it directly — it silently falls back to plain/HTML-entity text either way), so requesting them would silently corrupt content if decoded as promised. The app requests the **default** (legacy HTML-entity) encoding, which does work, and decodes entities server-side with the `he` library before sending to clients. Worth re-checking periodically in case OpenTDB fixes this. |
| `token` | session token | Requested once per game, attached to every question request so the same question never repeats within a game. |

Category IDs (fetched dynamically from `/api_category.php` at startup, not hardcoded,
but listed here for reference):

```
9  General Knowledge          21 Sports
10 Entertainment: Books       22 Geography
11 Entertainment: Film        23 History
12 Entertainment: Music       24 Politics
13 Entertainment: Musicals &  25 Art
   Theatres                   26 Celebrities
14 Entertainment: Television  27 Animals
15 Entertainment: Video Games 28 Vehicles
16 Entertainment: Board Games 29 Entertainment: Comics
17 Science & Nature           30 Science: Gadgets
18 Science: Computers         31 Entertainment: Japanese
19 Science: Mathematics          Anime & Manga
20 Mythology                  32 Entertainment: Cartoon &
                                  Animations
```

**Response codes to handle:**

| Code | Meaning | Handling |
|---|---|---|
| 0 | Success | proceed |
| 1 | Not enough questions for that category/difficulty/amount | Retry with a different randomly-picked category from the same vote-offer set, or fall back to lowering `amount`; surfaced as a host-visible warning if it keeps happening. |
| 2 | Invalid parameter | Should never happen — bug if it does; log and abort round with an error state. |
| 3 | Token not found | Request a fresh token and retry once. |
| 4 | Token exhausted (all questions for that query already seen) | Reset the token (`command=reset`) and retry once. |
| 5 | Rate limited (>1 req/5s from this IP) | Queue + backoff — see below. |

**Rate limiting:** OpenTDB allows 1 request per 5 seconds per IP. All calls happen
server-side, so the backend keeps a simple outbound request queue (min. 5s spacing,
retry with backoff on code 5) — this comfortably covers "one call per round" usage
and also covers the category-count sanity checks in §4.

## 5. Roles & Screens

- **Host screen** (`/host`): game config form (pre-game) → lobby with joined players
  and a Start button → **shared/TV-style live view for the rest of the game**:
  category vote options with live tally → winning category → current question,
  answer options, and countdown (mirrors the player view) → reveal showing the
  correct answer and a **per-player list of who answered correctly/incorrectly**
  (name + points earned) → round summary/leaderboard, top 3 highlighted → final
  results. Pause/Resume control is available throughout.
- **Player screen** (`/play`): nickname entry → waiting-room ("waiting for host to
  start") → category vote → question + answer options + countdown → per-question
  reveal (correct answer, points earned, new rank) → round summary → final results.
  Fully self-contained — playable without ever looking at the host screen — but
  designed to work well alongside it if it's projected/cast for the group.

Both are Angular routes in the same app, served as static files by the Node backend
(single port, single origin — simplest LAN story: everyone browses to
`http://<host-lan-ip>:PORT`, host and players just pick a different link/route).
Host screen shows the LAN address (and a QR code encoding it) during setup so players
can join by scanning instead of typing an IP.

## 6. Game State Machine

```
LOBBY
  → (host sets config, players join with nickname)
  → host clicks "Start Game" (requires at least 2 connected players)

ROUND_LOOP (repeats for `rounds` configured):
  CATEGORY_VOTE
    → server picks 6 random categories (not yet used this game)
    → players vote (one vote each), timer or all-voted-early
    → tally; tie → random pick among tied
    → server fetches `questionsPerRound` questions for the winning
      category + configured difficulty/type via OpenTDB
  CATEGORY_RESULT
    → winning category + final tally held on screen for
      `categoryResultTimeSec` (host-configurable) before the round's
      first question starts, shown as a full-screen countdown
      transition (see §6a) on both host and player screens
  QUESTION_LOOP (repeats for `questionsPerRound` configured):
    QUESTION_ACTIVE
      → question + answers pushed to all players, timer starts
      → players submit answers (one each); all-answered ends the
        timer early
    REVEAL
      → correct answer shown (highlighted among the options on both
        host and player screens), points computed and applied,
        per-player result shown, leaderboard updated
      → countdown (`revealTimeSec`, host-configurable) to the next
        question, shown as a full-screen countdown transition (§6a)
        on both host and player screens
  ROUND_SUMMARY
    → round leaderboard shown, top 3 highlighted (reward hook,
      no-op for MVP)
    → countdown (`roundSummaryTimeSec`, host-configurable) to the
      next round, shown as a full-screen countdown transition (§6a)
      on both host and player screens

GAME_END
  → final leaderboard / winner shown

PAUSE (orthogonal — host can pause from CATEGORY_VOTE, CATEGORY_RESULT
or QUESTION_ACTIVE; freezes the timer; Resume continues exactly
where it left off)
```

## 6a. Full-Screen Countdown Transitions

The three "waiting" gaps in the state machine — `CATEGORY_RESULT`, `REVEAL`, and
`ROUND_SUMMARY` — each already have their normal screen (winning category + tally,
question reveal + leaderboard, round leaderboard) plus a host-configurable duration.
On top of that content, a full-screen overlay (`frontend/src/app/shared/
transition-overlay.ts`, `<app-transition-overlay>`) covers the entire viewport with a
large countdown number and a label ("Next question in" / "Next round in"), using the
same soft-rainbow gradient as the page background. It's purely presentational — driven
by the same `deadline`/`paused` values already broadcast for that phase, so it adds no
extra wait time and needs no backend changes beyond the phase/duration already existing
for that gap. Shown identically on host and player screens. The underlying results stay
in the DOM (a disconnect/reconnect during the overlay still resyncs correctly) — the
overlay is layered on top via `position: fixed`.

## 7. Scoring

Rank-based, not a continuous speed formula. Per question, correct answers are ordered
by submission time (fastest first); each gets one fewer point than the previous,
down to a floor of 1 point so every correct answer still scores something:

```
correctAnswerers = players who answered correctly, sorted by submission time asc
pointsForRank(rank) = max(10 - rank, 1)   // rank is 0-indexed: 0 = fastest
```

So the fastest correct player scores 10, the next 9, 8, 7, … down to 1, and every
correct answer after the 10th (i.e. 10+ players) also scores 1. Incorrect/unanswered
scores 0. `MAX_POINTS = 10` is a constant in `backend/src/game/scoring.ts` (not yet
host-configurable — candidate for later config exposure, same as the old max/floor
were).

Leaderboard = sum of points across all questions so far, sorted descending; ties keep
insertion/alphabetical order for MVP (no tiebreaker logic beyond that).

## 7a. Sound Cues (host only)

The host screen plays ambience/cue sounds to accompany the live/TV view; players never
hear any sound. Wired via `frontend/src/app/shared/sound-service.ts` (`SoundService`,
injected only in the host component) against placeholder `.mp3` files in
`frontend/public/sounds/` (see that folder's `README.md`) — silent stubs for now, real
audio files get dropped in later with no code changes needed. Because browsers block
autoplay before a user gesture, the host screen has a "Sound on/off" toggle (defaults
off, persisted to `localStorage`) that also unlocks playback.

| Cue | File | Plays during | Loops? |
|---|---|---|---|
| Lobby background | `lobby-background.mp3` | `LOBBY`, until the host starts the game | yes |
| Category vote countdown | `vote-countdown.mp3` | `CATEGORY_VOTE` | yes |
| Question background | `question-background.mp3` | `QUESTION_ACTIVE` | yes |
| Time almost over | `time-warning.mp3` | Last ~5s of `QUESTION_ACTIVE` | no (one-shot) |
| Between-question/round countdown | `countdown.mp3` | `REVEAL` and `ROUND_SUMMARY` | yes |

## 8. Players, Connections & Reconnection (MVP-minimal)

- A player is identified by `{ nickname, socketId }`. Nicknames must be unique in the
  lobby.
- **Before game start:** disconnect → player is removed from the lobby immediately.
- **After game start:** disconnect → player stays in the game (score preserved),
  marked `disconnected` on the host's live view; if they reload/reconnect and submit
  the *same nickname* before the game ends, they're re-attached to their existing
  score/session. No grace-period timers, no reconnect tokens for MVP — first
  come/simplest-thing-that-works.
- A disconnected player who doesn't come back is simply skipped for scoring purposes
  on remaining questions/votes (not counted in "all answered" early-finish check while
  disconnected).

## 9. Architecture & Project Structure

**Backend:** Node.js + TypeScript, Express (static file serving + a couple of REST
utility endpoints), Socket.IO for all real-time game events.

**Frontend:** Angular (TypeScript), one app with `host` and `play` route trees,
`socket.io-client` for the realtime connection.

```
backend/
  src/
    server.ts              # Express bootstrap, serves frontend build, starts Socket.IO
    game/
      GameSession.ts        # single in-memory session: state machine, players, scores
      scoring.ts             # points formula
      categoryVote.ts        # random category selection + tally
    opentdb/
      client.ts              # HTTP calls to opentdb.com, base64 decoding
      requestQueue.ts        # 1-req/5s throttling + retry/backoff on codes 1/3/4/5
    socket/
      events.ts               # shared event name + payload contracts (see §10)
      hostHandlers.ts
      playerHandlers.ts
  package.json / tsconfig.json

frontend/
  src/
    app/
      host/                  # config form, lobby, shared/TV live view (vote tally,
                              # question, per-player reveal), pause control, results
      play/                  # nickname entry, waiting room, vote, question, reveal
      shared/
        socket.service.ts
        models.ts             # mirrors backend's socket event contracts
        sound-service.ts       # host-only sound cue playback (see §7a)
        countdown.ts            # small inline countdown; `big` input for the overlay
        transition-overlay.ts   # full-screen countdown transition (see §6a)
  public/
    sounds/                    # placeholder mp3s for sound-service.ts (see §7a)
  angular.json / package.json / tsconfig.json
```

`events.ts`'s contracts should be the single source of truth for payload shapes;
since both ends are TypeScript, consider a small shared `types` package (or just
hand-copying types initially, upgrade to a shared workspace package if it gets
painful) so host and player payload shapes can't drift silently.

## 10. Socket.IO Event Contract (draft)

**Player → Server**

- `player:join { nickname }` → ack with `{ ok, playerId }` or `{ ok: false, reason }`
  (duplicate name, game already started, etc.)
- `player:vote { categoryId }`
- `player:answer { answerId, clientTimestamp }`

**Host → Server**

- `host:configure { rounds, questionsPerRound, difficulty, answerTypes, timeLimitSec, categoryResultTimeSec, revealTimeSec, roundSummaryTimeSec }`
- `host:startGame`
- `host:pause` / `host:resume`

**Server → All (broadcast)**

- `game:state { phase, ... }` — one general state-sync event per phase transition,
  payload shaped per phase (`LOBBY`, `CATEGORY_VOTE`, `CATEGORY_RESULT`,
  `QUESTION_ACTIVE`, `REVEAL`, `ROUND_SUMMARY`, `GAME_END`, plus a `paused: boolean`
  flag). `category:result` is cached and resent to late-(re)connecting clients just
  like the other per-phase snapshots, since `CATEGORY_RESULT` is now a held phase with
  its own duration rather than an instantaneous hop to the first question.
- `lobby:players { players[] }`
- `vote:update { tally }` — live vote counts per category, keyed so the host screen
  can render a running bar chart as votes come in (**required for D1**, not optional).
- `question:reveal { correctAnswerId, results: [{playerId, nickname, correct, points}], leaderboard }`
  — `nickname` included (not just `playerId`) since the host screen renders a
  per-player correct/incorrect list, not just IDs.
- `timer:tick { msRemaining }` (or client computes it from a `deadline` timestamp
  sent once — prefer this to avoid a tick-per-second broadcast storm; **recommended**
  approach: send `{ deadline }` once per phase and let each client run its own local
  countdown against server clock offset).

## 11. Host Game Configuration (MVP)

| Setting | Type | Notes |
|---|---|---|
| Rounds | integer | e.g. 1–10 |
| Questions per round | integer | e.g. 1–20 (capped at 50 by OpenTDB's per-request max) |
| Difficulty | easy / medium / hard | applies to the whole game |
| Answer types | multiple / boolean / both | if "both", question type is randomized or alternated per question |
| Time per question | seconds | e.g. 5–60 |
| Time on category result | seconds (`categoryResultTimeSec`) | countdown shown during `CATEGORY_RESULT`, e.g. 3–30 |
| Time until next question | seconds (`revealTimeSec`) | countdown shown during `REVEAL`, e.g. 3–30 |
| Time until next round | seconds (`roundSummaryTimeSec`) | countdown shown during `ROUND_SUMMARY`, e.g. 3–60 |

## 12. Implementation Phases

1. **Skeleton & networking** — Express + Socket.IO server, Angular app shell, host and
   player can connect, join lobby, see each other. No game logic yet.
2. **OpenTDB integration** — category fetch, request queue/throttling, question
   fetch + decode, error-code handling.
3. **Core game loop** — state machine, category vote, question/answer/reveal cycle,
   scoring, leaderboard, round/game progression.
4. **Host controls** — config form, start, pause/resume, live status view.
5. **Polish** — QR-code join, disconnect/reconnect handling, round-summary/top-3
   highlight UI (as a no-op reward hook), final results screen, basic styling.

## 13. Backlog / Post-MVP

- Rewards for top 3 at end of each round (actual effects — e.g. bonus points, power-ups).
- Session PIN / multiple concurrent games on one host.
- Sturdier reconnection (grace period, reconnect tokens, resume mid-question).
- Per-round difficulty/category-type overrides instead of whole-game settings.
- Dedicated shared "TV mode" display (Design Decision D1).
- Persist match history / stats across games.
- Internet play beyond LAN (would need auth, NAT traversal or a relay, etc.).
- Host-configurable scoring constants (`MAX_POINTS`, floor), alternate scoring modes.
