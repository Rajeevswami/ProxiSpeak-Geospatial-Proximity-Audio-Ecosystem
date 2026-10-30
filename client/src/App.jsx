import { ProxiProvider, useProxi } from './state/ProxiContext.jsx';
import { WorldCanvas } from './canvas/WorldCanvas.jsx';
import { MicGate } from './components/MicGate.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { PeerList } from './components/PeerList.jsx';
import { RoomActivity } from './components/RoomActivity.jsx';
import { AuditPanel } from './components/AuditPanel.jsx';
import { SoundLegend } from './components/SoundLegend.jsx';
import { Notices } from './components/Notices.jsx';

function Office() {
  const { state } = useProxi();

  if (!state.selfId) {
    return (
      <div className="app app--gate">
        <StatusBar />
        <MicGate />
        <Notices />
      </div>
    );
  }

  return (
    <div className="app app--room">
      <StatusBar />
      <main className="workspace">
        <div className="workspace__intro">
          <div>
            <p className="eyebrow">LIVE OFFICE · {state.room?.roomId ?? 'lobby'}</p>
            <h1>{state.room?.name ?? 'Your office'}</h1>
            <p className="workspace__description">
              Move around naturally. Voices get clearer as you come closer.
            </p>
          </div>
          <div className="workspace__summary" aria-label="Room summary">
            <div className="summary-card">
              <span className="summary-card__value">{state.roster.length + 1}</span>
              <span className="summary-card__label">in office</span>
            </div>
            <div className="summary-card summary-card--accent">
              <span className="summary-card__value">{state.server.earshotRadiusPx ?? 100}px</span>
              <span className="summary-card__label">voice range</span>
            </div>
          </div>
        </div>

        <div className="app__body">
          <WorldCanvas />
          <aside className="app__sidebar">
            <PeerList />
            <RoomActivity />
            <SoundLegend />
            <AuditPanel />
          </aside>
        </div>
      </main>
      <Notices />
    </div>
  );
}

export function App() {
  return (
    <ProxiProvider>
      <Office />
    </ProxiProvider>
  );
}

export default App;
