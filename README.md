# NeuroDrive

A local-first neuroevolution playground: cars with randomly initialized brains learn to complete a track. Built with TypeScript, Vite, HTML Canvas, and a Web Worker. Simulation, training, and browser data stay on your machine.

![NeuroDrive: parallel tracks and selectable camera views](results/preview-parallel-runs.jpg)

No account, API key, `.env` file, backend, or database is required. After installing dependencies, the app can run without internet access. The interface and project documentation are in English.

## Contents

- [Quick start](#quick-start)
- [Makefile commands](#makefile-commands)
- [First run and controls](#first-run-and-controls)
- [Playground features](#playground-features)
- [How it works](#how-it-works)
- [Which metrics show improvement?](#which-metrics-show-improvement)
- [Reproducible comparison: fixed training vs. diversity](#reproducible-comparison-fixed-training-vs-diversity)
- [Validation and earlier fixed-scenario experiments](#validation-and-earlier-fixed-scenario-experiments)
- [Local data and credentials](#local-data-and-credentials)
- [Troubleshooting](#troubleshooting)
- [Project structure and limitations](#project-structure-and-limitations)

## Quick start

### Requirements

- **Node.js 22.12 or newer**, with npm. This project has been verified with Node.js **22.22.2** and npm **10.9.7**.
- **Git**, to clone the repository.
- **Make**, for the shortcuts below. Verified with GNU Make **3.81**. An npm-only alternative is also available.
- A browser with JavaScript modules, Canvas, and Web Worker support. Manual driving requires a keyboard.

### With Make

```sh
git clone https://github.com/willianmrs/neuro-drive.git
cd neuro-drive
make dev
```

On the first run, `make dev` installs dependencies with `npm ci`, using `package-lock.json`, and starts Vite. Subsequent runs reuse the installation while `package.json` and `package-lock.json` are no newer than the installation lockfile.

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Stop the server with **Ctrl+C** in the terminal. If the port is occupied, choose another one:

```sh
make dev PORT=5174
```

Then open [http://127.0.0.1:5174](http://127.0.0.1:5174). The Make shortcuts use `--strictPort`: an occupied port produces an error instead of silently switching to another port.

### Without Make

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. This alternative also works on Windows with Node.js and npm installed. The Makefile uses a POSIX-compatible shell, available on macOS, Linux, and environments such as WSL.

### Preview the production build

```sh
make preview
```

This checks TypeScript, builds the app into `dist/`, and serves it at [http://127.0.0.1:4173](http://127.0.0.1:4173). Use `make preview PREVIEW_PORT=4174` to change the port. With npm:

```sh
npm run build
npm run preview
```

Preview is intended for checking the local build. Use an HTTP server; opening `index.html` directly does not load the modules and worker. `dist/` contains the generated static files, including the worker.

## Makefile commands

Run `make` or `make help` to list the shortcuts. Commands that run the project install dependencies automatically when needed.

| Command | Result |
| --- | --- |
| `make dev` or `make run` | Starts the development server with automatic reloading. |
| `make install` | Reinstalls the exact dependencies from the lockfile with `npm ci`. |
| `make test` | Runs the simulator, evolution, and metrics tests. |
| `make build` | Checks TypeScript and builds the app into `dist/`. |
| `make check` | Runs tests and the build. |
| `make preview` | Builds the app and serves the compiled version locally. |
| `make experiment` | Runs headless training in a fixed scenario. |
| `make compare` | Compares fixed and diverse training with the same episode budget. |
| `make clean` | Removes only `dist/`, preserving dependencies and experiment results. |

### Customize experiments

```sh
# One seed, one lap, ten generations on the Oval without obstacles.
make experiment GENERATIONS=10 SEEDS=42 TRACK=oval LAYERS=12 LAPS=1 LAYOUT=clear

# Switchback with two hidden layers and barriers.
make experiment GENERATIONS=10 SEEDS=2026 TRACK=technical LAYERS=12,8 LAPS=3 LAYOUT=barriers

# A short comparison of fixed and diverse training.
make compare DIVERSITY_GENERATIONS=6 SEEDS=42 POPULATION=40
```

| Variable | Default | Used by |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | `dev`, `run`, `preview`. |
| `PORT` | `5173` | `dev`, `run`. |
| `PREVIEW_PORT` | `4173` | `preview`. |
| `GENERATIONS` | `40` | `experiment`. |
| `SEEDS` | `neurodrive,42,2026` | `experiment`, `compare`; a comma-separated list. |
| `TRACK` | `oval` | `experiment`; accepts `oval` or `technical`. |
| `LAYERS` | `12` | `experiment`; comma-separated hidden-layer neuron counts. |
| `LAPS` | `3` | `experiment`; from 1 to 10 laps. |
| `LAYOUT` | `barriers` | `experiment`; accepts `clear` or `barriers`. |
| `DIVERSITY_GENERATIONS` | `24` | `compare`; the fixed method runs four times this many generations. |
| `POPULATION` | `40` | `compare`; from 20 to 300 cars. The fixed-scenario `experiment` command uses a population of 100. |
| `NPM` | `npm` | An alternative path to the npm executable. |

Experiments write to `results/` and may overwrite JSON files for the same configuration, as well as consolidated reports. Copy any results you want to preserve before repeating an experiment. `make compare` uses **one lap per episode**, regardless of `LAPS`, and does not affect an open browser session. These commands run in the terminal and may take some time.

## First run and controls

1. Start the app with `make dev`. Training begins in **Evolution lab**, with 100 networks, three laps per attempt, and four simultaneous tracks per generation. Every network has a copy of its car on each track.
2. Click a thumbnail under **Pick a run. Stay on track.** to choose the main view. The camera stays on that track across laps and generations. Select **8×** or **32×** to advance more simulation ticks. Crashes in early generations are expected: initial weights are random.
3. Watch **More drivers making it home** and **Drive beyond one layout**. In diverse mode, wait for the entire scenario battery to finish before comparing generations.
4. Save the best brain in the **Champion** panel and export its JSON to move the model to another browser.
5. Import a trained example such as [`results/transfer-diverse-2026.json`](results/transfer-diverse-2026.json). Examples are not loaded automatically. Use **Replay original** to reproduce a source scenario, or **Test current environment** to test the open layout with the same weights.
6. Use **Edit obstacles** to add, drag, or rotate barriers and evaluate transfer. In diverse mode, the editor changes the open test environment while the training battery stays fixed.
7. Select **Take the wheel**, click the track to focus the keyboard, and drive with the same physics used by the neural-network cars.

| Control | Action |
| --- | --- |
| W / ↑ | Accelerate in manual mode. |
| S / ↓ | Brake, then reverse. |
| A / ← and D / → | Steer left and right. |
| Space | Pause or resume when focus is outside a form field or control. |
| R | Restart the manual attempt or frozen test while the track has focus. |
| R / Shift+R in the editor | Rotate the selected obstacle by +15° / −15° while the track has focus. |
| Delete / Backspace in the editor | Remove the selected obstacle when not typing in a field. |
| Esc in the editor | Cancel editing. |

The **lime-green car** is the current population leader. The **purple car** is the saved champion's ghost, replaying frozen weights when enabled and available in that mode. It does not participate in the current population's selection. Cars do not collide with one another.

## Playground features

### Training and parallel runs

**Evolution lab** starts with 100 random controllers and, by default, four scenarios running simultaneously per generation. Thumbnails show every track, active cars, finishes, and mean progress. Click one to choose the main view. The selected camera stays fixed across laps and generations. A completed run remains in **WAITING** until the other runs finish.

Pause, reset, or speed up training to 4×, 8×, or 32×. Speed changes execute more fixed 1/60-second ticks.

**Take the wheel** supports WASD or arrow keys. W/↑ accelerates, S/↓ brakes and allows reverse, and A/D or ←/→ steer. Space pauses and R restarts the run. Click the track to focus the keyboard. Training is paused during manual driving.

### Network architecture and evolution settings

In **A very small brain**, add or remove hidden layers and edit their neuron counts. Limits are **1–4 hidden layers, with 1–24 neurons per layer**. Press Enter or briefly stop editing to apply a change. Changing the architecture resets the population using the current seed. Inputs (8) and outputs (2) stay fixed. The default is **8 → 12 → 2**, with 134 weights and biases.

Under **Evolution settings**, **Laps per attempt** sets **1–10 laps**, with **3 by default**. Population and mutation changes also take effect in the next generation. When the lap target changes, brains continue evolving while scores and history restart for the new target. Applying a seed restarts training reproducibly.

### Champions, import, and replay

Save the best brain in browser storage, load it, export or import JSON, or race its purple ghost. Each champion preserves its original architecture and lap target. Manual racing against a champion uses that target; without a champion, it uses the active training target.

Imports validate the format version, architecture, physics, parameter counts and bounds, and metadata. The file-size limit is **250 KB**.

- Version 1 files remain compatible. Versions 1 and 2 are migrated to one-lap runs.
- New exports use **version 6**, storing the architecture, target, weights, times, exact scenario conditions, and aggregate evaluation. They may include a completed reserved-set evaluation for the same weights.
- Versions 4 and 5 retain their saved obstacles and original behavior.
- Versions 1–3 remain compatible with their original obstacle-free tracks.

**Replay original** restores the source scenario chosen in the selector and replays frozen weights. **Test current environment** preserves the open track and layout and tests the same weights without further training. Importing a brain also preserves the open environment; restoring a source scenario is an explicit replay action. Legacy champions remain available for testing and replay without inventing missing aggregate evaluations.

**Test other track** opens the other track and runs the saved brain with frozen weights. In diverse mode, changing the test environment does not change the training battery. Training pauses during frozen tests and manual driving.

### Obstacle editor

**Edit obstacles** supports five shapes: striped barriers, circles, triangles, square blocks, and long barriers. An editable layout supports up to **24 obstacles** and starts with three barriers per base track.

Choose **New shape**, click **+ Add obstacle**, then click the asphalt to place it. Drag to move an obstacle while preserving its orientation. Select an obstacle and use **↶ / ↷** to rotate in 15° steps, or use the **Angle** slider or numeric field to set 0–359°. With the track focused, R rotates +15° and Shift+R rotates −15°. **Remove selected** or Delete removes the selection. **Clear all** clears the draft; **Cancel** or Esc discards the edit.

**Apply & resume** applies the layout to the transfer environment. In diverse training, the battery, scores, and population stay unchanged. In fixed mode, attempts and scores restart with the same brains. Base-track edits are saved in browser storage. An original replay with custom geometry or a particular starting position is a temporary session environment.

Training pauses during editing. If it was already paused, it remains paused after applying the layout. The starting area is protected, and obstacles must fit on the asphalt. Both sensors and oriented collision checks detect obstacles.

### Inspecting weights

**Every connection has a weight** displays each layer's weight and bias matrices. Choose the best training result, one of the current generation's top three drivers, or the saved champion.

Blue means positive and orange means negative. Color intensity shows magnitude relative to the largest parameter in that network. A sign does not indicate whether a weight is good or bad. Rows receive signals from columns.

Click a neuron's name to inspect its weighted sum and `tanh` output. Current leaders use inputs from their latest real decision. Stored results display parameters without inventing activations. **Freeze view** captures the brain and inputs for inspection without pausing the simulation. A new training initialization releases the frozen inspection. In diverse mode, editing the open environment does not change the training-battery comparison.

### Population metrics

**More drivers making it home** tracks the entire population through completion rate, median total time among finishers, mean progress, and collisions. It uses the last completed generation by default. **Current generation** shows provisional results and the number of cars still active.

The funnel includes reaching 5% of the first lap and completing each lap. The chart and history retain up to 240 generations; the table displays the latest 10.

## How it works

Seven raycasts across a forward-facing 180° field and normalized speed feed a `tanh` feedforward network with two outputs: steering and throttle/braking.

### One decision per simulation tick

Each car has its own copy of the weights. Every **1/60 of a simulated second**, the simulator reads sensors, executes the network, and applies its two actions to the physics. Decisions occur once per tick, independently of the display frame rate. Faster training executes more ticks. Collision substeps keep the action selected for that tick.

| Signal | Values and meaning |
| --- | --- |
| Inputs 1–7 | Normalized distance to a boundary or obstacle at −90°, −60°, −30°, 0°, +30°, +60°, and +90° relative to the car. `0` indicates contact; `1` means no intersection within the 215-unit range. |
| Input 8 | Speed divided by maximum speed, clamped to `[-1, 1]`; negative while reversing. |
| Output 1 | Continuous steering: `−1` left, `0` straight, `+1` right. |
| Output 2 | Continuous throttle/braking: `+1` accelerates; negative values brake forward motion and allow reverse. |

The network receives no track position, checkpoints, lap count, score, or ideal trajectory. It has no recurrent memory. Position, orientation, clocks, and checkpoints belong to the simulator and evaluator, rather than the controller's inputs.

### What changes between generations

Weights remain **fixed throughout each attempt**. There is no backpropagation update after a collision and no teacher providing the correct steering direction. Improvement comes from selecting better-performing controllers and mutating their descendants.

After evaluation, approximately **4% of the population, with a minimum of two cars**, survives without mutation. Parents for the remaining cars come from the **top 25%**: a tournament samples three positions within that group and chooses the best. Each descendant copies one parent. Every parameter may receive Gaussian noise according to the configured mutation probability and strength. Weights and biases are clamped to `[-6, 6]`. There is no two-parent crossover. Defaults are **14% mutation probability per parameter** and **0.30 strength**.

There is no explicit reward for staying in the center of the track. The objective considers valid progress, finishes, and time. Avoiding boundaries can emerge as useful behavior, but the center is neither a required line nor necessarily the fastest path.

### Scenarios, ranking, and generalization

Runs advance simultaneously in simulation time and are interleaved within a single Web Worker. This keeps training calculations off the interface thread. It does not create a worker per track or promise multicore execution. With 100 networks and four scenarios, a generation contains 400 car × scenario episodes. The cost of a tick grows with the number of tracks, cars, and neurons.

In **Diverse scenarios** mode, each genome faces the complete battery of **4–6 scenarios in parallel**. Each track has an independent copy of every car, sharing genome values but maintaining its own physical state. All scenarios advance one 1/60-second step per tick. Ended cars preserve their results while the others continue. Each car attempts the entire lap target on its own track. Tracks stay fixed across generations, and selection waits until every car on every track has ended. The next generation restarts all tracks together with the new genomes.

Ranking compares, in order: the fraction of scenarios completed, mean normalized progress, worst-scenario progress, and mean time per distance among finishes. Partial progress remains useful before the first complete runs. Tournament parents, elites, and the champion all use this ranking. **Diverse mode has no individual-lap bonus.** **Fixed current environment** retains the original algorithm and fastest-lap bonus for comparison.

Batteries stay fixed so a record is never compared with a different battery. A canonical key includes every physical condition and the lap target; the comparator rejects different keys. Changing the protocol, scenario count, or diversity level starts a fresh population and comparison. Changing the lap target waits for the battery boundary, preserves descendants, and clears records for the new target. Scenario generation uses a separate random stream from evolution.

The training set includes both tracks, both directions, varied obstacle positions and orientations, and small starting-position perturbations. The first two moderate scenarios have no obstacles to retain an initial learning signal. **Wider** adds obstacles, geometry variations, and larger perturbations. Every generated layout undergoes placement checks and a closed-corridor search using the oriented car and swept collision checks. This accounts for obstacles that jointly block a passage. It is a conservative geometric-clearance check, not proof of dynamic controllability. Freely edited transfer layouts may block the track.

The **six reserved scenarios** use a separate random stream, new layouts, different starts, and small geometry changes. The champion is evaluated with frozen weights without changing parents, mutations, or evolution's RNG. The worker schedules this evaluation separately. The interface identifies the evaluated model's generation, source (training or saved champion), and lap target. If a newer champion appears during testing, the previous result remains labeled and the newer candidate waits its turn. A manually requested saved-champion test remains identified as such until the protocol is restarted.

The thumbnail panel shows every training run and lets you choose a camera without changing weights, clocks, seed, ranking, metrics, or pause state. The selected track remains selected across generations. **Drive beyond one layout** shows the observed run, the number of finished tracks, aggregate evaluation, and per-scenario reserved results. In diverse mode, generation metrics use **car × scenario episodes** as their denominator and do not combine raw times from different tracks. They also report how many drivers completed the entire battery. Normalized times are expressed as seconds per 1,000 track units, for completed attempts only.

### Physics and valid progress

The arcade physics model does not include tire slip or traction loss. It uses a fixed 60 Hz step, drag, braking, bounded speed, and steering proportional to movement. Collision uses an oriented rectangle and substeps of at most 3 units or 0.04 radians. Cars collide with boundaries and barriers, but not with each other. Training and manual mode call the same `stepCar` function.

Sixteen directional checkpoints must be crossed in order. Only the current checkpoint interval can award progress, with an upper bound; the greatest valid progress is preserved. Reversing, oscillating, and spinning cannot repeatedly earn the same progress. Each lap must repeat all 16 checkpoints in order. Cars cross the finish line while retaining position, speed, and heading. Progress accumulates as absolute distance until the lap target is complete.

A collision, 4.5 simulated seconds without progress, or a total budget of 34 simulated seconds per target lap ends the attempt. Completing the target ends successfully; lower total times break ties among completed runs. The interface shows the current lap, best individual lap, and best total time separately. The best brain is preserved independently of the current generation.

## Which metrics show improvement?

In fixed mode, the main metric is **cars that completed every target lap ÷ evaluated population**. In diverse mode, watch the champion's scenario-completion fraction, the number of drivers completing the entire battery, and reserved-scenario success. The population panel reports the completion rate of car × scenario episodes. A higher rate shows useful behavior appearing in more networks.

Then compare the **median total time among finishers** together with completion rate. A lower median with almost nobody finishing can be misleading. Before any car finishes, watch mean progress across all cars and falling collision rates. A single champion provides more limited evidence than the whole population.

Rates always use the population actually evaluated in that generation, even if the population setting changes for the next generation. Progress is valid distance divided by the target's total distance. Progress spread is the population standard deviation, shown in percentage points. Weight diversity is the square root of the mean population variance of each parameter, including biases. Lower diversity means more similar weights without guaranteeing better behavior. Once ten generations are complete, the trend compares average completion rates from the latest five completed generations with the preceding five.

In fixed mode, compare the same track, layout, and target. In diverse mode, compare the same battery and target; changing only the open transfer environment preserves that history. Architecture, seed, or protocol changes reset the population. Training metrics describe performance on the evaluated conditions and do not replace testing the champion in other scenarios.

## Reproducible comparison: fixed training vs. diversity

```sh
node --import tsx scripts/compare-diversity.ts 24 neurodrive,42,2026 40
```

The methods use the same initial seeds, an 8 → 12 → 2 network, a population of 40, 14% mutation probability, 0.30 strength, and **one lap per episode**. Each method receives **3,840 training episodes per seed**: fixed training for 96 generations or four diverse scenarios for 24 generations.

Fixed training uses only the original clear Oval. Diverse training uses the moderate battery. After training, both are evaluated on the same four diverse training scenarios and the same six reserved scenarios for that seed. These evaluations do not choose the fixed method's champion; reserved evaluations never influence diverse selection either. These are three paired comparisons, not 18 independent base circuits.

| Seed | Native training: fixed / diverse | Shared battery: fixed / diverse | Reserved: fixed / diverse | Mean reserved progress: fixed / diverse | Local training time: fixed / diverse |
| --- | --- | --- | --- | --- | --- |
| neurodrive | 1/1 · 3/4 | 0/4 · 3/4 | 0/6 · 5/6 | 7.0% · 93.2% | 8.75 s · 12.55 s |
| 42 | 1/1 · 4/4 | 1/4 · 4/4 | 0/6 · 4/6 | 10.5% · 88.5% | 9.12 s · 13.16 s |
| 2026 | 1/1 · 4/4 | 1/4 · 4/4 | 0/6 · 5/6 | 8.4% · 92.4% | 8.93 s · 16.14 s |

Total reserved success increased from **0/18 to 14/18 (77.8%)**; mean progress increased from **8.6% to 91.4%**. Each diverse champion's worst scenario reached **54.6%–58.9%**, with failures still present. Diverse training used approximately **56% more local time** and **61% more physical car steps** with the same episode budget, mainly because cars survived longer.

Timing depends on the machine and load; these measurements are not an isolated benchmark. The application's automatic reserved evaluations have an additional cost that is not included in these headless training times.

The table's timings were recorded before simultaneous track execution, when scenarios were scheduled sequentially. They are historical records and do not measure the current interface's performance. The scheduling change retains fixed weights during each attempt and aggregate selection at the battery boundary.

The experiment was repeated after fixing the canonical serialization key, producing identical per-scenario results. All six exported champions passed validation. Complete results, scenario conditions, timings, physical-step counts, and history are in `results/compare-diversity.json`. Champions are stored as `results/transfer-{fixed,diverse}-{seed}.json`.

The evidence covers only three seeds, six reserved scenarios per seed, and variations of two track families with geometric clearance and moderate diversity. In the browser, the `2026` champion that completed 5/6 reserved scenarios was also tested on an existing freely edited eight-obstacle layout: it collided at 12.7% of the lap. Its 134 exported weights and biases remained identical afterward. This demonstrates a failure outside the obstacle density used by the battery.

The results do not establish success on arbitrary circuits, narrow tracks, large perturbations, or layouts that block passage. This experiment uses one lap. The application still supports targets of 1–10 laps, but these measurements do not describe those other targets.

## Validation and earlier fixed-scenario experiments

```sh
npm test
npm run build
npm run experiment -- 40 neurodrive,42,2026 oval 12 1
npm run experiment -- 60 2026 technical 12 1
npm run experiment -- 40 2026 oval 12,8 1
npm run experiment -- 25 neurodrive,42,2026 oval 12 3
node --import tsx scripts/generalization.ts
node --import tsx scripts/replay-multilap.ts
npm run experiment -- 40 neurodrive,42,2026 oval 12 3 barriers
node --import tsx scripts/replay-multilap.ts barriers
```

The `experiment` arguments are: generation count, comma-separated seeds, track, hidden-layer sizes, lap target, and layout (`clear` or `barriers`). The default target is three laps. New results use the `-fastlap` suffix, record the selection policy, and distinguish lap targets and obstacle layouts (`-barriers`) to preserve earlier one-lap experiments.

JSON files in `results/` record seeds, settings, architectures, generation history, outcomes, and exportable champions. These legacy commands evaluate a fixed environment. Training starts with random weights; experiment champions enter the browser app only through explicit import.

Experiment settings: population 100, 14% mutation probability, and 0.30 strength. The table records the original experiments with a **one-lap target**, using simulated time:

| Track / network | Seed | Generations | Finishers in generation 1 → final | Mean progress in generation 1 → final | Best lap |
| --- | --- | ---: | ---: | ---: | ---: |
| Oval / 8–12–2 | neurodrive | 40 | 2 → 55 | 7.2% → 59.3% | 7.98 s |
| Oval / 8–12–2 | 42 | 40 | 1 → 60 | 5.9% → 64.1% | 7.98 s |
| Oval / 8–12–2 | 2026 | 40 | 0 → 49 | 3.4% → 53.3% | 8.00 s |
| Switchback / 8–12–2 | 2026 | 60 | 0 → 64 | 3.3% → 68.2% | 10.10 s |
| Oval / 8–12–8–2 | 2026 | 40 | 2 → 66 | 6.5% → 69.4% | 7.97 s |

In the original one-lap experiments, seed `2026` first completed the Oval in generation 3 and Switchback in generation 12. The Oval is wide: some random populations already produce complete laps in their first generation. Improvement also appears in lap time and the proportion of finishers.

All three Oval champions reproduced their exported times exactly when loaded into the same simulator. Transferred to Switchback without further training, they reached only **4.1%–8.1%**, all ending in collisions. Learning one track did not guarantee generalization.

With a **three-lap target**, after 25 generations on the Oval, seeds `neurodrive`, `42`, and `2026` completed runs in **21.95 s**, **21.90 s**, and **22.00 s**, respectively. In generation 25, **60/100**, **58/100**, and **56/100** cars completed all three laps. Complete results are in `results/experiments-laps3.json`. Version 3 champions retain their targets and can be replayed with `scripts/replay-multilap.ts`. All three reproduced their exported times exactly and also completed ten continuous laps in 70.63–70.92 seconds without repositioning between laps.

With the **three default barriers** and fastest-lap bonus, after 40 generations, seeds `neurodrive`, `42`, and `2026` completed three laps in **22.13 s**, **22.08 s**, and **22.12 s**. In the final generation, **48/100**, **56/100**, and **37/100** cars completed the full target. History, exact layouts, and champions are in `results/experiments-laps3-fastlap-barriers.json` and its associated files.

### Automated and browser checks

**46 automated tests** cover:

- Ray intersections, oriented collisions, movement, directional checkpoints, protection against repeated progress, continuous multi-lap motion, finish-line repetition, multi-lap ranking, proportional timeouts, and lap-target changes at generation boundaries.
- Network outputs, mutation, unchanged elites, determinism, configurable architectures and their limits, fastest-lap bonuses, parameter ordering, and weight/bias inspection.
- Obstacle sensors and collisions for five rotated shapes, invalid placements, geometry rebuilding after edits, preservation of brains when applying layouts, shape serialization, and version 4 migration.
- Champion serialization and migration, completion rates, medians, diversity, and denominators based on the population actually evaluated.
- Equal scenarios across genomes, fresh physical states, battery completion before selection, aggregate ranking, rejection of cross-battery comparisons, reserved-set and RNG isolation, frozen weights, transfer-layout preservation, and aggregate serialization.
- Simultaneous progress, independent run states, out-of-order completion, camera persistence across generations, isolation of camera selection from evolution, and population changes across all runs.

The build also checks TypeScript. Browser verification during development covered accelerated training, pause/resume, queued settings, manual driving, keyboard controls, track switching, sensors, leader views, browser storage, JSON import/export, invalid JSON rejection, architecture controls, multi-lap targets, and continuous runs.

Editor checks covered adding, dragging, removing, clearing, canceling, rejecting invalid positions, creating all five shapes, and rotation. Inspector checks covered brain sources, neuron calculations, and frozen inspection. Additional checks covered importing an aggregate champion, preserving eight open-layout obstacles during transfer, explicitly replaying a legacy four-obstacle scenario, evaluating a saved champion on the reserved set, parallel views with four and six runs, and keeping a selected camera across generations. Earlier layout checks included a 390 px viewport without horizontal page scrolling.

## Local data and credentials

The app uses no API keys or authentication. Training and inference run in the browser; experiment scripts run in Node.js. There is no telemetry or model upload to a remote service. Initial dependency installation contacts the npm package registry. Development and preview servers listen locally by default.

Saved champions and layouts use `localStorage`. Storage is separated by browser origin, including host and port: `localhost:5173`, `127.0.0.1:5173`, and `127.0.0.1:5174` have separate storage. Session history and the current population stay in memory and are lost on reload. Export a champion as JSON before clearing browser data or changing origins.

A review with **Gitleaks 8.30.1** found no credentials in Git history or the files prepared for publication. `.gitignore` excludes `.env`, local `.env` variants, `.npmrc`, private-key/certificate files, dependencies, and builds. No `.env` file is needed to run the project. Variables prefixed with `VITE_` may be included in the JavaScript sent to the browser and must not contain private credentials.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| `make: command not found` | Use `npm ci` and `npm run dev`, or provide Make in a POSIX-compatible shell. |
| Incompatible Node.js version or missing npm | Check `node --version` and `npm --version`; use Node.js 22.12+ with npm. |
| Missing dependencies or a damaged installation | Run `make install` or `npm ci`. The lockfile is included in the repository. |
| Port already in use | Use `make dev PORT=5174` or `make preview PREVIEW_PORT=4174`, then open the new URL. |
| Page opened through `file://` or worker fails to start | Start the HTTP server with `make dev` instead of opening the HTML directly. Check the browser console for errors. |
| Keyboard controls do not move the car | Select **Take the wheel** and click the track. Form fields retain focus for editing. |
| Saved champion appears to be missing | Check the browser host, port, and profile. Reimport the JSON if you changed origins or cleared browser data. |
| Training cannot reach 32× | Reduce population, layer count, neurons, or speed. Throughput depends on the machine; the physics step stays fixed. |
| Cars still crash frequently | Compare completed generations on the same battery, watch progress and finishes, and test the champion on reserved scenarios. A freely edited layout may block the track. |

## Project structure and limitations

| Path | Responsibility |
| --- | --- |
| `index.html`, `src/style.css` | Interface structure and appearance. |
| `src/main.ts` | Events, persistence, manual and frozen modes, and worker communication. |
| `src/protocol.ts` | Message and snapshot types shared by the interface and worker. |
| `src/training.worker.ts` | Schedules training and reserved-test ticks and sends snapshots. |
| `src/core/network.ts` | Network architecture, inference, parameters, and mutation. |
| `src/core/simulation.ts` | Sensors, actions, physics, collisions, checkpoints, and attempt scoring. |
| `src/core/evolution.ts`, `src/core/diverse-evolution.ts` | Population, ranking, selection, and new generations. |
| `src/core/scenarios.ts`, `src/core/evaluation.ts` | Reproducible batteries and aggregate/frozen evaluation. |
| `src/core/track.ts`, `src/core/obstacles.ts` | Track geometry, sensors, and obstacle shapes. |
| `src/core/metrics.ts`, `src/core/serialization.ts`, `src/core/transfer.ts` | Metrics, validated JSON, and champion transfer. |
| `src/ui/` | Rendering, the obstacle editor, weight matrices, and metrics panels. |
| `tests/` | Core tests executed by the Node.js test runner. |
| `scripts/` | Headless experiments and champion replay. |
| `results/` | Champion JSON, measured results, and interface screenshots. |
| `Makefile` | Installation, development, validation, and experiment shortcuts. |

The core in `src/core/` does not depend on the DOM. The browser, worker, tests, and terminal experiments use the same physics and rules.

Training speed is a target and may fall below 32× with large populations or networks while retaining the same physics. Larger networks do not guarantee better learning. Visual history retains the latest 240 generations; training sessions do not resume after a page reload. Champions are stored by track and browser origin (host/port); export JSON to move them elsewhere.

Small numerical differences between JavaScript engines may affect long evolutionary runs. More laps select for controllers that remain consistent over a circuit without guaranteeing a mathematically optimal trajectory. Physics is arcade-style, with boundaries and five obstacle shapes that stay fixed during each attempt. Freely edited layouts can block passage and are not automatically guaranteed to be solvable. Manual driving requires a keyboard.
