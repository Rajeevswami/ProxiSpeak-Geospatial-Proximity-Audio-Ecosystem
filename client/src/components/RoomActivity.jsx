/** Live room presence and a local, privacy-safe activity timeline (never a transcript). */
import { useProxi } from '../state/ProxiContext.jsx';
import { useUiTick } from '../hooks/useUiTick.js';

function PersonGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.3 19.2c.4-3.6 2.8-5.7 6.7-5.7s6.3 2.1 6.7 5.7" />
    </svg>
  );
}

const activityIcon = (kind) => {
  if (kind === 'speech') return '♪';
  if (kind === 'join') return '+';
  if (kind === 'leave') return '↗';
  if (kind === 'mic') return '◖';
  if (kind === 'quiet') return '—';
  if (kind === 'warning') return '!';
  if (kind === 'conversation') return '↔';
  return '·';
};

function timeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function RoomActivity() {
  const { state, worldRef, audioRef } = useProxi();
  useUiTick(300);

  const world = worldRef.current;
  const peers = [...world.peers.values()].sort((a, b) => {
    if (a.speaking !== b.speaking) return a.speaking ? -1 : 1;
    return Math.hypot(a.x - world.self.x, a.y - world.self.y) - Math.hypot(b.x - world.self.x, b.y - world.self.y);
  });
  const localSpeaking = audioRef.current?.isSpeaking ?? false;
  const peopleSpeaking = peers.filter((peer) => peer.speaking).length + Number(localSpeaking);
  const liveLinks = peers.filter((peer) => peer.connection === 'connected').length;
  const participants = [
    {
      id: world.self.id ?? 'self',
      name: `${world.self.name || 'You'} (you)`,
      color: world.self.color,
      speaking: localSpeaking,
      self: true,
      status: localSpeaking ? 'Speaking now' : state.mic.state === 'listen-only' ? 'Listening only' : state.muted ? 'Microphone muted' : 'In the office',
    },
    ...peers.map((peer) => {
      const distance = Math.hypot(peer.x - world.self.x, peer.y - world.self.y);
      const inRange = distance <= world.earshotRadiusPx;
      return {
        ...peer,
        self: false,
        speaking: peer.speaking === true,
        status: peer.speaking
          ? 'Speaking now'
          : peer.micEnabled === false
            ? 'Microphone off'
            : peer.connection === 'connected'
              ? 'In conversation'
              : inRange
                ? 'Connecting voice'
                : 'Across the room',
      };
    }),
  ];

  return (
    <section className="panel activity-panel">
      <header className="panel__header">
        <div>
          <p className="eyebrow">LIVE PRESENCE</p>
          <h2>In the room</h2>
        </div>
        <span className={`activity-live${peopleSpeaking ? ' activity-live--speaking' : ''}`}>
          <span />{peopleSpeaking ? `${peopleSpeaking} speaking` : `${liveLinks} live ${liveLinks === 1 ? 'link' : 'links'}`}
        </span>
      </header>

      <ul className="participant-list">
        {participants.slice(0, 6).map((person) => (
          <li key={person.id} className={`participant${person.speaking ? ' participant--speaking' : ''}`}>
            <span className="participant__avatar" style={{ '--person-color': person.color || '#79a9ff' }}>
              <PersonGlyph />
              {person.speaking && <span className="participant__wave">♪</span>}
            </span>
            <span className="participant__copy">
              <strong>{person.name}</strong>
              <small>{person.status}</small>
            </span>
            <span className={`participant__presence${person.speaking ? ' participant__presence--speaking' : ''}`} />
          </li>
        ))}
      </ul>
      {participants.length > 6 && <p className="activity-panel__more">+{participants.length - 6} more people in this room</p>}

      <div className="activity-feed">
        <div className="activity-feed__heading">
          <span>RECENT ACTIVITY</span>
          <span>{state.activity.length ? 'LIVE' : 'WAITING'}</span>
        </div>
        {state.activity.length ? (
          <ul className="activity-feed__list">
            {state.activity.slice(0, 5).map((item) => (
              <li key={item.id} className={`activity-item activity-item--${item.kind}`}>
                <span className="activity-item__icon">{activityIcon(item.kind)}</span>
                <span className="activity-item__message">{item.message}</span>
                <time>{timeLabel(item.at)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="activity-feed__empty">Room updates will appear here as people join, move into range, and speak.</p>
        )}
      </div>
      <p className="activity-panel__privacy">Activity only — voice is not recorded or transcribed.</p>
    </section>
  );
}

export default RoomActivity;
