<div align="center">

# JSON Extractor

**Turn a raw voice-agent session dump into something you can actually read, check and paste into the sheet.**

[**Open the app**](https://json-organizer.vercel.app/) &nbsp;·&nbsp; [Testing build](https://json-organizer-git-features-test-ruis-projects-f3fb0117.vercel.app/)

</div>

---

## What it does

Drop in the JSON from a session and it gives you back an ordered timeline of everything that happened: what the user said, what the agent said, every tool call with its arguments and response, and every transfer between agents. No backend, no upload, nothing leaves your browser.

It also does the boring parts of the review for you:

| | |
|---|---|
| **Timeline** | Every event in true chronological order, colour-coded by agent, filterable, with tool arguments and responses expanded inline. |
| **Function & Transfer Summary** | The copy-paste block for your sheet. Mark each call correct or incorrect with the ✓ / ✗ and the summary updates itself. |
| **Transcript** | Clean speaker-by-speaker text, ready to copy. |
| **Flow Map** | Which agent held the call, for how long, and where it handed off. |
| **Scenario Check** `beta` | Pick the scenario you are rating and it diffs the calls the model actually made against the ones the guideline expects: matched, missing, extra, and who owned each one. |
| **Data Fixture** | The context the model was given (accounts, plans, features, technicians, outages, line diagnostics) as searchable tables. Click an argument in the timeline and it jumps to the row it refers to. |
| **Audio** | Record the call in the browser, or attach a file you captured yourself. Trim it on the waveform and download it as `.m4a` or `.mp3`, named to match the other exports. |

## Using it

1. **Pick the environment.** Prod Single Agent, Prod Multi Agent or Pre-Prod. This decides which tool structures the parser looks for, and you can override the keywords if a session uses different ones.
2. **Pick the scenario and gender.** Only needed for the Scenario Check. The list changes with the environment, since single and multi agent are numbered separately.
3. **Add the JSON.** Drop the file anywhere on the page, browse for it, or paste the raw text.
4. **Add the recording.** Optional, and optional in both directions: attach the `.mp4`/`.mov` here and it arrives on the next page already loaded, or skip it now and add it in the Audio panel later.
5. **Review, then Download All.** JSON, transcript and audio come out with matching names.

### Recording without OBS

The Audio panel has a **Record the call** button. It captures your microphone and the agent's voice at the same time, mixes them, and drops the result straight into the trimmer, so there is no separate capture app and no mp4 to convert.

Chrome will ask what to share. **Pick the tab the agent is playing in and turn the audio toggle on.** Without it you get a silent capture, and the app says so rather than recording nothing. The steps are spelled out next to the button.

While recording you get a timer, a live meter per channel, and a volume slider per channel that takes effect immediately, so a side that is too loud can be fixed during the call rather than after it. The meter reads after the slider, so it shows what is actually being recorded.

On macOS, only the **Chrome Tab** pane of the share dialog carries audio at all: Entire Screen and Window have no system audio to offer, which is why people reach for BlackHole or Loopback. On Windows, Entire Screen also works if you tick "share system audio". The in-app wording adapts to the platform.

Chrome and Edge only, since no other browser can capture tab audio. Elsewhere the button is replaced with a note and you carry on capturing the way you do now.

## Exports

```
Telco-AM-12-Clear-JSON-A.txt
Telco-AM-12-Clear-Transcript-A.txt
Telco-AM-12-Clear-Audio-A.m4a
```

Set the task number, clarity and agent letter once in the export panel and all three follow.

## Running it locally

```bash
npm install
npm run dev
```

| Command | |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the built output |
| `npm run lint` | oxlint |

## How it is built

React 19 + TypeScript on Vite, and that is about it. There is no server and no database, so nothing you load is ever sent anywhere.

The two interesting corners:

- **Parsing.** `src/utils/parser.ts` walks the JSON without assuming a fixed shape, since the dumps differ between environments. Timing is the fiddly part: transcript events carry `eventTime`, but tool calls are trace spans whose time lives in `startTime`, and missing that puts calls in the wrong order everywhere downstream.
- **Audio.** All in the browser. `AudioContext` decodes whatever the file is, `AudioEncoder` plus `mp4-muxer` writes the `.m4a`, and `lamejs` writes the `.mp3` because browsers have no native MP3 encoder. Encoding runs at download time, not before, so re-trimming can never hand you a stale clip.
- **Recording.** `src/utils/recorder.ts` joins `getUserMedia` (mic) and `getDisplayMedia` (tab) into one Web Audio graph and records the mix with `MediaRecorder`. The result is just a `File`, so it enters the same decode-and-trim path as an uploaded one. Two quirks worth knowing: Chrome only offers the audio checkbox when video is requested too, and stopping that unused video track would end the whole share, so it is kept alive and ignored.

```
src/
  components/   Dropzone, TimelineView, ScenarioCheck, ReferenceDataPanel, AudioTool
  utils/        parser.ts, referenceData.ts, audio.ts
  data/         scenarios.ts   expected tool calls per scenario
  index.css     all of the styling
```

## Scenario Check is in beta

The expected call lists in `src/data/scenarios.ts` were transcribed from the guideline and not every scenario has been verified against a real session yet. Treat a mismatch as a prompt to go look, not as a verdict. Found one that is wrong? DM me.

---

<div align="center">
<sub>Built for the Sunday Mobile telco reviews. Much love, Rui 💙</sub>
</div>
