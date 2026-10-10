# ProxiSpeak — Geospatial Proximity Audio Ecosystem

A virtual office where **proximity is the volume knob**. You see a 2D overhead map, you move
your avatar, and the moment you walk inside somebody's earshot circle a WebRTC audio connection
opens and crossfades in; walk away and it closes. Walls between you muffle the voice.

* **Backend** — Node.js, Express, Socket.io, MongoDB (`$near` / `$geoWithin` / `$geoNear`,
  `2dsphere`), Redis Pub/Sub (`@socket.io/redis-adapter` + a domain-event channel).
* **Frontend** — React, HTML5 Canvas API, WebRTC (`getUserMedia`), Web Audio API.
* No other libraries. No TURN. No UI kit, no state-management library, no extra database.

---

## 1. Folder tree

```
ProxiSpeak-Geospatial-Proximity-Audio-Ecosystem/
├── .env.example                  # every tunable, documented
├── docker-compose.yml            # optional MongoDB + Redis
├── README.md
│
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js              # boot: config -> mongo -> redis -> http -> sockets
│   │   ├── app.js                # Express API (health, rooms, stats, spatial audit)
│   │   ├── runtime.js            # background timers (flush, reconcile, sweep, clusters)
│   │   ├── config/index.js       # all env parsing + defaults
│   │   ├── db/
│   │   │   ├── mongo.js          # mongoose lifecycle
│   │   │   └── redis.js          # Pub/Sub bus + socket.io redis adapter
│   │   ├── models/
│   │   │   ├── UserPresence.js   # avatar + 2dsphere GeoJSON point
│   │   │   ├── Room.js           # layout + furniture obstacles (Week 4)
│   │   │   └── SpatialAudit.js   # persisted audit history
│   │   ├── services/
│   │   │   ├── index.js          # service container (injectable)
│   │   │   ├── geospatialService.js  # $near / $geoWithin / $geoNear + explain
│   │   │   ├── presenceStore.js  # hot in-memory table + batched Mongo writes
│   │   │   ├── peerGraph.js      # WebRTC mesh diffing, generations, dedupe
│   │   │   ├── obstacleService.js# line-of-sight occlusion + collision resolution
│   │   │   ├── roomService.js    # room persistence, defaults, spawn points
│   │   │   └── auditService.js   # Spatial Audit (accuracy + index + budget)
│   │   ├── sockets/
│   │   │   ├── index.js          # socket.io wiring, handlers, rate limits
│   │   │   └── validation.js     # payload validation for every event
│   │   └── utils/
│   │       ├── geo.js            # pixel <-> GeoJSON tangent-plane transform
│   │       ├── validate.js       # shared validators
│   │       ├── errors.js         # typed errors (Validation/NotFound/RateLimit)
│   │       ├── rateLimiter.js    # token bucket
│   │       └── logger.js         # levelled logger
│   ├── scripts/
│   │   ├── seed.js               # rooms + 2dsphere index + synthetic avatars
│   │   ├── spatial-audit.js      # audit CLI / HTTP client
│   │   └── loadtest.js           # 50+ concurrent clients
│   └── test/                     # node:test — 43 tests incl. socket integration
│
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── .env.example
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── config.js
    │   ├── styles.css
    │   ├── audio/
    │   │   ├── spatialMath.js        # gain / pan / lowpass maths (pure)
    │   │   ├── SpatialAudioEngine.js # MediaStreamSource -> Filter -> Gain -> Panner
    │   │   └── occlusion.js          # client mirror of wall attenuation
    │   ├── webrtc/PeerManager.js      # offer/answer/ICE, generations, ICE restart
    │   ├── socket/socketClient.js    # connection + reconnect + typed event bus
    │   ├── state/ProxiContext.jsx    # hot refs (worldRef) + structural React state
    │   ├── hooks/
    │   │   ├── useAnimationFrame.js  # the single rAF loop (delta-time)
    │   │   ├── useKeyboardMovement.js
    │   │   ├── usePointerToWorld.js
    │   │   └── useUiTick.js
    │   ├── canvas/
    │   │   ├── WorldCanvas.jsx       # static layer + dynamic layer
    │   │   ├── officeLayout.js       # static painting + shared view transform
    │   │   ├── draw.js               # avatars, audio links, clusters
    │   │   └── physics.js            # acceleration, friction, collision
    │   └── components/
    │       ├── MicGate.jsx           # join form + permission-denied UX
    │       ├── StatusBar.jsx         # connection, instance, FPS, mute/volume
    │       ├── PeerList.jsx          # live distance / gain / pan / occlusion
    │       ├── AuditPanel.jsx        # spatial audit + mesh stats
    │       ├── SoundLegend.jsx
    │       └── Notices.jsx
    └── test/spatialAudio.test.js      # 13 tests for the audio maths
```

