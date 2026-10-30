/** Nearby participants and actionable voice-connection guidance. */
import { useProxi } from '../state/ProxiContext.jsx';
import { useUiTick } from '../hooks/useUiTick.js';
import { gainAtDistance, panAtDistance } from '../audio/spatialMath.js';

export function PeerList() {
  const { state, worldRef, audioRef, inputRef } = useProxi();
  useUiTick(200);

  const world = worldRef.current;
  const self = world.self;
  const rows = [...world.peers.values()]
    .map((peer) => {
      const dx = peer.x - self.x;
      const dy = peer.y - self.y;
      const distancePx = Math.hypot(dx, dy);
      const soundFactor = peer.soundFactor ?? 1;
      const gain = gainAtDistance(distancePx, {
        earshotPx: world.earshotRadiusPx,
        fullVolumePx: 35,
        soundFactor,
      });
      const pan = panAtDistance({ dx, dy, distancePx, listenerAngle: self.angle, earshotPx: world.earshotRadiusPx });
      return { peer, distancePx, gain, pan, soundFactor, level: audioRef.current?.getLevel(peer.id) ?? 0 };
    })
    .sort((a, b) => b.gain - a.gain || a.distancePx - b.distancePx);

  const inEarshot = rows.filter((row) => row.distancePx <= world.earshotRadiusPx).length;
  const connected = rows.filter((row) => row.peer.connection === 'connected').length;
  const micReady = state.mic.state === 'ready';

  const walkCloser = (peer) => {
    const room = world.room ?? state.room;
    const dx = self.x - peer.x;
    const dy = self.y - peer.y;
    const distance = Math.hypot(dx, dy) || 1;
    const targetGap = Math.min(58, world.earshotRadiusPx * 0.55);
    const width = room?.width ?? 1920;
    const height = room?.height ?? 1080;
    inputRef.current.moveTarget = {
      x: Math.max(20, Math.min(width - 20, peer.x + (dx / distance) * targetGap)),
      y: Math.max(20, Math.min(height - 20, peer.y + (dy / distance) * targetGap)),
    };
  };

  let guide;
  if (!rows.length) {
    guide = {
      tone: 'quiet',
      title: 'Your office is ready',
      text: 'Open this same address in a second browser window or on another device. Join the same room to meet someone.',
    };
  } else if (!micReady) {
    guide = {
      tone: 'quiet',
      title: 'You joined in listen-only mode',
      text: 'You can hear nearby people. To speak, leave and rejoin with microphone access enabled.',
    };
  } else if (!inEarshot) {
    guide = {
      tone: 'warm',
      title: 'Your teammates are out of range',
      text: `Move within ${world.earshotRadiusPx}px of an avatar. Use the approach button or click near them on the map.`,
    };
  } else if (!connected) {
    guide = {
      tone: 'warm',
      title: 'Starting the voice link…',
      text: 'Keep both browser windows open and make sure microphone permission is allowed in each one.',
    };
  } else {
    guide = {
      tone: 'live',
      title: `${connected} voice connection${connected === 1 ? '' : 's'} live`,
      text: 'Talk normally. Move closer for full volume or farther away to fade out.',
    };
  }

  return (
    <section className="panel peers">
      <header className="panel__header">
        <div>
          <p className="eyebrow">PEOPLE AROUND YOU</p>
          <h2>Nearby</h2>
        </div>
        <span className={`nearby-count${inEarshot ? ' nearby-count--active' : ''}`}>
          <strong>{inEarshot}</strong>
          <small>in range</small>
        </span>
      </header>

      <div className={`voice-guide voice-guide--${guide.tone}`}>
        <span className="voice-guide__icon" aria-hidden="true">{guide.tone === 'live' ? '♪' : guide.tone === 'warm' ? '↔' : '◌'}</span>
        <div>
          <strong>{guide.title}</strong>
          <p>{guide.text}</p>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="peers__list">
          {rows.map(({ peer, distancePx, gain, pan, soundFactor, level }) => {
            const isConnected = peer.connection === 'connected';
            return (
              <li key={peer.id} className={`peer${isConnected ? ' peer--live' : ''}`}>
                <span className="peer__avatar-wrap">
                  <span className="peer__avatar" style={{ background: peer.color }} />
                  {peer.speaking && <span className="peer__speaking-dot" />}
                </span>
                <div className="peer__body">
                  <div className="peer__title">
                    <span className="peer__name">{peer.name}</span>
                    {peer.micEnabled === false && <span className="chip chip--muted">mic off</span>}
                    {peer.speaking && <span className="chip chip--speaking">speaking</span>}
                    {soundFactor < 0.5 && <span className="chip chip--blocked">muffled</span>}
                  </div>
                  <div className="peer__meter" aria-label={`Voice level ${Math.round(gain * 100)} percent`}>
                    <div className="peer__gain" style={{ width: `${Math.round(gain * 100)}%` }} />
                    <div className="peer__level" style={{ width: `${Math.min(100, level * 400)}%` }} />
                  </div>
                  <span className="peer__connection">
                    <span className={`connection-dot${isConnected ? ' connection-dot--live' : ''}`} />
                    {isConnected
                      ? 'voice connected'
                      : peer.connection === 'failed'
                        ? 'connection failed'
                        : peer.connection === 'out-of-range' || distancePx > world.earshotRadiusPx
                          ? 'outside voice range'
                          : 'connecting'}
                  </span>
                </div>
                <div className="peer__numbers">
                  <span className="peer__distance">{Math.round(distancePx)}<small>px</small></span>
                  <span>{pan > 0.05 ? `R ${Math.round(pan * 100)}%` : pan < -0.05 ? `L ${Math.round(-pan * 100)}%` : 'center'}</span>
                  {distancePx > world.earshotRadiusPx && (
                    <button className="peer__approach" type="button" onClick={() => walkCloser(peer)}>
                      Walk closer
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default PeerList;
