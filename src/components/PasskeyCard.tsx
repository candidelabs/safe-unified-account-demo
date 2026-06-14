import { useState } from 'react';

interface PasskeyCardProps {
  handleCreatePasskeyClick: () => void;
  onSignIn: (address: string) => Promise<void>;
}

function PasskeyCard({ handleCreatePasskeyClick, onSignIn }: PasskeyCardProps) {
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const submitSignIn = async () => {
    setBusy(true);
    try {
      await onSignIn(address.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card create-account-card">
      <h2 className="create-account-title">
        {mode === 'create' ? 'Create your Safe Unified Account' : 'Sign in to your account'}
      </h2>
      <p className="create-account-subtitle">
        {mode === 'create'
          ? 'One smart account at the same address on every chain.'
          : 'Enter your account address. Your passkey signs the rest.'}
      </p>

      {mode === 'create' ? (
        <>
          <ul className="create-account-features">
            <li className="create-account-feature">
              <span className="create-account-feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h4l3 -8 4 16 3 -8h4" />
                </svg>
              </span>
              <div className="create-account-feature-text">
                <strong>Unified balance</strong>
                <span>One number across every chain. Spend from any in a single signature.</span>
              </div>
            </li>
            <li className="create-account-feature">
              <span className="create-account-feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-3.51-7.13" />
                  <path d="M21 4v5h-5" />
                </svg>
              </span>
              <div className="create-account-feature-text">
                <strong>Account synced everywhere</strong>
                <span>Update signers or rotate recovery methods once. The change applies on every chain.</span>
              </div>
            </li>
            <li className="create-account-feature">
              <span className="create-account-feature-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
                  <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
                  <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
                  <path d="M2 12a10 10 0 0 1 18-6" />
                  <path d="M2 16h.01" />
                  <path d="M21.8 16c.2-2 .131-5.354 0-6" />
                  <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
                  <path d="M8.65 22c.21-.66.45-1.32.57-2" />
                  <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
                </svg>
              </span>
              <div className="create-account-feature-text">
                <strong>No seed phrase</strong>
                <span>Just Face ID, Touch ID, or a security key.</span>
              </div>
            </li>
          </ul>
          <button className="primary-button" onClick={handleCreatePasskeyClick}>
            Create Account
          </button>
          <button className="link-button" onClick={() => setMode('signin')}>
            Already have an account? Sign in
          </button>
        </>
      ) : (
        <>
          <input
            className="address-input"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && address.trim() && !busy) submitSignIn(); }}
          />
          <button
            className="primary-button"
            onClick={submitSignIn}
            disabled={busy || address.trim().length === 0}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <button className="link-button" onClick={() => setMode('create')}>
            Create a new account instead
          </button>
        </>
      )}
    </div>
  );
}

export { PasskeyCard };
