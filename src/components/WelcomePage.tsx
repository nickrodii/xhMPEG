import React from 'react';

interface WelcomePageProps {
    onPickMedia: () => void;
    loading: boolean;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onPickMedia, loading }) => {
    return (
        <section className="welcome-plain">
      <h1 className="brand-title">xhMPEG</h1>
      <p className="muted welcome-subtitle">
        Trim, resize, and reformat any audio or video file using FFmpeg... Without the terminal.
      </p>
      <button
        className="primary"
        onClick={onPickMedia}
        disabled={loading}
        style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20h16" />
          <path d="M12 4v9" />
          <path d="m8 10 4 4 4-4" />
        </svg>
        {loading ? "Analyzing..." : "Import media"}
      </button>
    </section>
    )
}