import React from 'react';

interface DonePageProps {
    lastOutputPath: string;
    status: string;
    onConvertAnother: () => void;
    onOpenLocation: () => void;
    onExit: () => void;
}
  export const DonePage: React.FC<DonePageProps> = ({
    lastOutputPath,
    status,
    onConvertAnother,
    onOpenLocation,
    onExit,
  }) => {
    return (
        <section className="panel done-screen">
          <h1 className="done-title">Conversion Complete</h1>
          {lastOutputPath ? (
            <div className="file-save-block">
              <p className="helper label">File saved as</p>
              <p className="saved-path">{lastOutputPath}</p>
            </div>
          ) : (
            <p className="helper">{status || "Conversion finished."}</p>
          )}
          <div className="inline-fields">
            <button
              className="ghost"
              onClick={onConvertAnother}>
              Convert another file
            </button>
            <button
              className="ghost"
              onClick={onOpenLocation}
              disabled={!lastOutputPath}
            >
              Go to file
            </button>
            <button className="primary" onClick={onExit}>
              Exit
            </button>
          </div>
        </section>
    );
};