---

## 2. How it works

### Geospatial engine (the 100 px circle is a real MongoDB query)

The office is a flat pixel plane; MongoDB only understands GeoJSON. The server maps the plane
onto a tiny patch of globe centred on the room (`server/src/utils/geo.js`) with a
tangent-plane transform, **1 px = 0.1 m**, so:

| Product concept          | MongoDB                              |
| ------------------------ | ------------------------------------ |
| avatar at (x, y)         | `location: { type:'Point', [lon,lat]}` + `2dsphere` index |
| "who is in earshot"      | `find({ location: { $near: { $geometry, $maxDistance: 10 } } })` |
| "how many are close"     | `countDocuments({ location: { $geoWithin: { $centerSphere } } })` |
| "who is in this huddle"  | `$geoNear` aggregation + single-linkage clustering |

**Hot path vs. audit path.** With 50+ users at 10 Hz a round trip per keystroke would be
~500 queries/second just for movement, so movements land in an in-memory table
(`presenceStore`) and are flushed to MongoDB in `bulkWrite` batches every 500 ms
(`SPATIAL_QUERY_MODE=hybrid`, the default). MongoDB therefore always holds the same truth, it
is just written a fraction of a second behind; the earshot *routing* diff is O(n) in memory and
`$near` is re-used for the join snapshot, the per-room cluster refresh, the Spatial Audit and
the HTTP API. Set `SPATIAL_QUERY_MODE=mongo` to force every proximity lookup through
`$near`/`$geoWithin`.

### Signaling + mesh hygiene

`peerGraph.js` rebuilds the desired edges from geometry on every change and emits the **diff**:

* an edge exists iff two avatars are in the same room and within 100 px;
* an existing edge is never re-negotiated (no duplicates);
* leaving the radius emits `peer:hangup` immediately and bumps the edge `generation`, so a late
  ICE candidate from a dead call can never resurrect it;
* negotiation only starts once **both** sides reported `peer:media-ready` (i.e. both granted the
  microphone);
* the offerer is chosen deterministically (lexicographic socket id) — no WebRTC glare;
* the server refuses to relay any signal that has no live edge;
* connections that never complete are swept after 15 s and retried on the next radius change.

### Spatial audio (Web Audio)

Per remote peer:

```
MediaStreamAudioSource → BiquadFilter(lowpass) → Gain → StereoPanner → master → destination
                                                          ↘ Analyser (speaking ring, local only)
```

* **Distance → gain**: full inside 35 px, `1 - smoothstep(t)` from 35 px to 100 px, exactly 0 at
  100 px; all changes use `setTargetAtTime` so there is no zipper noise.
* **Offset → pan**: the listener's facing direction defines the right-hand vector, so a peer to
  your left is in your left ear and a peer behind you is centred.
* **Occlusion**: `soundFactor = Π attenuation` of every wall between the two avatars (computed
  server-side with a segment/AABB test, mirrored client-side for instant canvas feedback), plus a
  lowpass sweep so a voice through a wall is muffled, not just quiet.
* Geometry is updated at 20 Hz while the canvas renders at 60 FPS.

### 60 FPS

Two stacked canvases share one view transform: the **static** layer (floor, grid, furniture) is
repainted only on resize or room change, the **dynamic** layer repaints every frame. One
`requestAnimationFrame` loop runs physics, the throttled network send, the audio refresh and the
paint. No React state is touched during animation — positions live in refs.

---

## 3. Run steps

### 0. Requirements

Node.js 18.17+, MongoDB 6/7, Redis 6/7. Docker is optional (only for the compose file).

```bash
# start the databases (or use your own)
docker compose up -d
#   mongo  -> mongodb://127.0.0.1:27017
#   redis  -> redis://127.0.0.1:6379
# ...or natively:
#   mongod --dbpath ./data
#   redis-server
```

### 1. Configure

```bash
cp .env.example .env          # repo root; server/.env overrides it if present
cp client/.env.example client/.env
```

`.env` essentials: `PORT=4000`, `MONGO_URI`, `REDIS_URL`, `CLIENT_URL=http://localhost:5173`,
`STUN_URL=stun:stun.l.google.com:19302`, `EARSHT_RADIUS_PX=100`, `SPATIAL_AUDIT_BUDGET_MS=20`.

### 2. Install, seed, run

```bash
cd server && npm install
npm run seed                    # rooms + 2dsphere index (+ `npm run seed -- --users=50` for the audit)
npm start                       # http://localhost:4000

cd ../client && npm install
npm run dev                     # http://localhost:5173
```

Open **two browser windows** (or one normal + one private window), join the same room, allow the
microphone, and walk towards each other.

> Two normal tabs in the same browser profile also work — each tab is its own socket and its own
> `RTCPeerConnection`. For the cleanest audio demo use two different profiles or one private
> window, otherwise the browser may share one mic track between the tabs.

