/** Join gate: permission is requested from the button click so browser mic/autoplay policies work. */
import { useEffect, useState } from 'react';
import { useProxi } from '../state/ProxiContext.jsx';
import config from '../config.js';

const CUSTOM_ROOM = '__custom__';
const DEFAULT_ROOMS = [
  { roomId: 'lobby', name: 'Lobby', description: 'Open team workspace', liveUsers: 0 },
  { roomId: 'studio', name: 'Studio', description: 'Quiet focus and creative work', liveUsers: 0 },
  { roomId: 'lounge', name: 'Lounge', description: 'Informal conversations', liveUsers: 0 },
];
const SWATCHES = ['#79a9ff', '#ff8178', '#ffc76a', '#65d6ae', '#bc93ff', '#ff9f67'];

export function MicGate() {
  const { state, join, requestMicrophone } = useProxi();
  const [rooms, setRooms] = useState(DEFAULT_ROOMS);
  const [roomId, setRoomId] = useState(() => localStorage.getItem('proxispeak:room') ?? config.defaultRoom);
  const [roomChoice, setRoomChoice] = useState(() => {
    const saved = localStorage.getItem('proxispeak:room') ?? config.defaultRoom;
    return DEFAULT_ROOMS.some((room) => room.roomId === saved) ? saved : CUSTOM_ROOM;
  });
  const [name, setName] = useState(() => localStorage.getItem('proxispeak:name') ?? '');
  const [color, setColor] = useState(() => localStorage.getItem('proxispeak:color') ?? SWATCHES[0]);
  const [avatar, setAvatar] = useState('circle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`${config.serverUrl}/api/rooms`)
      .then((response) => {
        if (!response.ok) throw new Error(`room catalogue returned ${response.status}`);
        return response.json();
      })
      .then(({ rooms: fetchedRooms = [] }) => {
        if (!active || !Array.isArray(fetchedRooms)) return;
        const unique = new Map(DEFAULT_ROOMS.map((room) => [room.roomId, room]));
        fetchedRooms.forEach((room) => {
          if (room?.roomId) unique.set(room.roomId, { ...unique.get(room.roomId), ...room });
        });
        setRooms([...unique.values()]);
      })
      .catch(() => {
        // The known rooms remain selectable when the room list is offline.
      });
    return () => { active = false; };
  }, []);

  const busyState = busy || state.status === 'connecting';

  const doJoin = async (withMic) => {
    const normalizedRoom = roomId.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(normalizedRoom)) {
      setError('Choose a room or enter a room ID using letters, numbers, hyphens, or underscores.');
      return;
    }
    setBusy(true);
    setError(null);
    localStorage.setItem('proxispeak:name', name);
    localStorage.setItem('proxispeak:color', color);
    localStorage.setItem('proxispeak:room', normalizedRoom);
    try {
      if (withMic) await requestMicrophone();
      await join({ roomId: normalizedRoom, name, color, avatar, withMic });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gate">
      <section className="gate__intro">
        <p className="eyebrow gate__eyebrow">A workspace that sounds like a real one</p>
        <h1 className="gate__title">
          Close the distance.
          <span>Find your voice.</span>
        </h1>
        <p className="gate__subtitle">
          Walk across the office to join a conversation. Get closer to hear clearly, then move away when you need space.
        </p>

        <div className="gate__feature-grid">
          <article className="feature-card">
            <span className="feature-card__icon" aria-hidden="true">↗</span>
            <div>
              <strong>Move to talk</strong>
              <p>Walk within 100 pixels to connect.</p>
            </div>
          </article>
          <article className="feature-card">
            <span className="feature-card__icon feature-card__icon--blue" aria-hidden="true">◖</span>
            <div>
              <strong>Hear the space</strong>
              <p>Volume and stereo position follow you.</p>
            </div>
          </article>
        </div>

        <div className="gate__privacy">
          <span className="privacy-dot" />
          <span>Your voice travels peer-to-peer. ProxiSpeak does not record it.</span>
        </div>
      </section>

      <form
        className="gate__card"
        onSubmit={(event) => {
          event.preventDefault();
          void doJoin(true);
        }}
      >
        <div className="gate__card-heading">
          <div>
            <p className="eyebrow">GET STARTED</p>
            <h2>Join an office</h2>
          </div>
          <span className="gate__card-icon" aria-hidden="true">✳</span>
        </div>
        <p className="gate__card-copy">Choose your name and room. Allow microphone access to talk.</p>

        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Ada Lovelace"
            maxLength={24}
            autoComplete="nickname"
            autoFocus
          />
        </label>

        <div className="field">
          <span>Choose your room</span>
          <div className="select-wrap">
            <span className="select-wrap__icon" aria-hidden="true">⌂</span>
            <select
              value={roomChoice}
              onChange={(event) => {
                const nextRoom = event.target.value;
                setRoomChoice(nextRoom);
                setRoomId(nextRoom === CUSTOM_ROOM ? '' : nextRoom);
              }}
              aria-label="Choose an office room"
            >
              {rooms.map((room) => (
                <option key={room.roomId} value={room.roomId}>
                  {room.name}{room.liveUsers ? ` · ${room.liveUsers} here` : ''}
                </option>
              ))}
              <option value={CUSTOM_ROOM}>＋ Create a room…</option>
            </select>
            <span className="select-wrap__chevron" aria-hidden="true">⌄</span>
          </div>
          {roomChoice === CUSTOM_ROOM ? (
            <div className="input-with-icon">
              <span aria-hidden="true">＋</span>
              <input
                value={roomId}
                onChange={(event) => setRoomId(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48))}
                maxLength={48}
                placeholder="e.g. design-team"
                autoComplete="off"
                aria-label="New room ID"
              />
            </div>
          ) : (
            <small>{rooms.find((room) => room.roomId === roomChoice)?.description || 'Join people in this shared room.'}</small>
          )}
        </div>

        <div className="field">
          <span>Choose your look</span>
          <div className="avatar-picker">
            <div className="gate__swatches" aria-label="Avatar colour">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`swatch${color === swatch ? ' swatch--active' : ''}`}
                  style={{ '--swatch': swatch }}
                  onClick={() => setColor(swatch)}
                  aria-label={`Choose ${swatch} avatar colour`}
                  aria-pressed={color === swatch}
                />
              ))}
              <label className="custom-color" title="Choose a custom colour">
                <span aria-hidden="true">＋</span>
                <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Custom avatar colour" />
              </label>
            </div>
            <div className="gate__avatars" aria-label="Avatar shape">
              {AVATARS.map((shape) => (
                <button
                  key={shape}
                  type="button"
                  className={`shape shape--${shape}${avatar === shape ? ' shape--active' : ''}`}
                  style={{ '--avatar-color': color }}
                  onClick={() => setAvatar(shape)}
                  aria-label={`Choose ${shape} avatar`}
                  aria-pressed={avatar === shape}
                />
              ))}
            </div>
          </div>
        </div>

        {state.mic.error && <div className="alert alert--error">{state.mic.error}</div>}
        {error && <div className="alert alert--error">{error}</div>}

        <div className="gate__actions">
          <button type="submit" className="button button--primary" disabled={busyState}>
            <span>{busyState ? 'Connecting…' : 'Join with microphone'}</span>
            {!busyState && <span aria-hidden="true">→</span>}
          </button>
          <button type="button" className="button button--quiet" disabled={busyState} onClick={() => void doJoin(false)}>
            Listen only
          </button>
        </div>

        <p className="gate__note">
          To hear someone, join the same room in a second browser window and move within the blue hearing circle.
        </p>
      </form>
    </main>
  );
}

export default MicGate;
