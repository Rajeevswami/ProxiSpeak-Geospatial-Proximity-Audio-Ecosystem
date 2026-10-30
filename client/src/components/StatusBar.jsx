/** Workspace identity, connection health and in-call audio controls. */
import { useState } from 'react';
import { useProxi } from '../state/ProxiContext.jsx';
import { useUiTick } from '../hooks/useUiTick.js';

const LABELS = {
  idle: 'Waiting to connect',
  connecting: 'Connecting…',
  online: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection error',
};

function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="4" fill="currentColor" />
          <circle cx="20" cy="20" r="10" stroke="currentColor" strokeWidth="2" opacity=".72" />
          <circle cx="20" cy="20" r="17" stroke="currentColor" strokeWidth="1.5" opacity=".34" />
          <path d="M20 3v6M37 20h-6M20 37v-6M3 20h6" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
        </svg>
      </span>
      <span className="brand__copy">
        <strong>ProxiSpeak</strong>
        <small>SPATIAL AUDIO</small>
      </span>
    </div>
  );
}

export function StatusBar() {
  const { state, worldRef, leave, toggleMute, setVolume, audioRef, dispatch } = useProxi();
  const [testing, setTesting] = useState(false);
  useUiTick(250);

  const world = worldRef.current;
  const peers = [...world.peers.values()];
  const inEarshot = peers.filter((peer) => Math.hypot(peer.x - world.self.x, peer.y - world.self.y) <= world.earshotRadiusPx).length;
  const localLevel = audioRef.current?.getLocalLevel() ?? 0;
  const micReady = state.mic.state === 'ready';
  const audioState = audioRef.current?.contextState ?? 'not-started';

  const testSpeaker = async () => {
    setTesting(true);
    try {
      await audioRef.current?.playTestTone();
    } catch (error) {
      dispatch({ type: 'notice', notice: { level: 'error', message: `Speaker test failed: ${error.message}` } });
    } finally {
      window.setTimeout(() => setTesting(false), 450);
    }
  };

  if (!state.selfId) {
    return (
      <header className="statusbar statusbar--guest">
        <Brand />
        <div className={`connection-pill connection-pill--${state.status}`}>
          <span className={`dot dot--${state.status}`} />
          <span>{LABELS[state.status] ?? state.status}</span>
        </div>
      </header>
    );
  }

  return (
    <header className="statusbar statusbar--room">
      <div className="statusbar__identity">
        <Brand />
        <span className="statusbar__divider" />
        <div className="room-badge">
          <span className="room-badge__label">ROOM</span>
          <strong>{state.room?.name ?? 'Office'}</strong>
        </div>
      </div>

      <div className="statusbar__presence">
        <span className={`dot dot--${state.status}`} />
        <span>{LABELS[state.status] ?? state.status}</span>
        {state.statusDetail && <span className="statusbar__detail">{state.statusDetail}</span>}
        <span className="statusbar__presence-divider" />
        <span>{peers.length + 1} in office</span>
        <span className="statusbar__range">{inEarshot} nearby</span>
      </div>

      <div className="statusbar__controls">
        <div className={`mic-health${micReady ? ' mic-health--ready' : ''}`} title={`Microphone: ${state.mic.state}; audio: ${audioState}`}>
          <span className="mic-health__dot" />
          <span className="mic-health__label">{micReady ? (state.muted ? 'Mic muted' : 'Mic live') : state.mic.state === 'listen-only' ? 'Listen only' : 'Mic off'}</span>
          <span className="mic-meter" aria-label="Microphone input level">
            <span style={{ width: `${Math.min(100, Math.round(localLevel * 800))}%` }} />
          </span>
        </div>

        <button className="button button--test" type="button" onClick={() => void testSpeaker()} title="Play a short tone to test your speakers">
          <span aria-hidden="true">{testing ? '♪' : '◖'}</span>
          <span>{testing ? 'Testing' : 'Test sound'}</span>
        </button>

        <label className="volume" title={`Output volume ${Math.round(state.masterVolume * 100)}%`}>
          <span aria-hidden="true">◖</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={state.masterVolume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Output volume"
          />
        </label>

        <button
          className={`button button--mic${state.muted ? ' button--active' : ''}`}
          type="button"
          onClick={toggleMute}
          disabled={!micReady}
          title={micReady ? (state.muted ? 'Turn microphone on' : 'Mute your microphone') : 'Join with microphone to use this control'}
        >
          {state.muted ? 'Unmute mic' : 'Mute mic'}
        </button>
        <button className="button button--leave" type="button" onClick={leave}>Leave</button>
      </div>
    </header>
  );
}

export default StatusBar;
