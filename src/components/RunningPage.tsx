import React from 'react';

export const RunningPage: React.FC = () => {
    return (
        <section className="panel run-screen">
            <h2>Running conversion...</h2>
            <div className="progress">
                <div className="progress-bar smooth" />
            </div>
            <p className="helper">Please wait...</p>
        </section>
    );
};