# Nightingale — Feature Roadmap

> Karaoke competition night and beyond. Organized by priority phase and feature area.

---

## Phase 1 — Party-Ready (Pre-Event Prep)

### 🌐 Remote Web Portal ("Nightingale Connect")

- [ ] Lightweight web server embedded in Nightingale (accessible over LAN / tunneled to internet)
- [ ] User account system — host creates invite links or username/password logins for friends/family
- [ ] Web-based song browser — guests search and browse the host's library from phone/laptop
- [ ] Remote playlist builder — logged-in users create and manage personal playlists from the web UI
- [ ] Song request & download queue — paste YouTube links for songs not in the library; host's instance downloads and analyzes automatically
- [ ] Playlist sync — playlists built remotely are ready to go when guests arrive, zero wait time
- [ ] QR code join — host generates a QR code on the TV screen; guests scan to open the web portal instantly
- [ ] 30-second song preview — quick audio preview in the web UI before adding to playlist

### 🎵 Enhanced Playlist & Queue System

- [ ] Per-user playlists — each profile has their own saved playlists (not just a flat song list)
- [ ] Party queue — shared live queue visible to everyone; users add songs from their playlists
- [ ] Queue fairness — round-robin auto-ordering so one person can't monopolize the queue
- [ ] Setlist mode — pre-arrange the entire evening's song order with drag-and-drop reordering
- [ ] "Up next" notification — push notification to a user's phone when they're 2 songs away

---

## Phase 2 — Competition Mode

### 🏆 Tournament System

- [ ] Bracket tournament — single elimination, round-robin, or Swiss-style brackets
- [ ] Round themes — "80s only," "Disney songs," "songs in Spanish," etc. — host sets constraints per round
- [ ] Blind scoring — audience doesn't see the pitch score until the performance ends (dramatic reveal)
- [ ] Judge panel mode — 1–3 designated judges score on style/performance (separate from pitch score), weighted composite
- [ ] Elimination & advancement — automatic advancement logic; losers go to redemption round or audience vote save
- [ ] Trophy / achievement system — "Perfect Pitch," "Crowd Favorite," "Iron Lungs" (longest held note), "Comeback King" badges

### 📊 Stats & History

- [ ] Performance history — every scored performance saved with date, song, score, key/tempo settings
- [ ] Personal bests — track improvement over time per song
- [ ] Head-to-head records — "You've beaten Ahmed 3 out of 5 times on this song"
- [ ] Season leaderboard — persistent scoring across multiple karaoke nights (weekly/monthly seasons)
- [ ] Export highlights — shareable image summary card of the night's results

---

## Phase 3 — Audience Engagement

### 📱 Audience Participation (Phone as Controller)

- [ ] Live reactions — audience taps emoji reactions on their phones that float across the TV screen (🔥 ❤️ 😂 👏)
- [ ] Audience vote — after each performance, audience votes 1–5 stars from their phone; results displayed live
- [ ] Song challenge — audience can vote to "challenge" a performer with a harder song
- [ ] Tip jar / hype meter — visual "hype bar" on screen that fills up based on audience engagement

### 🎙️ Duet & Group Mode

- [ ] Multi-mic support — 2–4 simultaneous microphone inputs with independent pitch tracking
- [ ] Split lyrics — color-coded lyric lines (Singer A = blue, Singer B = pink) for duets with automatic part assignment
- [ ] Harmony detection — score harmony accuracy when two singers perform together
- [ ] Group sing-along — designated "chorus" sections where everyone joins in (no scoring, just fun)

---

## Phase 4 — Polish & Presentation

### 📺 Party Display Mode

- [ ] Big screen UI — optimized layout for TV/projector: massive lyrics, minimal chrome, high contrast
- [ ] Live leaderboard overlay — persistent scoreboard in the corner during performances
- [ ] Performer cam — webcam PiP of the singer on screen
- [ ] Song intro cards — before each song: performer name, song title, artist — cinematic style with animations
- [ ] Intermission screen — auto-displays leaderboard standings, upcoming songs, and fun stats during breaks

### 🎨 Customization & Vibes

- [ ] Custom theme packs — upload your own background videos/images for the karaoke screen
- [ ] Crowd sound effects — applause, boo, airhorn, drumroll — triggerable from host's phone or keyboard
- [ ] Lyrics font/color customization — choose lyric display style per user preference
- [ ] Entrance music — each profile sets a 5-second walk-up clip that plays before their song starts

---

## Phase 5 — Smart Features & Content

### 🧠 Intelligence

- [ ] Song recommendations — "Based on your playlist, you might also like…" using genre/artist/era similarity
- [ ] Difficulty rating — auto-calculated per song based on vocal range, tempo, word density
- [ ] Vocal range test — quick mic test that determines a user's comfortable range; recommends songs and optimal key shifts
- [ ] Auto key-shift — automatically suggest the best key shift for each singer based on their vocal range profile
- [ ] Practice mode — slow down tempo, loop specific sections, see pitch graph in real-time for rehearsal

### 🔗 Content & Library

- [ ] YouTube import — paste a YouTube link → download → analyze → ready for karaoke
- [ ] Spotify playlist import — import a Spotify playlist as a wishlist; match against local library or trigger downloads
- [ ] Shared library across devices — multiple Nightingale instances on the same LAN share one song library
- [ ] Cloud backup — back up playlists, scores, and profiles to a cloud provider

---

## Priority Summary

| Phase | Focus | Key Outcome |
|-------|-------|-------------|
| **1** | Web Portal + Playlists | Friends prepare playlists before the party |
| **2** | Tournament + Stats | Structured competition with history |
| **3** | Audience + Duets | Everyone participates, even non-singers |
| **4** | Display + Customization | Feels like a real show |
| **5** | Smart Features + Content | Long-term quality of life |
