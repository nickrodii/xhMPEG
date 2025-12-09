import React from 'react';

interface SettingsPageProps {
    advancedMode: boolean;
    setAdvancedMode: (value: boolean) => void;

    autoOpenExit: boolean;
    setAutoOpenExit: (value: boolean) => void;

    enableCodecSelection: boolean;
    setEnableCodecSelection: (value: boolean) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
    advancedMode,
    setAdvancedMode,
    autoOpenExit,
    setAutoOpenExit,
    enableCodecSelection,
    setEnableCodecSelection,
}) => {
    return (
    <>
      <h2 className="settings-heading">Settings</h2>
      <section className="panel settings-panel">
        <label className="advanced-toggle">
          <input
            type="checkbox"
            checked={advancedMode}
            onChange={(e) => setAdvancedMode(e.target.checked)}
          />
          <span className="label">Advanced Mode</span>
        </label>
        <label className="advanced-toggle">
          <input
            type="checkbox"
            checked={autoOpenExit}
            onChange={(e) => setAutoOpenExit(e.target.checked)}
          />
          <span className="label">Open location and exit after conversion</span>
        </label>
        <label className="advanced-toggle">
          <input
            type="checkbox"
            checked={enableCodecSelection}
            onChange={(e) => setEnableCodecSelection(e.target.checked)}
          />
          <span className="label">Allow codec selection</span>
        </label>
      </section>
    </>
  );
}