### 3. Prove it scales: two server instances with Redis

```bash
# terminal 1
cd server && PORT=4000 INSTANCE_ID=node-a npm start
# terminal 2
cd server && PORT=4001 INSTANCE_ID=node-b npm start
```

Point two client windows at each instance (`client/.env`: `VITE_SERVER_URL=http://localhost:4000`,
then `http://localhost:4001`). Put everybody in the same room and check:

* `curl localhost:4000/api/health` → `scaleMode: "redis"`, distinct `instanceId`;
* each status bar shows the instance its socket is attached to;
* a join in window A appears in window B **even though B is a different instance**
  (that is `@socket.io/redis-adapter` doing the fan-out);
* run the audit on one instance — the result is published to Redis and broadcast to the clients
  on the other instance (`audit:remote` toast).

Leave `REDIS_URL` empty and the server logs `single-instance mode` and still works — that is the
graceful-degradation path, not the recommended one.

### 4. 50+ concurrent users

```bash
cd server
npm run loadtest -- --clients=50 --duration=20
```

It joins N virtual clients, has them orbit in conversation clusters at 10 Hz, then prints join
count, mesh edges, hangups, ack latency avg/p95, error count, `/api/stats` and a spatial audit
taken **under load**.

---

## 4. Test checklist

### Mid-project review

**A. Spatial Audit — queries are correct, index-backed and under 20 ms**

```bash
cd server
npm run seed -- --users=50 --room=lobby     # 50 avatars so the index has something to chew on
npm run audit -- --room=lobby --x=960 --y=540 --radius=100 --samples=50
# or, against a running server:
curl "http://localhost:4000/api/spatial-audit?roomId=lobby&x=960&y=540&radius=100&samples=50"
```

| Check | Expected |
| --- | --- |
| `$near` p95 | `< 20 ms` (budget printed in the header) |
| `$geoWithin` p95 | `< 20 ms` |
| `$geoNear` cluster p95 | `< 20 ms` |
| operators agree | `$near` match count == `$geoWithin` count |
| false positives | `0` |
| distance drift | `< 1 px` between MongoDB's great-circle distance and pixel maths |
| winning plan | a geo/IXSCAN stage on `location_2dsphere` |
| clusters | conversation groups printed with sizes + member names |
| history | `curl "localhost:4000/api/spatial-audit/history?roomId=lobby"` → `worstP95Ms <= 20` |

The same report is stored in the `spatialaudits` collection, and the browser HUD has a
**Run $near audit** button that calls the endpoint and shows the same numbers.

**B. Audio check — two browsers establish a WebRTC call through the signaling server**

1. Two windows → same room → allow microphone.
2. Walk within 100 px: a solid line is drawn between the avatars, the *Nearby* list shows a
   positive gain, and the two rows switch to a live state once the ICE connection is up
   (`connected` chip in the mesh panel).
3. Walk apart: the link disappears the moment the edge dies.
4. Open devtools → *Network → WS*: you can see `peer:negotiate → peer:signal (offer) → answer →
   candidate` only for the in-range pair.
5. Deny the microphone in one window: that avatar is never negotiated (the gate explains why) and
   you can still hear everybody from the other window.

### Final review

| Area | How to demonstrate | Where to look |
| --- | --- | --- |
| 50+ users | `npm run loadtest -- --clients=50 --duration=20` | edges bounded (clusters, not N²), 0 errors, p95 ack latency |
| Horizontal scale | two instances on 4000/4001 | `api/health` shows `scaleMode: redis` + 2 instance ids; cross-instance joins |
| Mesh hygiene | walk in/out of the radius rapidly | `peer:hangup` count rises, `edges` never exceeds the geometric maximum, no duplicate connections (`api/stats`) |
| Statefulness | `kill -STOP` a server while others stay in the room | Redis adapter keeps the surviving instance usable; reconnect re-joins and re-negotiates automatically |
| Room persistence | edit a `Room` document in MongoDB and rejoin | layout + obstacles arrive in the join ack and are drawn/blocking |
| Obstacles | walk behind the concrete spine wall | link turns dashed/red, *Nearby* shows "through a wall", voice muffles and drops |
| Physics | click a far corner of the floor | avatar accelerates, decelerates and stops; slides along desks instead of sticking |
| Audio manipulation | turn to face a speaker / move away | stereo position follows facing, gain follows distance, no clicks or zipper noise |
| 60 FPS | look at the FPS readout while 50 avatars move | ~60 FPS, static layer never repainted |
| Edge cases | deny the mic, kill the tab, throttle the network, join a full room | clear messages, peers closed and removed from MongoDB, no leaked edges |
| Automated | `cd server && npm test` · `cd client && npm test` | 43 + 13 tests, including a full socket integration suite |