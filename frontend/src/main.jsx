import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRoom } from './network/useRoom.js';
import { Rules } from './components/Rules.jsx';
import { Header } from './components/Header.jsx';
import { Landing } from './components/Landing.jsx';
import { GameRoom } from './components/GameRoom.jsx';
import { Icon } from './components/Icons.jsx';
import './styles.css';
import './premium.css';
import { soundManager } from './audio/SoundManager.js';
function App() {
  useEffect(() => soundManager.bindGestures(), []);
  const api = useRoom(),
    [rules, setRules] = useState(false);
  return (
    <>
      <Header connected={api.connected} showRules={() => setRules(true)} />
      {api.error && (
        <div role="alert" className="error-banner">
          <span>{api.error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => api.setError('')}
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      )}
      {api.room && !api.connected && (
        <div className="reconnect-banner" role="status">
          Reconnecting to your table… Your seat is saved in this browser.
        </div>
      )}
      {api.room ? <GameRoom api={api} /> : <Landing api={api} />}
      <footer className="footer">
        <span>Made for the “one more game” people.</span>
        <span>
          LUDO UNLIMITED <span className="footer-star">✦</span> PLAY. CONNECT. REPEAT.
        </span>
      </footer>
      {rules && <Rules onClose={() => setRules(false)} />}
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);
