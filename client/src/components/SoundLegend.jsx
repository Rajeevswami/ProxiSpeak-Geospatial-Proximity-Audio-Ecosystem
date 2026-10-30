/** Short, human-friendly guide to movement and proximity audio. */
import { useProxi } from '../state/ProxiContext.jsx';

export function SoundLegend() {
  const { worldRef } = useProxi();
  const earshot = worldRef.current.earshotRadiusPx;

  return (
    <section className="panel legend">
      <header className="panel__header">
        <div>
          <p className="eyebrow">A QUICK GUIDE</p>
          <h2>How to talk</h2>
        </div>
        <span className="legend__icon" aria-hidden="true">⌘</span>
      </header>
      <ol className="legend__steps">
        <li>
          <span className="legend__number">01</span>
          <span><strong>Find a teammate</strong><small>Join the same room in another window or device.</small></span>
        </li>
        <li>
          <span className="legend__number">02</span>
          <span><strong>Move into range</strong><small>Use WASD, arrow keys or click near their avatar.</small></span>
        </li>
        <li>
          <span className="legend__number">03</span>
          <span><strong>Talk naturally</strong><small>Within {earshot}px you can hear one another.</small></span>
        </li>
      </ol>
      <div className="legend__range">
        <span className="legend__range-bar"><span /></span>
        <span>Closer = clearer voice</span>
      </div>
    </section>
  );
}

export default SoundLegend;
