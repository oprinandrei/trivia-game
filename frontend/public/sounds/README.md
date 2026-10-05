# Sound cue placeholders

These files are empty placeholders wired up by `SoundService`
(`frontend/src/app/shared/sound-service.ts`). Drop real `.mp3` files in with
the **same filenames** to replace them — no code changes needed.

All cues are host-only; players never hear sound.

| File | Used when | Loops? |
|---|---|---|
| `lobby-background.mp3` | Lobby, before the host starts the game | yes |
| `question-background.mp3` | A question is active and players are answering | yes |
| `time-warning.mp3` | ~5s left on the question timer | no (one-shot) |
| `countdown.mp3` | Countdown after a reveal (next question) or after a round summary (next round) | yes |
| `vote-countdown.mp3` | Players are voting on the next category | yes |
